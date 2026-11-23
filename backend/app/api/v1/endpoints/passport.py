"""
Student Career Passport API Endpoints.
Digital verifiable portfolio passport for recruiter discovery and student career advancement.
Enforces strict consent-based public sharing.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.dependencies import get_current_user
from app.db.mongodb import get_database
from app.services.identity_service import get_or_ensure_student_registration_id

router = APIRouter()


def _to_utc_iso(dt: Any) -> str:
    if not dt:
        return ""
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    s = str(dt).strip()
    if s and not s.endswith("Z") and "+" not in s:
        return f"{s}Z"
    return s


class PassportVisibilityRequest(BaseModel):
    is_public: bool = Field(..., description="Consent-based toggle for recruiter discovery")


class CareerPassportResponse(BaseModel):
    registration_id: str
    student_name: str
    college: str
    department: Optional[str] = ""
    degree: Optional[str] = ""
    graduation_year: Optional[int] = None
    readiness_score: float = 0.0
    readiness_band: str = "Getting Started"
    current_verification_level: str = "NOT_VERIFIED"
    highest_badge: Optional[str] = None
    credentials: List[Dict[str, Any]] = []
    verified_skills: List[Dict[str, Any]] = []
    resume_skills: List[str] = []
    target_roles: List[str] = []
    preferred_locations: List[str] = []
    is_public: bool = False
    passport_url: str
    updated_at: str


@router.get("/my", response_model=CareerPassportResponse)
async def get_my_career_passport(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Student retrieves their private Career Passport dashboard data & sharing settings."""
    uid = current_user["firebase_uid"]
    reg_id = await get_or_ensure_student_registration_id(db, uid)

    profile = await db.student_profiles.find_one({"user_id": uid}) or {}
    readiness = await db.placement_readiness.find_one({"user_id": uid}) or {}
    creds_cursor = db.student_credentials.find({"user_id": uid, "status": "ACTIVE"}).sort("issued_at", -1)
    creds = [c async for c in creds_cursor]

    verified_cursor = db.verified_skills.find({"user_id": uid})
    verified_skills = [s async for s in verified_cursor]

    resume = await db.resumes.find_one({"user_id": uid}) or {}
    extracted_skills = resume.get("detected_skills", []) or []

    # Format credentials safely
    clean_creds = []
    highest_level = "NOT_VERIFIED"
    highest_badge = None

    for c in creds:
        lvl = c.get("level", "")
        if lvl == "LEVEL_2_GREEN":
            highest_level = "LEVEL_2_GREEN"
            highest_badge = "Green Fully Verified ✓"
        elif lvl == "LEVEL_1_BLUE" and highest_level != "LEVEL_2_GREEN":
            highest_level = "LEVEL_1_BLUE"
            highest_badge = "Blue Verified ✓"

        clean_creds.append({
            "credential_id": c.get("credential_id"),
            "serial_number": c.get("serial_number"),
            "level": c.get("level"),
            "badge_type": c.get("badge_type"),
            "title": c.get("title"),
            "skill": c.get("skill"),
            "score": c.get("score"),
            "issued_at": _to_utc_iso(c.get("issued_at")),
            "verification_url": c.get("verification_url", f"/verify/{c.get('credential_id')}"),
        })

    is_public = bool(profile.get("passport_public_visibility", False))

    return CareerPassportResponse(
        registration_id=reg_id,
        student_name=profile.get("full_name") or current_user.get("display_name", "Student Candidate"),
        college=profile.get("college", "Accredited University"),
        department=profile.get("branch", ""),
        degree=profile.get("degree", ""),
        graduation_year=profile.get("graduation_year"),
        readiness_score=float(readiness.get("overall_score", 0.0)),
        readiness_band=readiness.get("readiness_band", "Not Started"),
        current_verification_level=highest_level,
        highest_badge=highest_badge,
        credentials=clean_creds,
        verified_skills=[{"skill": s.get("skill"), "score": s.get("score")} for s in verified_skills],
        resume_skills=[(s.get("skill_name") or s.get("name") or s.get("skill") or str(s)) if isinstance(s, dict) else str(s) for s in extracted_skills[:15]],
        target_roles=profile.get("target_roles", []),
        preferred_locations=profile.get("preferred_locations", []),
        is_public=is_public,
        passport_url=f"/passport/{reg_id}",
        updated_at=datetime.now(timezone.utc).isoformat(),
    )


@router.patch("/visibility", response_model=Dict[str, Any])
async def update_passport_visibility(
    payload: PassportVisibilityRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Toggle public recruiter discovery for student's Career Passport."""
    uid = current_user["firebase_uid"]
    reg_id = await get_or_ensure_student_registration_id(db, uid)
    now = datetime.now(timezone.utc)

    await db.student_profiles.update_one(
        {"user_id": uid},
        {"$set": {"passport_public_visibility": payload.is_public, "updated_at": now}},
        upsert=True,
    )

    return {
        "success": True,
        "registration_id": reg_id,
        "is_public": payload.is_public,
        "passport_url": f"/passport/{reg_id}",
        "message": "Passport visibility updated successfully."
    }


@router.get("/{registration_id}", response_model=CareerPassportResponse)
async def get_public_career_passport(
    registration_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Public recruiter endpoint: Retrieves student's verified Career Passport.
    Strictly checks that the student has enabled public sharing.
    Never exposes phone number, email, or unverified private credentials.
    """
    clean_id = (registration_id or "").strip().upper()
    reg_doc = await db.student_registration_ids.find_one({"registration_id": clean_id})
    if not reg_doc:
        # Check by profile
        profile = await db.student_profiles.find_one({"registration_id": clean_id})
        if not profile:
            raise HTTPException(status_code=404, detail="Student Career Passport not found.")
        user_id = profile["user_id"]
    else:
        user_id = reg_doc["user_id"]
        profile = await db.student_profiles.find_one({"user_id": user_id}) or {}

    if not profile.get("passport_public_visibility", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This student candidate has set their Career Passport to private."
        )

    readiness = await db.placement_readiness.find_one({"user_id": user_id}) or {}
    creds_cursor = db.student_credentials.find({"user_id": user_id, "status": "ACTIVE", "public_visibility": True}).sort("issued_at", -1)
    creds = [c async for c in creds_cursor]

    verified_cursor = db.verified_skills.find({"user_id": user_id})
    verified_skills = [s async for s in verified_cursor]

    clean_creds = []
    highest_level = "NOT_VERIFIED"
    highest_badge = None

    for c in creds:
        lvl = c.get("level", "")
        if lvl == "LEVEL_2_GREEN":
            highest_level = "LEVEL_2_GREEN"
            highest_badge = "Green Fully Verified ✓"
        elif lvl == "LEVEL_1_BLUE" and highest_level != "LEVEL_2_GREEN":
            highest_level = "LEVEL_1_BLUE"
            highest_badge = "Blue Verified ✓"

        clean_creds.append({
            "credential_id": c.get("credential_id"),
            "serial_number": c.get("serial_number"),
            "level": c.get("level"),
            "badge_type": c.get("badge_type"),
            "title": c.get("title"),
            "skill": c.get("skill"),
            "score": c.get("score"),
            "issued_at": _to_utc_iso(c.get("issued_at")),
            "verification_url": c.get("verification_url", f"/verify/{c.get('credential_id')}"),
        })

    return CareerPassportResponse(
        registration_id=clean_id,
        student_name=profile.get("full_name", "Verified Candidate"),
        college=profile.get("college", "Accredited University"),
        department=profile.get("branch", ""),
        degree=profile.get("degree", ""),
        graduation_year=profile.get("graduation_year"),
        readiness_score=float(readiness.get("overall_score", 0.0)),
        readiness_band=readiness.get("readiness_band", "Verified"),
        current_verification_level=highest_level,
        highest_badge=highest_badge,
        credentials=clean_creds,
        verified_skills=[{"skill": s.get("skill"), "score": s.get("score")} for s in verified_skills],
        resume_skills=[],
        target_roles=profile.get("target_roles", []),
        preferred_locations=profile.get("preferred_locations", []),
        is_public=True,
        passport_url=f"/passport/{clean_id}",
        updated_at=datetime.now(timezone.utc).isoformat(),
    )
