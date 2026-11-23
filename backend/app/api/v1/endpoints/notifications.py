"""
Notification & Real-Time Alert API Endpoints (Phase 5).
Provides in-app notification querying, unread counters, FCM token registration,
user notification preferences, quiet hours management, and admin broadcast controls.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.dependencies import get_current_user, require_role
from app.db.mongodb import get_database
from app.schemas.notification import (
    AdminAnnouncementRequest,
    DeviceTokenRegisterRequest,
    NotificationCategory,
    NotificationItem,
    NotificationListResponse,
    NotificationStatsResponse,
    UnreadCountResponse,
    UserNotificationPreferences,
)
from app.services.notification_service import (
    get_admin_notification_stats,
    get_or_create_user_preferences,
    register_device_token,
    remove_device_token,
    send_admin_broadcast,
    update_user_preferences,
)

router = APIRouter()


@router.get("", response_model=NotificationListResponse)
async def get_my_notifications(
    category: Optional[str] = Query("all", description="Category filter (all, jobs, learning, account, system)"),
    is_read: Optional[bool] = Query(None, description="Read state filter"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """
    Fetch this user's notifications ordered newest first.
    Supports granular category filtering and read state filtering.
    """
    uid = current_user["firebase_uid"]
    user_cond = {"$or": [{"user_id": uid}, {"user_id": "ALL"}, {"target_type": "ALL"}]}
    query: Dict[str, Any] = {**user_cond}

    if category and category.lower() != "all":
        query["category"] = category.lower()

    if is_read is not None:
        query["is_read"] = is_read

    raw_docs = (
        await db.notifications.find(query)
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit * 2)
        .to_list(length=limit * 2)
    )

    # In-memory deduplication: prevent duplicate cards for the same notification event
    seen_keys = set()
    docs = []
    for d in raw_docs:
        key = (d.get("title", "").strip().lower(), d.get("message", "").strip().lower())
        if key in seen_keys:
            continue
        seen_keys.add(key)
        docs.append(d)
        if len(docs) >= limit:
            break

    # Accurate unread count for this user
    unread_docs = await db.notifications.find(
        {**user_cond, "is_read": False, "read_by": {"$ne": uid}},
        {"title": 1, "message": 1}
    ).limit(100).to_list(length=100)
    seen_unread = set()
    unread_count = 0
    for d in unread_docs:
        k = (d.get("title", "").strip().lower(), d.get("message", "").strip().lower())
        if k not in seen_unread:
            seen_unread.add(k)
            unread_count += 1

    total = len(docs)

    items: List[NotificationItem] = []
    for d in docs:
        c_at = d.get("created_at")
        if isinstance(c_at, datetime):
            if c_at.tzinfo is None:
                c_at = c_at.replace(tzinfo=timezone.utc)
            c_at_str = c_at.isoformat()
        elif isinstance(c_at, str) and c_at.strip():
            c_at_str = c_at if (c_at.endswith("Z") or "+" in c_at) else f"{c_at}Z"
        else:
            c_at_str = str(c_at or "")

        meta = d.get("metadata") or {}
        # If user has marked a broadcast as read, reflect it
        read_by = d.get("read_by") or []
        item_is_read = bool(d.get("is_read", False)) or (uid in read_by)

        items.append(
            NotificationItem(
                id=str(d["_id"]),
                user_id=d.get("user_id", uid),
                title=d.get("title", "Notification"),
                message=d.get("message", ""),
                type=d.get("type", "info"),
                category=d.get("category", "system"),
                is_read=item_is_read,
                created_at=c_at_str,
                link=d.get("link") or meta.get("link") or d.get("action_url"),
                action_url=d.get("action_url") or meta.get("action_url") or d.get("link"),
                job_id=d.get("job_id") or meta.get("job_id"),
                company=d.get("company") or meta.get("company"),
                role=d.get("role") or meta.get("role"),
                apply_url=d.get("apply_url") or meta.get("apply_url"),
                source_name=d.get("source_name") or meta.get("source_name"),
                metadata=meta,
                delivery_status=d.get("delivery_status", "in_app_only"),
            )
        )

    return NotificationListResponse(items=items, total=total, unread_count=unread_count)


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Get the live count of unread notifications for badge rendering."""
    uid = current_user["firebase_uid"]
    try:
        user_cond = {"$or": [{"user_id": uid}, {"user_id": "ALL"}, {"target_type": "ALL"}]}
        docs = await db.notifications.find(
            {**user_cond, "is_read": False, "read_by": {"$ne": uid}},
            {"title": 1, "message": 1}
        ).limit(100).to_list(length=100)
        
        seen = set()
        count = 0
        for d in docs:
            k = (d.get("title", "").strip().lower(), d.get("message", "").strip().lower())
            if k not in seen:
                seen.add(k)
                count += 1
        return UnreadCountResponse(unread_count=count)
    except Exception as exc:
        return UnreadCountResponse(unread_count=0)


@router.put("/read-all")
async def mark_all_read(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Mark all notifications of current user as read."""
    uid = current_user["firebase_uid"]
    res = await db.notifications.update_many(
        {"$or": [{"user_id": uid}, {"user_id": "ALL"}, {"target_type": "ALL"}], "is_read": False},
        {"$set": {"is_read": True}, "$addToSet": {"read_by": uid}},
    )
    return {"updated": res.modified_count, "message": "All notifications marked as read"}


@router.put("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Mark a single owned notification as read."""
    try:
        oid = ObjectId(notification_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notification_id")

    uid = current_user["firebase_uid"]
    res = await db.notifications.update_one(
        {"_id": oid, "$or": [{"user_id": uid}, {"user_id": "ALL"}, {"target_type": "ALL"}]},
        {"$set": {"is_read": True}, "$addToSet": {"read_by": uid}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification marked as read"}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Delete a single owned notification."""
    try:
        oid = ObjectId(notification_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notification_id")

    uid = current_user["firebase_uid"]
    res = await db.notifications.delete_one({
        "_id": oid,
        "$or": [{"user_id": uid}, {"user_id": "ALL"}, {"target_type": "ALL"}]
    })
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification deleted successfully"}


@router.delete("/clear-all")
async def clear_all_notifications(
    only_read: bool = Query(True, description="When true, only deletes read notifications"),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Clear all or only read notifications for current user."""
    uid = current_user["firebase_uid"]
    query: Dict[str, Any] = {"$or": [{"user_id": uid}, {"user_id": "ALL"}, {"target_type": "ALL"}]}
    if only_read:
        query["$or"] = [
            {"user_id": uid, "is_read": True},
            {"read_by": uid},
            {"user_id": "ALL", "is_read": True},
        ]

    res = await db.notifications.delete_many(query)
    return {"deleted_count": res.deleted_count, "message": "Notifications cleared"}


# ---------------------------------------------------------------------
# User Notification Preferences Endpoints
# ---------------------------------------------------------------------

@router.get("/preferences", response_model=UserNotificationPreferences)
async def get_my_preferences(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Retrieve user's alert toggles, quiet hours, and frequency preferences."""
    prefs = await get_or_create_user_preferences(db, current_user["firebase_uid"])
    return UserNotificationPreferences(**prefs)


@router.put("/preferences", response_model=UserNotificationPreferences)
async def update_my_preferences(
    payload: UserNotificationPreferences,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Update user's alert toggles, quiet hours, and frequency preferences."""
    updated = await update_user_preferences(
        db, current_user["firebase_uid"], payload.model_dump()
    )
    return UserNotificationPreferences(**updated)


# ---------------------------------------------------------------------
# FCM Device Token Registration Endpoints
# ---------------------------------------------------------------------

@router.post("/device-token")
async def register_token(
    payload: DeviceTokenRegisterRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Register client FCM browser/desktop device push token."""
    success = await register_device_token(
        db=db,
        uid=current_user["firebase_uid"],
        token=payload.token,
        device_type=payload.device_type or "browser",
        user_agent=payload.user_agent,
    )
    if not success:
        raise HTTPException(status_code=400, detail="Invalid token provided")
    return {"status": "registered", "message": "FCM device token registered"}


@router.delete("/device-token")
async def unregister_token(
    token: str = Query(..., description="FCM device token to unregister on logout"),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Unregister device token when user logs out."""
    removed = await remove_device_token(db, current_user["firebase_uid"], token)
    return {"status": "unregistered", "removed": removed}


# ---------------------------------------------------------------------
# Admin Notification Controls Endpoints
# ---------------------------------------------------------------------

@router.get("/admin/stats", response_model=NotificationStatsResponse)
async def get_notification_analytics(
    current_user: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Get system-wide notification statistics and FCM token health."""
    stats = await get_admin_notification_stats(db)
    return NotificationStatsResponse(**stats)


@router.post("/admin/announcement")
async def send_announcement(
    payload: AdminAnnouncementRequest,
    current_user: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db=Depends(get_database),
):
    """Broadcast an official announcement to targeted student cohorts."""
    result = await send_admin_broadcast(
        db=db,
        admin_uid=current_user["firebase_uid"],
        title=payload.title,
        message=payload.message,
        category=payload.category,
        target_role=payload.target_role,
        target_branch=payload.target_branch,
        target_batch=payload.target_batch,
        action_url=payload.action_url,
    )
    return {
        "status": "success",
        "message": f"Broadcast sent to {result['recipients_count']} users",
        "details": result,
    }
