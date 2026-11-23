"""
MongoDB-backed submission history alias routes (replaces legacy SQLAlchemy stub).
"""

from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_user
from app.db.mongodb import get_database

router = APIRouter()


@router.get("/me")
async def list_my_submissions(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Return all assignment submissions owned by current user."""
    uid = current_user["firebase_uid"]
    docs = await db.assignment_submissions.find({"user_id": uid}).sort("submitted_at", -1).to_list(length=100)
    for d in docs:
        d["id"] = str(d.pop("_id"))
        if isinstance(d.get("submitted_at"), datetime):
            d["submitted_at"] = d["submitted_at"].isoformat()
    return docs
