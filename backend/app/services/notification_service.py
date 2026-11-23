"""
Intelligent Real-Time Notification and Job Alert Service (Phase 5).
Manages in-app notifications, FCM browser & desktop push notifications,
user notification preferences, quiet hours suppression, and deduplication.
"""

import asyncio
from datetime import datetime, timezone
import logging
from typing import Any, Dict, List, Optional

from bson import ObjectId

from app.core.firebase import init_firebase_admin
from app.schemas.notification import (
    DeliveryStatus,
    NotificationCategory,
    NotificationType,
    UserNotificationPreferences,
)

logger = logging.getLogger("placement_intelligence.notifications")


def _normalize_category(notif_type: str, category: Optional[str] = None) -> str:
    """Infer notification category from type or override category."""
    if category and category != NotificationCategory.ALL.value:
        return category
    t = (notif_type or "").lower()
    if any(k in t for k in ["job", "application"]):
        return NotificationCategory.JOBS.value
    if any(k in t for k in ["assessment", "assignment", "roadmap", "skill"]):
        return NotificationCategory.LEARNING.value
    if any(k in t for k in ["profile", "resume", "security"]):
        return NotificationCategory.ACCOUNT.value
    return NotificationCategory.SYSTEM.value


def is_in_quiet_hours(prefs: Dict[str, Any], current_dt: Optional[datetime] = None) -> bool:
    """Check if current time falls within user's configured quiet hours."""
    if not prefs.get("quiet_hours_enabled", False):
        return False

    start_str = prefs.get("quiet_hours_start", "22:00")
    end_str = prefs.get("quiet_hours_end", "08:00")

    try:
        now = current_dt or datetime.now(timezone.utc)
        current_minutes = now.hour * 60 + now.minute

        s_h, s_m = map(int, start_str.split(":"))
        e_h, e_m = map(int, end_str.split(":"))
        start_minutes = s_h * 60 + s_m
        end_minutes = e_h * 60 + e_m

        if start_minutes <= end_minutes:
            # Daytime quiet period (e.g. 09:00 to 17:00)
            return start_minutes <= current_minutes <= end_minutes
        else:
            # Overnight quiet period (e.g. 22:00 to 08:00)
            return current_minutes >= start_minutes or current_minutes <= end_minutes
    except Exception as exc:
        logger.debug(f"Quiet hours calculation error: {exc}")
        return False


async def get_or_create_user_preferences(db: Any, uid: str) -> Dict[str, Any]:
    """Retrieve user notification preferences or return defaults."""
    doc = await db.notification_preferences.find_one({"user_id": uid})
    if doc:
        doc.pop("_id", None)
        return doc
    defaults = UserNotificationPreferences().model_dump()
    defaults["user_id"] = uid
    return defaults


async def update_user_preferences(db: Any, uid: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    """Update user notification preferences."""
    clean_updates = {k: v for k, v in updates.items() if k != "_id" and k != "user_id"}
    clean_updates["updated_at"] = datetime.now(timezone.utc)
    await db.notification_preferences.update_one(
        {"user_id": uid},
        {"$set": clean_updates},
        upsert=True,
    )
    return await get_or_create_user_preferences(db, uid)


async def register_device_token(
    db: Any,
    uid: str,
    token: str,
    device_type: str = "browser",
    user_agent: Optional[str] = None,
) -> bool:
    """
    Securely register an FCM device token in device_tokens collection.
    Maintains compound uniqueness on (user_id, token).
    """
    if not token or not token.strip():
        return False

    clean_token = token.strip()
    now = datetime.now(timezone.utc)

    # Upsert token record
    await db.device_tokens.update_one(
        {"user_id": uid, "token": clean_token},
        {
            "$set": {
                "user_id": uid,
                "token": clean_token,
                "fcm_token": clean_token,
                "device_type": device_type or "browser",
                "user_agent": user_agent or "",
                "updated_at": now,
                "is_active": True,
            },
            "$setOnInsert": {
                "created_at": now,
            },
        },
        upsert=True,
    )
    logger.info(f"Registered FCM device token for user {uid} ({device_type})")
    return True


async def remove_device_token(db: Any, uid: str, token: str) -> bool:
    """Unregister an FCM device token on user logout."""
    if not token or not token.strip():
        return False
    clean_token = token.strip()
    res = await db.device_tokens.delete_many({
        "user_id": uid,
        "$or": [{"token": clean_token}, {"fcm_token": clean_token}],
    })
    logger.info(f"Unregistered FCM device token for user {uid} (deleted {res.deleted_count})")
    return res.deleted_count > 0


async def cleanup_invalid_tokens(db: Any, invalid_tokens: List[str]) -> int:
    """Prune stale, unregistered, or expired FCM tokens from device_tokens collection."""
    if not invalid_tokens:
        return 0
    res = await db.device_tokens.delete_many({
        "$or": [
            {"token": {"$in": invalid_tokens}},
            {"fcm_token": {"$in": invalid_tokens}},
        ]
    })
    logger.info(f"Cleaned up {res.deleted_count} stale/invalid FCM tokens")
    return res.deleted_count


async def send_fcm_multicast(
    db: Any,
    tokens: List[str],
    title: str,
    body: str,
    data: Optional[Dict[str, str]] = None,
    link_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Dispatches FCM Webpush / Mobile multicast notifications via Firebase Admin SDK.
    Includes deep-link actions and cleans up invalid tokens automatically.
    """
    if not tokens:
        return {"success_count": 0, "failure_count": 0, "invalid_tokens": []}

    import os
    if os.getenv("TESTING") == "true":
        return {"success_count": len(tokens), "failure_count": 0, "invalid_tokens": []}

    try:
        init_firebase_admin()
        from firebase_admin import messaging
    except Exception as exc:
        logger.warning(f"Firebase Admin messaging not initialized: {exc}")
        return {"success_count": 0, "failure_count": len(tokens), "error": str(exc), "invalid_tokens": []}

    # Ensure all data values are strings
    str_data = {k: str(v) for k, v in (data or {}).items() if v is not None}
    target_link = link_url or str_data.get("link") or str_data.get("action_url") or "/student/jobs"
    str_data["link"] = target_link

    webpush_config = messaging.WebpushConfig(
        notification=messaging.WebpushNotification(
            title=title,
            body=body,
            icon="/favicon.ico",
            badge="/favicon.ico",
        ),
        fcm_options=messaging.WebpushFCMOptions(link=target_link),
    )

    message = messaging.MulticastMessage(
        notification=messaging.Notification(title=title, body=body),
        data=str_data,
        webpush=webpush_config,
        tokens=tokens,
    )

    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(messaging.send_each_for_multicast, message),
            timeout=6.0,
        )

        invalid_tokens = []
        if response.failure_count > 0:
            for idx, resp in enumerate(response.responses):
                if not resp.success and resp.exception:
                    err_msg = str(resp.exception).lower()
                    if any(s in err_msg for s in ["unregistered", "invalid", "not registered", "bad device token"]):
                        invalid_tokens.append(tokens[idx])

        if invalid_tokens:
            await cleanup_invalid_tokens(db, invalid_tokens)

        # Log push delivery summary
        await db.notification_deliveries.insert_one({
            "timestamp": datetime.now(timezone.utc),
            "tokens_attempted": len(tokens),
            "success_count": response.success_count,
            "failure_count": response.failure_count,
            "title": title,
        })

        return {
            "success_count": response.success_count,
            "failure_count": response.failure_count,
            "invalid_tokens": invalid_tokens,
        }
    except Exception as exc:
        logger.warning(f"FCM multicast dispatch exception: {exc}")
        return {"success_count": 0, "failure_count": len(tokens), "error": str(exc), "invalid_tokens": []}


async def dispatch_notification(
    db: Any,
    uid: str,
    title: str,
    message: str,
    notif_type: str = NotificationType.INFO.value,
    category: Optional[str] = None,
    link: Optional[str] = None,
    action_url: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    deduplication_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Intelligent dispatch pipeline:
    1. Check deduplication (prevent duplicate spam).
    2. Check user notification preferences (frequency, category toggles).
    3. Check quiet hours.
    4. Save in MongoDB notifications collection.
    5. Dispatch FCM browser/desktop push if eligible.
    """
    now = datetime.now(timezone.utc)
    cat = _normalize_category(notif_type, category)

    # 1. Deduplication check
    if deduplication_key:
        try:
            existing_dedup = await db.notification_deduplications.find_one({"dedup_key": deduplication_key})
            if existing_dedup:
                return {
                    "status": "skipped_duplicate",
                    "message": "Notification already delivered previously",
                }
            await db.notification_deduplications.update_one(
                {"dedup_key": deduplication_key},
                {"$setOnInsert": {"dedup_key": deduplication_key, "user_id": uid, "created_at": now}},
                upsert=True,
            )
        except Exception:
            # Duplicate key error means user was already notified about this exact event
            return {
                "status": "skipped_duplicate",
                "message": "Notification already delivered previously",
            }

    # Deduplicate recent identical notification for same user
    try:
        recent_dup = await db.notifications.find_one({
            "user_id": uid,
            "title": title.strip(),
            "message": message.strip(),
        })
        if recent_dup:
            return {
                "status": "skipped_duplicate",
                "message": "Identical notification already delivered to user",
            }
    except Exception:
        pass

    # 2. Preferences check
    prefs = await get_or_create_user_preferences(db, uid)

    # Frequency check: if disabled completely
    if prefs.get("notification_frequency") == "off":
        return {"status": DeliveryStatus.SUPPRESSED_PREFERENCES.value}

    # Category checks
    if cat == NotificationCategory.JOBS.value:
        if not prefs.get("job_alerts", True):
            return {"status": DeliveryStatus.SUPPRESSED_PREFERENCES.value}
        if notif_type == NotificationType.HIGH_MATCH_JOB.value and not prefs.get("high_match_alerts", True):
            return {"status": DeliveryStatus.SUPPRESSED_PREFERENCES.value}

    elif cat == NotificationCategory.LEARNING.value:
        if "assessment" in notif_type and not prefs.get("assessment_reminders", True):
            return {"status": DeliveryStatus.SUPPRESSED_PREFERENCES.value}
        if "assignment" in notif_type and not prefs.get("assignment_notifications", True):
            return {"status": DeliveryStatus.SUPPRESSED_PREFERENCES.value}
        if "roadmap" in notif_type and not prefs.get("roadmap_reminders", True):
            return {"status": DeliveryStatus.SUPPRESSED_PREFERENCES.value}

    # 3. Quiet hours check
    in_quiet = is_in_quiet_hours(prefs, now)
    delivery_status = (
        DeliveryStatus.SUPPRESSED_QUIET_HOURS.value
        if in_quiet
        else DeliveryStatus.IN_APP_ONLY.value
    )

    # 4. Insert notification document in MongoDB
    meta = metadata or {}
    notif_doc = {
        "user_id": uid,
        "title": title,
        "message": message,
        "type": notif_type,
        "category": cat,
        "is_read": False,
        "created_at": now,
        "link": link or meta.get("link") or action_url,
        "action_url": action_url or meta.get("action_url") or link,
        "job_id": meta.get("job_id"),
        "company": meta.get("company"),
        "role": meta.get("role"),
        "apply_url": meta.get("apply_url") or action_url,
        "source_name": meta.get("source_name"),
        "metadata": meta,
        "delivery_status": delivery_status,
    }

    insert_res = await db.notifications.insert_one(notif_doc)
    notif_id = str(insert_res.inserted_id)

    # 5. Dispatch FCM Push (if not in quiet hours)
    push_result = None
    if not in_quiet and prefs.get("notification_frequency") == "immediate":
        tokens_cursor = db.device_tokens.find({"user_id": uid, "is_active": {"$ne": False}})
        token_docs = await tokens_cursor.to_list(length=20)
        tokens = [t.get("token") or t.get("fcm_token") for t in token_docs if (t.get("token") or t.get("fcm_token"))]

        if tokens:
            fcm_data = {
                "notification_id": notif_id,
                "type": notif_type,
                "category": cat,
                "link": link or "/student/jobs",
                "action_url": action_url or "",
                "job_id": str(meta.get("job_id") or ""),
            }
            push_result = await send_fcm_multicast(
                db=db,
                tokens=tokens,
                title=title,
                body=message,
                data=fcm_data,
                link_url=link or action_url,
            )
            if push_result.get("success_count", 0) > 0:
                delivery_status = DeliveryStatus.DELIVERED.value
                await db.notifications.update_one(
                    {"_id": insert_res.inserted_id},
                    {"$set": {"delivery_status": DeliveryStatus.DELIVERED.value}},
                )

    return {
        "notification_id": notif_id,
        "status": delivery_status,
        "push_result": push_result,
    }


async def send_admin_broadcast(
    db: Any,
    admin_uid: str,
    title: str,
    message: str,
    category: str = "system",
    target_role: Optional[str] = "STUDENT",
    target_branch: Optional[str] = "ALL",
    target_batch: Optional[str] = "ALL",
    action_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Broadcasts an official announcement to targeted student cohorts.
    Restricted to authorized administrator roles.
    """
    query: Dict[str, Any] = {}
    if target_role and target_role != "ALL":
        query["role"] = target_role
    if target_branch and target_branch != "ALL":
        query["branch"] = target_branch
    if target_batch and target_batch != "ALL":
        query["batch"] = target_batch

    target_users = await db.users.find(query, {"firebase_uid": 1}).to_list(length=1000)
    user_ids = [u["firebase_uid"] for u in target_users if u.get("firebase_uid")]

    if not user_ids:
        # Fallback to distinct user_ids from device_tokens or profiles if users collection is sparse
        distinct_uids = await db.device_tokens.distinct("user_id")
        user_ids = list(distinct_uids)

    notifications_dispatched = 0
    now = datetime.now(timezone.utc)

    # Bulk insert notifications for all targets
    docs = []
    for uid in user_ids:
        docs.append({
            "user_id": uid,
            "title": f"📢 Announcement: {title}",
            "message": message,
            "type": NotificationType.ADMIN_ANNOUNCEMENT.value,
            "category": category,
            "is_read": False,
            "created_at": now,
            "action_url": action_url,
            "link": action_url or "/student/dashboard",
            "metadata": {"broadcast": True, "sender_admin": admin_uid},
            "delivery_status": DeliveryStatus.DELIVERED.value,
        })

    if docs:
        await db.notifications.insert_many(docs, ordered=False)
        notifications_dispatched = len(docs)

    # Send multicast push to all active tokens
    active_tokens = await db.device_tokens.distinct("token", {"is_active": {"$ne": False}})
    if not active_tokens:
        active_tokens = await db.device_tokens.distinct("fcm_token")

    push_result = {"success_count": 0, "failure_count": 0}
    if active_tokens:
        # Batch in chunks of 500 for FCM
        for i in range(0, len(active_tokens), 500):
            chunk = active_tokens[i : i + 500]
            res = await send_fcm_multicast(
                db=db,
                tokens=chunk,
                title=f"📢 {title}",
                body=message,
                data={"type": "admin_announcement", "link": action_url or "/student/dashboard"},
                link_url=action_url,
            )
            push_result["success_count"] += res.get("success_count", 0)
            push_result["failure_count"] += res.get("failure_count", 0)

    # Record in admin audit log
    await db.admin_audit_logs.insert_one({
        "admin_uid": admin_uid,
        "action": "SEND_ANNOUNCEMENT",
        "title": title,
        "recipients_count": len(user_ids),
        "push_success_count": push_result["success_count"],
        "timestamp": now,
    })

    return {
        "recipients_count": len(user_ids),
        "notifications_dispatched": notifications_dispatched,
        "push_result": push_result,
    }


async def get_admin_notification_stats(db: Any) -> Dict[str, Any]:
    """Compute system-wide notification analytics and FCM token health."""
    total_notifications = await db.notifications.count_documents({})
    unread_notifications = await db.notifications.count_documents({"is_read": False})
    registered_devices = await db.device_tokens.count_documents({})
    active_fcm_tokens = await db.device_tokens.count_documents({"is_active": {"$ne": False}})

    # Calculate delivery stats from recent 24h
    now = datetime.now(timezone.utc)
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)

    pipeline = [
        {"$match": {"timestamp": {"$gte": today_start}}},
        {"$group": {
            "_id": None,
            "total_success": {"$sum": "$success_count"},
            "total_failure": {"$sum": "$failure_count"},
            "deliveries_today": {"$sum": 1},
        }},
    ]
    delivery_stats = await db.notification_deliveries.aggregate(pipeline).to_list(length=1)

    push_success_count = delivery_stats[0]["total_success"] if delivery_stats else 0
    push_failure_count = delivery_stats[0]["total_failure"] if delivery_stats else 0
    deliveries_today = delivery_stats[0]["deliveries_today"] if delivery_stats else 0

    return {
        "total_notifications": total_notifications,
        "unread_notifications": unread_notifications,
        "registered_devices": registered_devices,
        "active_fcm_tokens": active_fcm_tokens,
        "push_success_count": push_success_count,
        "push_failure_count": push_failure_count,
        "deliveries_today": deliveries_today,
    }
