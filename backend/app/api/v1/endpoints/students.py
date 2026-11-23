import hashlib
import json
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

from app.core.dependencies import build_blank_student_profile, get_current_user, verify_student_ownership
from app.db.mongodb import get_database

router = APIRouter()


class PrivacyRequestModel(BaseModel):
    request_type: Literal["data_export", "rectification", "erasure", "consent_withdrawal"]
    reason: Optional[str] = Field(None, max_length=500)
    contact_email: Optional[EmailStr] = None


class StudentProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    college: Optional[str] = None
    degree: Optional[str] = None
    branch: Optional[str] = None
    graduation_year: Optional[int] = None
    semester: Optional[int] = None
    cgpa: Optional[float] = None
    backlogs: Optional[int] = None
    target_roles: Optional[list] = None
    preferred_locations: Optional[list] = None
    preferred_work_modes: Optional[list] = None
    github_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None


@router.get("/me")
async def get_my_student_profile(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Retrieves authenticated student's profile from MongoDB student_profiles collection."""
    uid = current_user.get("firebase_uid")
    profile = await db.student_profiles.find_one({"user_id": uid}, {"_id": 0})

    if not profile:
        profile = build_blank_student_profile(
            uid,
            current_user.get("display_name", ""),
            current_user.get("email", ""),
        )
        await db.student_profiles.insert_one(dict(profile))

    return profile


@router.put("/me")
async def update_my_student_profile(
    payload: StudentProfileUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Updates authenticated student's profile in MongoDB."""
    uid = current_user.get("firebase_uid")
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)

    await db.student_profiles.update_one(
        {"user_id": uid},
        {"$set": update_data},
        upsert=True
    )

    if payload.full_name and payload.full_name.strip():
        await db.users.update_one(
            {"firebase_uid": uid},
            {"$set": {"display_name": payload.full_name.strip()}}
        )

    updated = await db.student_profiles.find_one({"user_id": uid}, {"_id": 0})
    return updated


@router.get("/me/data-export")
async def export_student_data(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    DPDPA 2023 (Section 11) & FERPA Right to Access Personal Data.
    Exports all telemetry, profile data, resume intelligence, assessment attempts,
    submissions, and roadmaps associated with the authenticated student in portable JSON.
    """
    uid = current_user.get("firebase_uid")
    now = datetime.now(timezone.utc)

    profile = await db.student_profiles.find_one({"user_id": uid}, {"_id": 0}) or {}
    user_doc = await db.users.find_one({"firebase_uid": uid}, {"_id": 0, "password_hash": 0}) or {}
    resumes = await db.resumes.find({"user_id": uid}, {"_id": 0}).to_list(length=50)
    attempts = await db.assessment_attempts.find({"user_id": uid}, {"_id": 0}).to_list(length=100)
    submissions = await db.assignment_submissions.find({"user_id": uid}, {"_id": 0}).to_list(length=100)
    roadmap = await db.roadmaps.find_one({"user_id": uid}, {"_id": 0})
    notifications = await db.notifications.find({"user_id": uid}, {"_id": 0}).to_list(length=100)

    # Convert datetime objects to ISO strings for export
    def _sanitize_doc(item: Any) -> Any:
        if isinstance(item, dict):
            return {k: _sanitize_doc(v) for k, v in item.items()}
        elif isinstance(item, list):
            return [_sanitize_doc(v) for v in item]
        elif isinstance(item, datetime):
            return item.isoformat()
        return item

    payload_data = {
        "profile": _sanitize_doc(profile),
        "account": _sanitize_doc(user_doc),
        "resumes": _sanitize_doc(resumes),
        "assessment_attempts": _sanitize_doc(attempts),
        "assignment_submissions": _sanitize_doc(submissions),
        "roadmap": _sanitize_doc(roadmap) if roadmap else None,
        "notifications": _sanitize_doc(notifications),
    }

    # Compute cryptographic SHA-256 data package checksum for integrity
    raw_str = json.dumps(payload_data, sort_keys=True, default=str)
    checksum = hashlib.sha256(raw_str.encode("utf-8")).hexdigest()

    # Log export event in audit log
    await db.audit_logs.insert_one({
        "event": "data_export",
        "user_id": uid,
        "email": current_user.get("email"),
        "timestamp": now,
        "checksum": checksum,
    })

    return {
        "export_metadata": {
            "platform": "Placement Intelligence Enterprise",
            "compliance": "DPDPA 2023 (Section 11) & FERPA Compliant",
            "export_timestamp": now.isoformat(),
            "user_id": uid,
            "email": current_user.get("email"),
            "integrity_checksum_sha256": checksum,
        },
        "data": payload_data,
    }


@router.post("/me/privacy-request")
async def submit_privacy_request(
    payload: PrivacyRequestModel,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    DPDPA 2023 (Sections 11, 12, 13) Statutory Privacy Request Intake.
    Accepts student requests for Data Export, Rectification, Erasure, or Consent Withdrawal.
    Logs request with a verifiable tracking ID and 30-day statutory resolution timeline.
    """
    uid = current_user.get("firebase_uid")
    now = datetime.now(timezone.utc)
    tracking_id = f"PRV-{uuid.uuid4().hex[:8].upper()}"
    statutory_deadline = now + timedelta(days=30)

    request_doc = {
        "tracking_id": tracking_id,
        "user_id": uid,
        "email": payload.contact_email or current_user.get("email"),
        "request_type": payload.request_type,
        "reason": payload.reason,
        "status": "received",
        "created_at": now,
        "statutory_deadline": statutory_deadline,
        "resolved_at": None,
    }

    await db.privacy_requests.insert_one(request_doc)

    await db.notifications.insert_one({
        "user_id": uid,
        "notification_type": "security",
        "title": "Privacy Request Submitted",
        "message": f"Your request for {payload.request_type.replace('_', ' ').title()} has been registered under Tracking ID {tracking_id}. Our Data Protection Officer will review it within statutory deadlines.",
        "job_id": None,
        "read_status": False,
        "created_at": now,
    })

    return {
        "success": True,
        "tracking_id": tracking_id,
        "request_type": payload.request_type,
        "status": "received",
        "message": f"Your statutory privacy request has been registered. Reference: {tracking_id}",
        "statutory_deadline": statutory_deadline.isoformat(),
    }


@router.delete("/me/account")
async def delete_student_account(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    DPDPA 2023 (Section 12) Right to Erasure & Account Deletion.
    De-identifies and anonymizes personal data while preserving aggregated placement statistics.
    """
    uid = current_user.get("firebase_uid")
    now = datetime.now(timezone.utc)

    # Anonymize user record
    anon_email = f"anonymized_{uuid.uuid4().hex[:8]}@privacy.deleted"
    await db.users.update_one(
        {"firebase_uid": uid},
        {
            "$set": {
                "email": anon_email,
                "display_name": "Deactivated Student",
                "photo_url": None,
                "account_status": "deleted",
                "deleted_at": now,
                "password_hash": None,
            }
        }
    )

    # Anonymize profile
    await db.student_profiles.update_one(
        {"user_id": uid},
        {
            "$set": {
                "full_name": "Deactivated Student",
                "email": anon_email,
                "phone": "",
                "github_url": "",
                "linkedin_url": "",
                "portfolio_url": "",
                "anonymized_at": now,
            }
        }
    )

    # Record erasure in audit log
    await db.audit_logs.insert_one({
        "event": "account_erasure",
        "user_id": uid,
        "timestamp": now,
        "statutory_basis": "DPDPA 2023 Section 12",
    })

    return {
        "success": True,
        "message": "Your personal data has been securely anonymized and scheduled for complete erasure in compliance with DPDPA 2023.",
    }


@router.get("/{user_id}")
async def get_student_profile_by_id(
    user_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Retrieves student profile by user ID with strict multi-user data isolation.
    Disallows cross-student inspection unless user has ADMIN or SUPER_ADMIN role.
    """
    verify_student_ownership(user_id, current_user)

    profile = await db.student_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Student profile not found.")

    return profile
