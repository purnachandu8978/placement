"""
Skill verification credentials, College-Verified Identity assessments,
and public digital credential verification endpoints backed by MongoDB Atlas.
"""

from __future__ import annotations

from datetime import datetime, timezone
import io
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel

from app.core.dependencies import get_current_user, get_optional_user, require_role
from app.db.mongodb import get_database
from app.schemas.verification import (
    PublicCredentialVerificationResponse,
    StartAssessmentRequest,
    StartAssessmentResponse,
    StudentCredentialResponse,
    StudentVerificationStatusOverview,
    SubmitAssessmentRequest,
    SubmitAssessmentResponse,
    VerificationLevel,
)
from app.services.college_verification_service import (
    generate_certificate_pdf_bytes,
    get_public_credential,
    get_student_verification_overview,
    start_verification_assessment,
    submit_verification_assessment,
)

router = APIRouter()


class VerificationRequestCreate(BaseModel):
    skill_name: str
    proof_url: str
    notes: str = ""


class VisibilityToggleRequest(BaseModel):
    public_visibility: bool


# ---------------------------------------------------------------------------
# Student College Verification Assessment Endpoints
# ---------------------------------------------------------------------------

@router.get("/status", response_model=StudentVerificationStatusOverview)
async def get_verification_status_overview(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    Retrieve student's verification level, active credentials, history, and assessment eligibility.
    """
    uid = current_user["firebase_uid"]
    overview = await get_student_verification_overview(uid, db)
    return overview


@router.post("/assessment/start", response_model=StartAssessmentResponse)
async def start_assessment_session(
    payload: StartAssessmentRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    Initiate a 5-minute (Blue Verified) or 10-minute (Green Fully Verified) competency assessment.
    Enforces server-side time tracking; never exposes correct answers or grading keys.
    """
    uid = current_user["firebase_uid"]
    level_str = payload.level.value if hasattr(payload.level, "value") else str(payload.level)
    skill_focus = payload.skill_focus or "Full Stack & Core CS"

    try:
        result = await start_verification_assessment(
            user_id=uid,
            level=level_str,
            skill_focus=skill_focus,
            db=db,
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/assessment/submit", response_model=SubmitAssessmentResponse)
async def submit_assessment_session(
    payload: SubmitAssessmentRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    Submit verification assessment answers for server-side scoring.
    Enforces time constraints. If passed, generates cryptographic credential and updates readiness.
    """
    uid = current_user["firebase_uid"]
    answers_data = [a.model_dump() for a in payload.answers]

    try:
        result = await submit_verification_assessment(
            user_id=uid,
            attempt_id=payload.attempt_id,
            answers=answers_data,
            db=db,
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/credentials/{credential_id}")
async def get_credential_detail(
    credential_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Fetch student's credential details and verification metadata."""
    cred = await db.student_credentials.find_one({"credential_id": credential_id})
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")

    cred["id"] = str(cred.get("_id"))
    if isinstance(cred.get("issued_at"), datetime):
        cred["issued_at"] = cred["issued_at"].isoformat()
    if isinstance(cred.get("expires_at"), datetime):
        cred["expires_at"] = cred["expires_at"].isoformat()

    return cred


@router.get("/credentials/{credential_id}/pdf")
async def download_credential_pdf(
    credential_id: str,
    db=Depends(get_database),
):
    """
    Generate and stream an institutional landscape A4 PDF Certificate with custom borders,
    gold seal, QR code verification block, and digital authentication statement.
    """
    cred = await db.student_credentials.find_one({
        "$or": [
            {"credential_id": credential_id},
            {"serial_number": credential_id},
            {"credential_id": credential_id.upper()},
            {"serial_number": credential_id.upper()},
        ]
    })
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")

    profile = await db.student_profiles.find_one({"user_id": cred["user_id"]})
    template = None
    if cred.get("template_id"):
        template = await db.certificate_templates.find_one({"template_id": cred["template_id"]})
    pdf_bytes = generate_certificate_pdf_bytes(cred, profile, template)

    filename = f"Certificate_{cred.get('serial_number') or credential_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "public, max-age=86400",
        },
    )


@router.patch("/credentials/{credential_id}/visibility")
async def toggle_credential_visibility(
    credential_id: str,
    payload: VisibilityToggleRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Allow students to control whether their credential details are visible to public verifiers."""
    uid = current_user["firebase_uid"]
    cred = await db.student_credentials.find_one({"credential_id": credential_id, "user_id": uid})
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found or unauthorized")

    await db.student_credentials.update_one(
        {"_id": cred["_id"]},
        {"$set": {"public_visibility": payload.public_visibility, "updated_at": datetime.now(timezone.utc)}}
    )
    return {"success": True, "public_visibility": payload.public_visibility}


# ---------------------------------------------------------------------------
# Public Digital Credential Verification Endpoint (No Authentication Required)
# ---------------------------------------------------------------------------

@router.get("/verify/{verification_hash}")
async def public_verify_badge(verification_hash: str, db=Depends(get_database)):
    """
    Public, read-only credential lookup for employers & recruiters.
    Prevents enumeration and strictly avoids exposing private student PII.
    """
    try:
        data = await get_public_credential(verification_hash, db)
        return data
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Verified Portfolio & Manual Requests (Preserved for compatibility)
# ---------------------------------------------------------------------------

@router.get("")
async def get_my_verified_portfolio(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Retrieve student's real verified badges, pending requests, and computed trust score."""
    uid = current_user["firebase_uid"]
    verified_docs = await db.verified_skills.find({"user_id": uid}).to_list(length=100)
    requests_docs = await db.verification_requests.find({"user_id": uid}).sort("created_at", -1).to_list(length=50)

    items: List[Dict[str, Any]] = []
    scores: List[float] = []
    for doc in verified_docs:
        doc_id = str(doc.pop("_id"))
        if isinstance(doc.get("verification_date"), datetime):
            doc["verification_date"] = doc["verification_date"].isoformat()
        score = float(doc.get("score", 80.0))
        scores.append(score)
        items.append({"id": doc_id, **doc})

    req_items: List[Dict[str, Any]] = []
    for r in requests_docs:
        rid = str(r.pop("_id"))
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
        if isinstance(r.get("reviewed_at"), datetime):
            r["reviewed_at"] = r["reviewed_at"].isoformat()
        req_items.append({"id": rid, **r})

    if not items:
        trust_score = 0.0
    else:
        avg_score = sum(scores) / len(scores)
        breadth_factor = min(1.0, 0.5 + len(items) * 0.125)
        trust_score = round(min(100.0, avg_score * breadth_factor), 1)

    return {
        "verified_skills": items,
        "verification_requests": req_items,
        "total_verified": len(items),
        "trust_score": trust_score,
    }


@router.post("/request")
async def submit_verification_request(
    req: VerificationRequestCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Allow a student to submit external proof for Admin verification."""
    proof = (req.proof_url or "").strip()
    if len(proof) < 8 or not (proof.startswith("http://") or proof.startswith("https://")):
        raise HTTPException(status_code=400, detail="Valid http(s) proof URL is required")

    now = datetime.now(timezone.utc)
    doc = {
        "user_id": current_user["firebase_uid"],
        "student_email": current_user.get("email"),
        "student_name": current_user.get("display_name"),
        "skill_name": req.skill_name.strip(),
        "proof_url": proof,
        "notes": req.notes.strip(),
        "status": "pending",
        "created_at": now,
    }
    res = await db.verification_requests.insert_one(doc)
    return {
        "id": str(res.inserted_id),
        "status": "pending",
        "message": "Verification request queued for placement admin audit",
    }
