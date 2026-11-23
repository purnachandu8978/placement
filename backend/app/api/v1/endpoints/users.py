from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from app.core.dependencies import get_current_user
from app.db.mongodb import get_database

router = APIRouter()


class UpdateUserRequest(BaseModel):
    display_name: str
    photo_url: Optional[str] = None


@router.get("/me")
async def get_current_user_info(current_user: Dict[str, Any] = Depends(get_current_user)):
    return {
        "id": current_user.get("firebase_uid"),
        "firebase_uid": current_user.get("firebase_uid"),
        "email": current_user.get("email"),
        "full_name": current_user.get("display_name", "Student"),
        "roles": [current_user.get("role", "STUDENT")],
        "avatar_url": current_user.get("photo_url"),
        "is_active": current_user.get("account_status") == "active",
        "is_verified": True
    }


@router.put("/me")
async def update_current_user_info(
    payload: UpdateUserRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    uid = current_user.get("firebase_uid")
    update_data = {"display_name": payload.display_name.strip()}
    if payload.photo_url is not None:
        update_data["photo_url"] = payload.photo_url.strip()

    await db.users.update_one({"firebase_uid": uid}, {"$set": update_data})
    updated = await db.users.find_one({"firebase_uid": uid})

    return {
        "id": uid,
        "firebase_uid": uid,
        "email": updated.get("email"),
        "full_name": updated.get("display_name"),
        "roles": [updated.get("role", "STUDENT")],
        "avatar_url": updated.get("photo_url"),
        "is_active": updated.get("account_status") == "active",
        "is_verified": True
    }
