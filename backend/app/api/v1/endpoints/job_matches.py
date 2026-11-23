"""
Job-to-student real skill match evaluation endpoint backed by MongoDB Atlas.
"""

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user
from app.db.mongodb import get_database
from app.services.resume_intelligence import recalculate_job_matches_for_user

router = APIRouter()


@router.get("/{job_id}")
async def get_job_match_analysis(
    job_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Return real, skill-grounded match percentage and skill gap breakdown for a specific job."""
    uid = current_user["firebase_uid"]
    match = await db.job_matches.find_one({"user_id": uid, "job_id": job_id})
    if not match:
        matches = await recalculate_job_matches_for_user(uid, db)
        for m in matches:
            if m.get("job_id") == job_id:
                match = m
                break

    if not match:
        raise HTTPException(status_code=404, detail="Job match could not be computed for unknown job_id")

    return {
        "job_id": job_id,
        "job_title": match.get("job_title", ""),
        "company": match.get("company", ""),
        "match_score": float(match.get("match_score", 0.0)),
        "matched_skills": match.get("matched_skills", []),
        "verified_matched_skills": match.get("verified_matched_skills", []),
        "missing_skills": match.get("missing_skills", []),
        "readiness_status": match.get("readiness_status", "upload_resume_first"),
        "recommendation": match.get("recommendation", ""),
    }
