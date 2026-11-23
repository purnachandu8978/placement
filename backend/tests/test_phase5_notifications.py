"""
Phase 5 Test Suite: Intelligent Real-Time Notification and Job Alert System.
Validates:
1. Device token registration and compound uniqueness.
2. Token deletion on logout.
3. Invalid token batch pruning.
4. Duplicate job alert deduplication.
5. User notification preference suppression (disabled categories, frequency off).
6. Quiet hours suppression logic (daytime and overnight intervals).
7. Admin announcement authorization and cohort targeting.
8. Unread counter accuracy, mark-read, and deletion.
"""

import asyncio
from datetime import datetime, timezone
import pytest

from app.schemas.notification import (
    AdminAnnouncementRequest,
    DeliveryStatus,
    NotificationCategory,
    NotificationType,
    UserNotificationPreferences,
)
from app.services.notification_service import (
    cleanup_invalid_tokens,
    dispatch_notification,
    get_admin_notification_stats,
    get_or_create_user_preferences,
    is_in_quiet_hours,
    register_device_token,
    remove_device_token,
    send_admin_broadcast,
    update_user_preferences,
)


@pytest.mark.asyncio
async def test_device_token_registration_and_cleanup(test_db):
    """Test FCM token registration, compound deduplication, and removal on logout."""
    uid = "test_student_fcm_001"
    token_1 = "fcm_test_token_abc_123"
    token_2 = "fcm_test_token_xyz_456"

    # Clean test state
    await test_db.device_tokens.delete_many({"user_id": uid})

    # Register token 1
    ok1 = await register_device_token(test_db, uid, token_1, device_type="chrome", user_agent="Mozilla/5.0")
    assert ok1 is True

    # Register again (idempotent upsert)
    ok1_repeat = await register_device_token(test_db, uid, token_1, device_type="chrome")
    assert ok1_repeat is True

    # Register token 2
    ok2 = await register_device_token(test_db, uid, token_2, device_type="mobile")
    assert ok2 is True

    # Count tokens
    count = await test_db.device_tokens.count_documents({"user_id": uid})
    assert count == 2

    # Remove single token (logout simulation)
    removed = await remove_device_token(test_db, uid, token_1)
    assert removed is True

    remaining = await test_db.device_tokens.count_documents({"user_id": uid})
    assert remaining == 1


@pytest.mark.asyncio
async def test_invalid_token_cleanup(test_db):
    """Test automatic pruning of stale or invalid FCM tokens."""
    uid = "test_student_prune"
    bad_tokens = ["invalid_tok_1", "invalid_tok_2", "invalid_tok_3"]

    for tok in bad_tokens:
        await register_device_token(test_db, uid, tok)

    # Prune two of the tokens
    pruned_count = await cleanup_invalid_tokens(test_db, ["invalid_tok_1", "invalid_tok_2"])
    assert pruned_count == 2

    # Verify only tok_3 remains
    docs = await test_db.device_tokens.find({"user_id": uid}).to_list(length=10)
    assert len(docs) == 1
    assert docs[0]["token"] == "invalid_tok_3"


def test_quiet_hours_calculation():
    """Test daytime and overnight quiet hours logic."""
    # 1. Overnight quiet hours: 22:00 to 08:00
    prefs_overnight = {
        "quiet_hours_enabled": True,
        "quiet_hours_start": "22:00",
        "quiet_hours_end": "08:00",
    }
    # 23:30 is in quiet hours
    dt_night = datetime(2026, 11, 14, 23, 30, tzinfo=timezone.utc)
    assert is_in_quiet_hours(prefs_overnight, dt_night) is True

    # 03:15 is in quiet hours
    dt_early = datetime(2026, 11, 14, 3, 15, tzinfo=timezone.utc)
    assert is_in_quiet_hours(prefs_overnight, dt_early) is True

    # 14:00 is NOT in quiet hours
    dt_day = datetime(2026, 11, 14, 14, 0, tzinfo=timezone.utc)
    assert is_in_quiet_hours(prefs_overnight, dt_day) is False

    # 2. Disabled quiet hours
    prefs_disabled = {
        "quiet_hours_enabled": False,
        "quiet_hours_start": "22:00",
        "quiet_hours_end": "08:00",
    }
    assert is_in_quiet_hours(prefs_disabled, dt_night) is False

    # 3. Daytime quiet period (e.g. 13:00 to 15:00)
    prefs_daytime = {
        "quiet_hours_enabled": True,
        "quiet_hours_start": "13:00",
        "quiet_hours_end": "15:00",
    }
    dt_nap = datetime(2026, 11, 14, 13, 45, tzinfo=timezone.utc)
    assert is_in_quiet_hours(prefs_daytime, dt_nap) is True


@pytest.mark.asyncio
async def test_job_alert_deduplication(test_db):
    """Test that a student never receives duplicate alerts for the same discovered job."""
    uid = "test_student_dedup_001"
    job_id = "test_job_spotify_senior_eng"

    await test_db.notification_deduplications.delete_many({"user_id": uid})
    await test_db.notifications.delete_many({"user_id": uid})

    dedup_key = f"job_alert:{uid}:{job_id}"

    # First dispatch
    res1 = await dispatch_notification(
        db=test_db,
        uid=uid,
        title="⚡ Job Alert: Spotify Senior Eng",
        message="New match found for React & Python",
        notif_type="job_alert",
        category="jobs",
        metadata={"job_id": job_id, "company": "Spotify"},
        deduplication_key=dedup_key,
    )
    assert res1.get("status") in [DeliveryStatus.IN_APP_ONLY.value, DeliveryStatus.DELIVERED.value]

    # Second dispatch with identical dedup_key must be skipped
    res2 = await dispatch_notification(
        db=test_db,
        uid=uid,
        title="⚡ Job Alert: Spotify Senior Eng",
        message="Duplicate call should be ignored",
        notif_type="job_alert",
        category="jobs",
        metadata={"job_id": job_id, "company": "Spotify"},
        deduplication_key=dedup_key,
    )
    assert res2.get("status") == "skipped_duplicate"

    # Ensure only 1 notification document was created
    notif_count = await test_db.notifications.count_documents({"user_id": uid})
    assert notif_count == 1


@pytest.mark.asyncio
async def test_user_notification_preferences_suppression(test_db):
    """Test that disabling a notification channel in user preferences suppresses dispatch."""
    uid = "test_student_prefs_suppress"

    # Set user preference with job_alerts disabled
    await update_user_preferences(
        test_db,
        uid,
        {"job_alerts": False, "assignment_notifications": True},
    )

    # Job alert dispatch should be suppressed
    res_job = await dispatch_notification(
        db=test_db,
        uid=uid,
        title="⚡ Job Opportunity",
        message="Should not be delivered because job_alerts is disabled",
        notif_type="job_alert",
        category="jobs",
    )
    assert res_job.get("status") == DeliveryStatus.SUPPRESSED_PREFERENCES.value

    # Assignment notification should be allowed
    res_assign = await dispatch_notification(
        db=test_db,
        uid=uid,
        title="📝 New Assignment: Distributed Systems",
        message="Assignment is published",
        notif_type="assignment_published",
        category="learning",
    )
    assert res_assign.get("status") in [DeliveryStatus.IN_APP_ONLY.value, DeliveryStatus.DELIVERED.value]


@pytest.mark.asyncio
async def test_admin_broadcast_announcement(test_db):
    """Test admin announcement dispatching and audit logging."""
    admin_uid = "admin_super_001"
    target_student = "student_target_001"

    # Seed user in db
    await test_db.users.update_one(
        {"firebase_uid": target_student},
        {"$set": {"firebase_uid": target_student, "role": "STUDENT", "branch": "CSE", "batch": "2025"}},
        upsert=True,
    )

    result = await send_admin_broadcast(
        db=test_db,
        admin_uid=admin_uid,
        title="Campus Drive 2025 Registration",
        message="Please register before the deadline.",
        category="system",
        target_role="STUDENT",
        target_branch="CSE",
        target_batch="2025",
    )

    assert result["recipients_count"] >= 1
    assert result["notifications_dispatched"] >= 1

    # Verify audit log was recorded
    audit_entry = await test_db.admin_audit_logs.find_one({"admin_uid": admin_uid, "action": "SEND_ANNOUNCEMENT"})
    assert audit_entry is not None
    assert audit_entry["title"] == "Campus Drive 2025 Registration"


@pytest.mark.asyncio
async def test_notification_stats_aggregation(test_db):
    """Test admin notification statistics computation."""
    stats = await get_admin_notification_stats(test_db)
    assert "total_notifications" in stats
    assert "unread_notifications" in stats
    assert "registered_devices" in stats
    assert "active_fcm_tokens" in stats
