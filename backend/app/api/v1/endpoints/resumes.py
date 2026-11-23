"""
Resume management and real AI/ATS intelligence API routes backed by MongoDB Atlas
and Secure Cloud Object Storage (Cloudflare R2 / AWS S3 / Local).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import APIRouter, Body, Depends, File, HTTPException, Response, UploadFile, status
from pydantic import BaseModel

from app.core.dependencies import get_current_user, require_role
from app.core.storage import storage_manager
from app.db.mongodb import get_database
from app.services.question_bank import build_assessment_for_skill
from app.services.resume_intelligence import (
    analyze_resume_against_job,
    compute_and_store_readiness,
    extract_text_from_bytes,
    generate_tailored_roadmap,
    match_resume_to_job_ai,
    optimize_resume_bullets_ai,
    optimize_resume_for_job,
    parse_resume_content,
    parse_resume_hybrid_ai,
    recalculate_job_matches_for_user,
)
from app.services.skill_normalizer import classify_semantic_skills

logger = logging.getLogger(__name__)
router = APIRouter()


class ResumeTargetRequest(BaseModel):
    job_id: Optional[str] = None
    job_title: Optional[str] = None
    job_description: Optional[str] = None
    required_skills: Optional[List[str]] = None


class ApproveOptimizationRequest(BaseModel):
    approved_bullets: List[Dict[str, Any]] = []


def _serialize_resume(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(doc["_id"]),
        "resume_id": str(doc["_id"]),
        "user_id": doc.get("user_id"),
        "student_id": doc.get("user_id"),
        "filename": doc.get("filename"),
        "original_filename": doc.get("original_filename") or doc.get("filename"),
        "storage_key": doc.get("storage_key"),
        "storage_provider": doc.get("storage_provider", "cloudflare_r2"),
        "content_type": doc.get("content_type", "application/pdf"),
        "file_type": doc.get("file_type"),
        "file_size": doc.get("file_size", 0),
        "document_hash": doc.get("document_hash", ""),
        "version": doc.get("version", 1),
        "is_active": doc.get("is_active", False),
        "processing_status": doc.get("processing_status", "completed"),
        "processing_error": doc.get("processing_error"),
        "uploaded_at": doc["uploaded_at"].isoformat() if isinstance(doc.get("uploaded_at"), datetime) else doc.get("uploaded_at"),
        "upload_timestamp": doc["uploaded_at"].isoformat() if isinstance(doc.get("uploaded_at"), datetime) else doc.get("uploaded_at"),
        "ats_score": doc.get("ats_score", 0.0),
        "ats_breakdown": doc.get("ats_breakdown", {}),
        "metrics": doc.get("metrics", {}),
        "suggestions": doc.get("suggestions", []),
        "candidate_name": doc.get("candidate_name", ""),
        "email": doc.get("email", ""),
        "phone": doc.get("phone", ""),
        "github_url": doc.get("github_url", ""),
        "linkedin_url": doc.get("linkedin_url", ""),
        "college": doc.get("college", ""),
        "degree": doc.get("degree", ""),
        "branch": doc.get("branch", ""),
        "graduation_year": doc.get("graduation_year"),
        "cgpa": doc.get("cgpa"),
        "detected_skills": doc.get("detected_skills", []),
        "detected_projects": doc.get("detected_projects", []),
        "detected_certifications": doc.get("detected_certifications", []),
        "education": doc.get("education", []),
        "experience": doc.get("experience", []),
        "extracted_text": doc.get("extracted_text", ""),
        "extraction_metadata": doc.get("extraction_metadata", {
            "method": "deterministic_fallback",
            "model": "regex-taxonomy-v1",
            "fallback_used": True,
        }),
        "semantic_skills": doc.get("semantic_skills", {}),
        "optimization_suggestions": doc.get("optimization_suggestions", []),
    }


async def _get_owned_resume(resume_id: str, current_user: Dict[str, Any], db: Any) -> Dict[str, Any]:
    uid = current_user.get("firebase_uid")
    role = str(current_user.get("role", "STUDENT")).upper()

    if resume_id == "current":
        doc = await db.resumes.find_one({"user_id": uid, "is_active": True})
        if not doc:
            doc = await db.resumes.find_one({"user_id": uid}, sort=[("uploaded_at", -1)])
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active resume found")
        return doc

    try:
        oid = ObjectId(resume_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid resume ID format")

    doc = await db.resumes.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    if doc["user_id"] != uid and role not in ("ADMIN", "SUPER_ADMIN"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this resume")

    return doc


@router.post("/upload", response_model=Dict[str, Any])
async def upload_resume(
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(require_role(["STUDENT", "ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """
    Upload resume (.pdf/.docx/.txt) into Cloud Object Storage (Cloudflare R2 / S3),
    validate magic bytes, save metadata in MongoDB Atlas, and execute intelligence analysis.
    """
    uid = current_user["firebase_uid"]
    raw_bytes = await file.read()
    await file.seek(0)

    # 1. Validate magic bytes, size, and upload directly to Cloud Object Storage
    storage_key, saved_filename, file_size, doc_hash, provider = await storage_manager.save_resume_bytes(
        user_id=uid,
        filename=file.filename or "resume.pdf",
        raw_bytes=raw_bytes,
        declared_content_type=file.content_type or "",
    )
    file_type = Path(saved_filename).suffix.lower().lstrip(".") or "txt"
    content_type = file.content_type or ("application/pdf" if file_type == "pdf" else "text/plain")

    now = datetime.now(timezone.utc)
    existing_count = await db.resumes.count_documents({"user_id": uid})
    version = existing_count + 1

    await db.resumes.update_many(
        {"user_id": uid},
        {"$set": {"is_active": False}},
    )

    # 2. Record initial metadata in MongoDB Atlas (never lost even if parsing fails)
    resume_doc = {
        "user_id": uid,
        "filename": saved_filename,
        "original_filename": file.filename or saved_filename,
        "storage_key": storage_key,
        "storage_provider": provider,
        "content_type": content_type,
        "file_type": file_type,
        "file_size": file_size,
        "document_hash": doc_hash,
        "processing_status": "processing",
        "processing_error": None,
        "extracted_text": "",
        "uploaded_at": now,
        "version": version,
        "is_active": True,
        "ats_score": 0.0,
        "ats_breakdown": {},
        "metrics": {},
        "suggestions": [],
        "candidate_name": current_user.get("display_name") or "",
        "email": current_user.get("email") or "",
        "phone": "",
        "github_url": "",
        "linkedin_url": "",
        "college": "",
        "degree": "",
        "branch": "",
        "graduation_year": None,
        "cgpa": None,
        "detected_skills": [],
        "detected_projects": [],
        "detected_certifications": [],
        "education": [],
        "experience": [],
    }
    res_insert = await db.resumes.insert_one(resume_doc)
    resume_id = str(res_insert.inserted_id)

    # 3. Safe Resume Parsing & Intelligence Adaptation (Hybrid AI + Deterministic Fallback)
    parsing_error: Optional[str] = None
    parsed: Dict[str, Any] = {}
    extracted_text = ""

    try:
        extracted_text = extract_text_from_bytes(raw_bytes, saved_filename)
        parsed = await parse_resume_hybrid_ai(
            raw_text=extracted_text,
            filename=saved_filename,
            fallback_name=current_user.get("display_name") or "",
            fallback_email=current_user.get("email") or "",
        )
    except Exception as exc:
        logger.error(f"Resume text extraction/parsing failed for {saved_filename}: {exc}", exc_info=True)
        parsing_error = str(exc)

    if parsing_error:
        # Mark as failed in DB, but keep cloud storage and metadata intact!
        await db.resumes.update_one(
            {"_id": res_insert.inserted_id},
            {"$set": {"processing_status": "failed", "processing_error": parsing_error}},
        )
        # Log failure audit
        await db.audit_logs.insert_one({
            "action": "resume_upload_parsing_failed",
            "user_id": uid,
            "resume_id": resume_id,
            "filename": saved_filename,
            "error": parsing_error,
            "timestamp": now,
        })
        return {
            "id": resume_id,
            "resume_id": resume_id,
            "filename": saved_filename,
            "storage_key": storage_key,
            "storage_provider": provider,
            "version": version,
            "processing_status": "failed",
            "processing_error": parsing_error,
            "message": "Resume uploaded to cloud storage, but automated text analysis encountered an error.",
        }

    # 4. Successful parse: update document with intelligence fields
    update_fields = {
        "processing_status": "completed",
        "processing_error": None,
        "extracted_text": extracted_text,
        "ats_score": parsed["ats_score"],
        "ats_breakdown": parsed["ats_breakdown"],
        "metrics": parsed["metrics"],
        "suggestions": parsed["suggestions"],
        "candidate_name": parsed["candidate_name"],
        "email": parsed["email"],
        "phone": parsed["phone"],
        "github_url": parsed["github_url"],
        "linkedin_url": parsed["linkedin_url"],
        "college": parsed["college"],
        "degree": parsed["degree"],
        "branch": parsed["branch"],
        "graduation_year": parsed["graduation_year"],
        "cgpa": parsed["cgpa"],
        "detected_skills": parsed["extracted_skills"],
        "detected_projects": parsed["detected_projects"],
        "detected_certifications": parsed["detected_certifications"],
        "education": parsed["education"],
        "experience": parsed["experience"],
        "semantic_skills": parsed.get("semantic_skills", {}),
        "optimization_suggestions": parsed.get("optimization_suggestions", []),
        "extraction_metadata": parsed.get("extraction_metadata", {}),
    }
    await db.resumes.update_one({"_id": res_insert.inserted_id}, {"$set": update_fields})

    # Log audit entry
    await db.audit_logs.insert_one({
        "action": "resume_upload_success",
        "user_id": uid,
        "resume_id": resume_id,
        "filename": saved_filename,
        "storage_provider": provider,
        "storage_key": storage_key,
        "file_size": file_size,
        "document_hash": doc_hash,
        "extraction_method": parsed.get("extraction_metadata", {}).get("method", "deterministic_fallback"),
        "timestamp": now,
    })

    await db.resume_extraction_history.insert_one({
        "user_id": uid,
        "resume_id": resume_id,
        "filename": saved_filename,
        "version": version,
        "skills_found": parsed["skill_names"],
        "ats_score": parsed["ats_score"],
        "extraction_metadata": parsed.get("extraction_metadata", {}),
        "extracted_at": now,
    })

    # 5. Profile synchronization
    profile = await db.student_profiles.find_one({"user_id": uid}) or {}
    profile_updates: Dict[str, Any] = {"updated_at": now}
    for field in ("college", "degree", "branch", "phone", "github_url", "linkedin_url"):
        parsed_val = parsed.get(field)
        if parsed_val and not (profile.get(field) or "").strip():
            profile_updates[field] = parsed_val
    if parsed.get("graduation_year") and not profile.get("graduation_year"):
        profile_updates["graduation_year"] = parsed["graduation_year"]
    if parsed.get("cgpa") is not None and profile.get("cgpa") is None:
        profile_updates["cgpa"] = parsed["cgpa"]
    if parsed.get("candidate_name") and not (profile.get("full_name") or "").strip():
        profile_updates["full_name"] = parsed["candidate_name"]

    if profile:
        await db.student_profiles.update_one({"user_id": uid}, {"$set": profile_updates})
    else:
        await db.student_profiles.insert_one({
            "user_id": uid,
            "full_name": parsed.get("candidate_name") or current_user.get("display_name") or "",
            "email": current_user.get("email") or "",
            "phone": parsed.get("phone") or "",
            "college": parsed.get("college") or "",
            "degree": parsed.get("degree") or "",
            "branch": parsed.get("branch") or "",
            "graduation_year": parsed.get("graduation_year"),
            "semester": None,
            "cgpa": parsed.get("cgpa"),
            "backlogs": 0,
            "github_url": parsed.get("github_url") or "",
            "linkedin_url": parsed.get("linkedin_url") or "",
            "portfolio_url": "",
            "target_roles": [],
            "preferred_locations": [],
            "preferred_work_modes": [],
            "created_at": now,
            "updated_at": now,
        })

    updated_profile = await db.student_profiles.find_one({"user_id": uid})

    # 6. Extracted Skills & Assessments setup
    verified_docs = await db.verified_skills.find({"user_id": uid}).to_list(length=100)
    verified_names = {d.get("skill", d.get("skill_name", "")).lower() for d in verified_docs}

    await db.extracted_skills.delete_many({"user_id": uid})

    skill_docs: List[Dict[str, Any]] = []
    for item in parsed["extracted_skills"]:
        status_val = "verified" if item["skill_name"].lower() in verified_names else "unverified"
        skill_docs.append({
            "user_id": uid,
            "resume_id": resume_id,
            "skill_name": item["skill_name"],
            "category": item.get("category", "Other"),
            "source_evidence": item.get("source_evidence", ""),
            "confidence": item.get("confidence", 0.8),
            "related_project_or_experience": item.get("related_project_or_experience"),
            "extraction_method": item.get("extraction_method", "deterministic_fallback"),
            "assessment_status": status_val,
            "extracted_at": now,
        })

    if skill_docs:
        await db.extracted_skills.insert_many(skill_docs)

    for item in parsed["extracted_skills"]:
        for size in (5, 10):
            assessment_id = f"test-{item['skill_name'].lower().replace(' ', '-').replace('/', '-')}-{size}"
            existing_asmt = await db.assessments.find_one({"id": assessment_id})
            if not existing_asmt:
                asmt_doc = build_assessment_for_skill(
                    skill_name=item["skill_name"],
                    category=item["category"],
                    size=size,
                )
                await db.assessments.insert_one({**asmt_doc, "created_at": now, "updated_at": now})

    roadmap = await generate_tailored_roadmap(uid, parsed["extracted_skills"], updated_profile, db)
    job_matches = await recalculate_job_matches_for_user(uid, db)
    readiness = await compute_and_store_readiness(uid, db)

    await db.notifications.insert_one({
        "user_id": uid,
        "title": f"Resume Parsed (v{version}): {len(parsed['skill_names'])} Skills Detected",
        "message": (
            f"Analyzed {saved_filename} (ATS Score: {parsed['ats_score']}%). "
            f"Extraction method: {parsed.get('extraction_metadata', {}).get('method', 'deterministic')}. "
            "Your Skill Matrix, 4-Week Roadmap, Job Matches, and Readiness Score have been updated."
        ),
        "type": "resume",
        "is_read": False,
        "created_at": now,
    })

    return {
        "id": resume_id,
        "resume_id": resume_id,
        "filename": saved_filename,
        "storage_key": storage_key,
        "storage_provider": provider,
        "version": version,
        "ats_score": parsed["ats_score"],
        "ats_breakdown": parsed["ats_breakdown"],
        "metrics": parsed["metrics"],
        "suggestions": parsed["suggestions"],
        "candidate_name": parsed["candidate_name"],
        "college": parsed["college"],
        "degree": parsed["degree"],
        "cgpa": parsed["cgpa"],
        "extracted_skills": parsed["skill_names"],
        "detected_skills": parsed["extracted_skills"],
        "detected_projects": parsed["detected_projects"],
        "detected_certifications": parsed["detected_certifications"],
        "semantic_skills": parsed.get("semantic_skills", {}),
        "extraction_metadata": parsed.get("extraction_metadata", {}),
        "optimization_suggestions": parsed.get("optimization_suggestions", []),
        "roadmap_generated": roadmap is not None,
        "job_matches_updated": len(job_matches),
        "readiness_score": readiness["overall_score"],
        "processing_status": "completed",
        "message": "Resume uploaded to cloud storage, parsed, and workspace personalized successfully",
    }


@router.get("/current")
async def get_current_resume(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Get the user's active parsed resume document, or has_resume=False if none uploaded."""
    uid = current_user["firebase_uid"]
    doc = await db.resumes.find_one({"user_id": uid, "is_active": True})
    if not doc:
        doc = await db.resumes.find_one({"user_id": uid}, sort=[("uploaded_at", -1)])
    if not doc:
        return {"has_resume": False, "resume": None}
    return {"has_resume": True, "resume": _serialize_resume(doc)}


@router.get("")
async def list_my_resumes(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """List resumes owned exclusively by the authenticated user."""
    uid = current_user["firebase_uid"]
    docs = await db.resumes.find({"user_id": uid}).sort("uploaded_at", -1).to_list(length=50)
    return [_serialize_resume(doc) for doc in docs]


@router.get("/{resume_id}/download-url")
async def get_resume_download_url(
    resume_id: str,
    expires_in: int = 900,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    Generate a short-lived authenticated signed URL to download the document.
    Enforces student ownership validation and logs audit telemetry.
    """
    doc = await _get_owned_resume(resume_id, current_user, db)
    clean_expires = max(60, min(86400, expires_in))
    filename = doc.get("original_filename") or doc.get("filename") or "resume.pdf"

    signed_url = await storage_manager.generate_signed_url(
        storage_key=doc["storage_key"],
        expires_in_seconds=clean_expires,
        download_filename=filename,
    )

    # Audit log
    await db.audit_logs.insert_one({
        "action": "resume_signed_url_generated",
        "user_id": current_user["firebase_uid"],
        "resume_id": str(doc["_id"]),
        "storage_key": doc["storage_key"],
        "storage_provider": doc.get("storage_provider", "cloudflare_r2"),
        "expires_in_seconds": clean_expires,
        "timestamp": datetime.now(timezone.utc),
    })

    return {
        "resume_id": str(doc["_id"]),
        "download_url": signed_url,
        "expires_in_seconds": clean_expires,
        "filename": filename,
        "storage_provider": doc.get("storage_provider", "cloudflare_r2"),
    }


@router.get("/download/signed")
async def download_signed_local_resume(
    token: str,
    filename: Optional[str] = None,
):
    """
    Signed URL endpoint for LocalStorageProvider and MongoStorageProvider.
    Validates HMAC cryptographic signature and expiration timestamp, serving the document.
    """
    from app.core.cloud_storage import LocalStorageProvider, MongoStorageProvider

    local_p = LocalStorageProvider()
    mongo_p = MongoStorageProvider()
    verified = local_p.verify_token(token) or mongo_p.verify_token(token)
    if not verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Signed download token is invalid or has expired.",
        )

    storage_key = verified["storage_key"]
    file_bytes = None
    if await local_p.object_exists(storage_key):
        file_bytes = await local_p.download_bytes(storage_key)
    elif await mongo_p.object_exists(storage_key):
        file_bytes = await mongo_p.download_bytes(storage_key)
    else:
        from app.core.cloud_storage import get_storage_provider
        try:
            file_bytes = await get_storage_provider().download_bytes(storage_key)
        except Exception:
            pass

    if file_bytes is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume document binary not found in storage.",
        )

    clean_filename = filename or verified.get("filename") or "resume.pdf"
    ext = Path(clean_filename).suffix.lower()
    media_type = "application/pdf" if ext == ".pdf" else ("text/plain" if ext == ".txt" else "application/octet-stream")

    return Response(
        content=file_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{clean_filename}"'},
    )


@router.get("/{resume_id}/download")
async def download_resume(
    resume_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    Download resume securely after checking ownership.
    Streams document directly from the active cloud object storage provider.
    """
    doc = await _get_owned_resume(resume_id, current_user, db)
    storage_key = doc["storage_key"]
    filename = doc.get("original_filename") or doc.get("filename") or "resume.pdf"
    content_type = doc.get("content_type", "application/octet-stream")

    try:
        data = await storage_manager.download_resume_bytes(storage_key)
    except Exception:
        # Fallback to local file path if present on host
        try:
            local_path = storage_manager.get_file_path(storage_key)
            with open(local_path, "rb") as f:
                data = f.read()
        except Exception:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume document not found in storage.")

    # Audit log
    await db.audit_logs.insert_one({
        "action": "resume_direct_download",
        "user_id": current_user["firebase_uid"],
        "resume_id": str(doc["_id"]),
        "storage_key": storage_key,
        "timestamp": datetime.now(timezone.utc),
    })

    return Response(
        content=data,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{resume_id}/analyze")
async def analyze_resume(
    resume_id: str,
    payload: Optional[ResumeTargetRequest] = Body(default=None),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Analyze the student's actual resume text & extracted skills against a target role or ATS baseline."""
    doc = await _get_owned_resume(resume_id, current_user, db)

    job_title = payload.job_title if payload else None
    job_desc = payload.job_description if payload else None
    req_skills = payload.required_skills if payload else None

    if payload and payload.job_id:
        try:
            job_doc = await db.jobs.find_one({"_id": ObjectId(payload.job_id)})
            if job_doc:
                job_title = job_title or job_doc.get("title")
                job_desc = job_desc or job_doc.get("description")
                req_skills = req_skills or job_doc.get("required_skills", [])
        except Exception:
            pass

    skill_names = [s.get("skill_name") for s in doc.get("detected_skills", []) if s.get("skill_name")]
    return analyze_resume_against_job(
        extracted_text=doc.get("extracted_text", ""),
        extracted_skills=skill_names,
        job_title=job_title,
        job_description=job_desc,
        required_skills=req_skills,
    )


@router.post("/{resume_id}/optimize")
async def optimize_resume(
    resume_id: str,
    payload: Optional[ResumeTargetRequest] = Body(default=None),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Generate authentic, resume-grounded bullet rewrites and keyword recommendations."""
    doc = await _get_owned_resume(resume_id, current_user, db)

    job_title = payload.job_title if payload else None
    job_desc = payload.job_description if payload else None
    req_skills = payload.required_skills if payload else None

    if payload and payload.job_id:
        try:
            job_doc = await db.jobs.find_one({"_id": ObjectId(payload.job_id)})
            if job_doc:
                job_title = job_title or job_doc.get("title")
                job_desc = job_desc or job_doc.get("description")
                req_skills = req_skills or job_doc.get("required_skills", [])
        except Exception:
            pass

    skill_names = [s.get("skill_name") for s in doc.get("detected_skills", []) if s.get("skill_name")]
    return optimize_resume_for_job(
        extracted_text=doc.get("extracted_text", ""),
        extracted_skills=skill_names,
        projects=doc.get("detected_projects", []),
        job_title=job_title,
        job_description=job_desc,
        required_skills=req_skills,
    )


@router.delete("/{resume_id}")
async def delete_resume(
    resume_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Delete a resume from cloud object storage and recalculate dependent student profile metrics."""
    doc = await _get_owned_resume(resume_id, current_user, db)
    uid = doc["user_id"]

    # Delete from object storage
    await storage_manager.delete_resume(doc["storage_key"])
    await db.resumes.delete_one({"_id": doc["_id"]})

    # Audit log
    await db.audit_logs.insert_one({
        "action": "resume_delete",
        "user_id": uid,
        "resume_id": str(doc["_id"]),
        "storage_key": doc.get("storage_key"),
        "timestamp": datetime.now(timezone.utc),
    })

    latest_other = await db.resumes.find_one({"user_id": uid}, sort=[("uploaded_at", -1)])
    if latest_other:
        await db.resumes.update_one({"_id": latest_other["_id"]}, {"$set": {"is_active": True}})
    else:
        await db.extracted_skills.delete_many({"user_id": uid})
        await db.roadmaps.delete_many({"user_id": uid})
        await recalculate_job_matches_for_user(uid, db)

    await compute_and_store_readiness(uid, db)
    return {"message": "Resume deleted cleanly from cloud storage and database"}


@router.post("/{resume_id}/reprocess-ai")
async def reprocess_resume_ai(
    resume_id: str,
    current_user: Dict[str, Any] = Depends(require_role(["STUDENT", "ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """
    Manually re-run the hybrid Gemini AI extraction pipeline on an existing resume.
    Accessible to student owner and administrators.
    """
    doc = await _get_owned_resume(resume_id, current_user, db)
    uid = doc["user_id"]
    filename = doc.get("filename", "resume.pdf")

    # Retrieve text directly or re-extract from object storage
    extracted_text = doc.get("extracted_text") or ""
    if not extracted_text:
        try:
            raw_bytes = await storage_manager.download_resume_bytes(doc["storage_key"])
            extracted_text = extract_text_from_bytes(raw_bytes, filename)
        except Exception as exc:
            logger.error(f"Failed to download resume bytes for reprocessing: {exc}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unable to read resume bytes for reprocessing: {exc}",
            )

    parsed = await parse_resume_hybrid_ai(
        raw_text=extracted_text,
        filename=filename,
        fallback_name=doc.get("candidate_name") or current_user.get("display_name") or "",
        fallback_email=doc.get("email") or current_user.get("email") or "",
    )

    now = datetime.now(timezone.utc)
    update_fields = {
        "processing_status": "completed",
        "processing_error": None,
        "extracted_text": extracted_text,
        "ats_score": parsed["ats_score"],
        "ats_breakdown": parsed["ats_breakdown"],
        "metrics": parsed["metrics"],
        "suggestions": parsed["suggestions"],
        "candidate_name": parsed["candidate_name"],
        "email": parsed["email"],
        "phone": parsed["phone"],
        "github_url": parsed["github_url"],
        "linkedin_url": parsed["linkedin_url"],
        "college": parsed["college"],
        "degree": parsed["degree"],
        "branch": parsed["branch"],
        "graduation_year": parsed["graduation_year"],
        "cgpa": parsed["cgpa"],
        "detected_skills": parsed["extracted_skills"],
        "detected_projects": parsed["detected_projects"],
        "detected_certifications": parsed["detected_certifications"],
        "education": parsed["education"],
        "experience": parsed["experience"],
        "semantic_skills": parsed.get("semantic_skills", {}),
        "optimization_suggestions": parsed.get("optimization_suggestions", []),
        "extraction_metadata": parsed.get("extraction_metadata", {}),
        "updated_at": now,
    }
    await db.resumes.update_one({"_id": doc["_id"]}, {"$set": update_fields})

    # Sync skills
    verified_docs = await db.verified_skills.find({"user_id": uid}).to_list(length=100)
    verified_names = {d.get("skill", d.get("skill_name", "")).lower() for d in verified_docs}

    await db.extracted_skills.delete_many({"user_id": uid})
    skill_docs: List[Dict[str, Any]] = []
    for item in parsed["extracted_skills"]:
        status_val = "verified" if item["skill_name"].lower() in verified_names else "unverified"
        skill_docs.append({
            "user_id": uid,
            "resume_id": str(doc["_id"]),
            "skill_name": item["skill_name"],
            "category": item.get("category", "Other"),
            "source_evidence": item.get("source_evidence", ""),
            "confidence": item.get("confidence", 0.8),
            "related_project_or_experience": item.get("related_project_or_experience"),
            "extraction_method": item.get("extraction_method", "deterministic_fallback"),
            "assessment_status": status_val,
            "extracted_at": now,
        })
    if skill_docs:
        await db.extracted_skills.insert_many(skill_docs)

    for item in parsed["extracted_skills"]:
        for size in (5, 10):
            assessment_id = f"test-{item['skill_name'].lower().replace(' ', '-').replace('/', '-')}-{size}"
            existing_asmt = await db.assessments.find_one({"id": assessment_id})
            if not existing_asmt:
                asmt_doc = build_assessment_for_skill(
                    skill_name=item["skill_name"],
                    category=item["category"],
                    size=size,
                )
                await db.assessments.insert_one({**asmt_doc, "created_at": now, "updated_at": now})

    updated_profile = await db.student_profiles.find_one({"user_id": uid})
    await generate_tailored_roadmap(uid, parsed["extracted_skills"], updated_profile, db)
    await recalculate_job_matches_for_user(uid, db)
    await compute_and_store_readiness(uid, db)

    await db.audit_logs.insert_one({
        "action": "resume_reprocessed_ai",
        "user_id": current_user["firebase_uid"],
        "resume_id": str(doc["_id"]),
        "extraction_method": parsed.get("extraction_metadata", {}).get("method"),
        "timestamp": now,
    })

    updated_doc = await db.resumes.find_one({"_id": doc["_id"]})
    return {
        "message": "Resume reprocessed successfully",
        "resume": _serialize_resume(updated_doc),
        "extraction_metadata": parsed.get("extraction_metadata", {}),
    }


@router.post("/{resume_id}/optimize-ai")
async def optimize_resume_ai(
    resume_id: str,
    payload: Optional[ResumeTargetRequest] = Body(default=None),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    Generate STAR-format bullet rewrites with active power verbs.
    Strictly forbids fabricating numbers, experience, or certifications.
    Requires student review and explicit approval before applying.
    """
    doc = await _get_owned_resume(resume_id, current_user, db)
    target_role = payload.job_title if payload else None

    result = await optimize_resume_bullets_ai(
        extracted_text=doc.get("extracted_text", ""),
        projects=doc.get("detected_projects", []),
        target_role=target_role,
    )
    return result


@router.post("/{resume_id}/approve-optimization")
async def approve_resume_optimization(
    resume_id: str,
    payload: ApproveOptimizationRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    Persist student-approved bullet optimizations into their active resume record.
    Logs audit trail for compliance.
    """
    doc = await _get_owned_resume(resume_id, current_user, db)
    now = datetime.now(timezone.utc)

    # Mark bullets as approved
    approved_list = []
    for bullet in payload.approved_bullets:
        approved_list.append({
            **bullet,
            "student_approved": True,
            "approved_at": now.isoformat(),
        })

    await db.resumes.update_one(
        {"_id": doc["_id"]},
        {"$set": {"optimization_suggestions": approved_list, "updated_at": now}},
    )

    await db.audit_logs.insert_one({
        "action": "resume_optimization_approved",
        "user_id": current_user["firebase_uid"],
        "resume_id": str(doc["_id"]),
        "approved_count": len(approved_list),
        "timestamp": now,
    })

    return {
        "message": f"Successfully approved {len(approved_list)} bullet optimizations",
        "approved_bullets": approved_list,
    }


@router.post("/{resume_id}/match-job-ai")
async def match_resume_to_job_ai_endpoint(
    resume_id: str,
    payload: ResumeTargetRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    AI-driven explainable job matching comparing candidate profile against job description.
    """
    doc = await _get_owned_resume(resume_id, current_user, db)

    job_title = payload.job_title or "Target Role"
    job_desc = payload.job_description or ""
    req_skills = payload.required_skills or []

    if payload.job_id:
        try:
            job_doc = await db.jobs.find_one({"_id": ObjectId(payload.job_id)})
            if job_doc:
                job_title = job_title or job_doc.get("title", "Target Role")
                job_desc = job_desc or job_doc.get("description", "")
                req_skills = req_skills or job_doc.get("required_skills", [])
        except Exception:
            pass

    skill_names = [s.get("skill_name") for s in doc.get("detected_skills", []) if s.get("skill_name")]

    return await match_resume_to_job_ai(
        extracted_text=doc.get("extracted_text", ""),
        extracted_skills=skill_names,
        job_title=job_title,
        job_description=job_desc,
        required_skills=req_skills,
    )


@router.get("/{resume_id}/semantic-skills")
async def get_resume_semantic_skills(
    resume_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    Retrieve semantic skill classification ontology:
    Core skills, Supporting skills, Missing skills, Related skills, Outdated skills, and Skills to Assess.
    """
    doc = await _get_owned_resume(resume_id, current_user, db)
    stored = doc.get("semantic_skills")
    if stored and isinstance(stored, dict) and stored.get("core_skills"):
        return stored

    # Compute on the fly if not already stored
    skill_names = [s.get("skill_name") for s in doc.get("detected_skills", []) if s.get("skill_name")]
    semantic = classify_semantic_skills(skill_names, doc.get("extracted_text", ""))
    return semantic.model_dump()
