"""
Personalized learning roadmap routes backed by MongoDB Atlas.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.dependencies import get_current_user
from app.db.mongodb import get_database
from app.services.resume_intelligence import (
    compute_and_store_readiness,
    generate_tailored_roadmap,
)

router = APIRouter()


class GenerateRoadmapRequest(BaseModel):
    target_role: Optional[str] = None


@router.get("")
async def get_my_roadmap(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Return personalized roadmap from MongoDB; strictly requires an active uploaded resume."""
    uid = current_user["firebase_uid"]

    active_resume = await db.resumes.find_one({"user_id": uid, "is_active": True})
    if not active_resume or not active_resume.get("detected_skills"):
        return {
            "has_roadmap": False,
            "user_id": uid,
            "duration": "4 Weeks",
            "progress": 0.0,
            "weeks": [],
            "skill_focus": [],
            "message": "Upload your resume in Resume Intelligence to automatically generate your personalized 4-week roadmap based on your discovered skills.",
        }

    roadmap = await db.roadmaps.find_one({"user_id": uid})
    if not roadmap:
        extracted = active_resume.get("detected_skills", [])
        profile = await db.student_profiles.find_one({"user_id": uid})
        roadmap = await generate_tailored_roadmap(uid, extracted, profile, db)
        if not roadmap:
            return {
                "has_roadmap": False,
                "user_id": uid,
                "duration": "4 Weeks",
                "progress": 0.0,
                "weeks": [],
                "skill_focus": [],
                "message": "Upload your resume in Resume Intelligence to unlock your personalized 4-week roadmap.",
            }

    roadmap.pop("_id", None)
    return {"has_roadmap": True, **roadmap}


@router.post("/generate")
async def generate_roadmap_endpoint(
    req: Optional[GenerateRoadmapRequest] = None,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Explicitly regenerate personalized 4-week roadmap using Gemini AI for current student and role."""
    uid = current_user["firebase_uid"]
    active_resume = await db.resumes.find_one({"user_id": uid, "is_active": True})
    if not active_resume or not active_resume.get("detected_skills"):
        raise HTTPException(
            status_code=400,
            detail="Upload your resume in Resume Intelligence before generating a roadmap.",
        )
    extracted = active_resume.get("detected_skills", [])
    profile = await db.student_profiles.find_one({"user_id": uid}) or {}

    target_role = req.target_role.strip() if req and req.target_role and req.target_role.strip() else None
    if target_role:
        await db.student_profiles.update_one(
            {"user_id": uid},
            {"$set": {"target_roles": [target_role], "updated_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
        profile["target_roles"] = [target_role]

    roadmap = await generate_tailored_roadmap(
        uid=uid,
        extracted_skills=extracted,
        profile=profile,
        db=db,
        target_role_override=target_role,
    )
    return {"has_roadmap": True, **(roadmap or {})}


@router.put("/tasks/{task_id}/toggle")
async def toggle_roadmap_task(
    task_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Toggle task completion status cleanly and recalculate progress & placement readiness."""
    uid = current_user["firebase_uid"]
    roadmap = await db.roadmaps.find_one({"user_id": uid})
    if not roadmap:
        raise HTTPException(status_code=404, detail="Roadmap not found")

    found = False
    new_task_state = False
    total_tasks = 0
    completed_tasks = 0

    weeks = roadmap.get("weeks", [])
    for w in weeks:
        week_tasks = w.get("tasks", [])
        week_completed = 0
        for t in week_tasks:
            total_tasks += 1
            if t.get("id") == task_id:
                t["is_completed"] = not bool(t.get("is_completed", False))
                new_task_state = t["is_completed"]
                found = True
            if t.get("is_completed"):
                completed_tasks += 1
                week_completed += 1
        w["is_completed"] = len(week_tasks) > 0 and week_completed == len(week_tasks)

    if not found:
        raise HTTPException(status_code=404, detail="Task not found in roadmap")

    progress = round((completed_tasks / total_tasks) * 100.0, 1) if total_tasks > 0 else 0.0
    now = datetime.now(timezone.utc)

    await db.roadmaps.update_one(
        {"_id": roadmap["_id"]},
        {"$set": {"weeks": weeks, "progress": progress, "updated_at": now}},
    )

    readiness = await compute_and_store_readiness(uid, db)
    roadmap.pop("_id", None)
    return {
        "task_id": task_id,
        "is_completed": new_task_state,
        "progress": progress,
        "readiness_score": readiness["overall_score"],
        "roadmap": {**roadmap, "weeks": weeks, "progress": progress},
    }
