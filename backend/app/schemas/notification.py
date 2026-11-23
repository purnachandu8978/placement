"""
Pydantic schemas and enums for Real-Time Notification & Alert System (Phase 5).
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class NotificationCategory(str, Enum):
    ALL = "all"
    JOBS = "jobs"
    LEARNING = "learning"
    ACCOUNT = "account"
    SYSTEM = "system"


class NotificationType(str, Enum):
    # Job notifications
    NEW_JOB = "new_job"
    HIGH_MATCH_JOB = "high_match_job"
    JOB_ALERT = "job_alert"
    JOB_DEADLINE = "job_deadline"
    JOB_APPLICATION_UPDATE = "job_application_update"

    # Learning notifications
    ASSESSMENT_PUBLISHED = "assessment_published"
    ASSESSMENT_DEADLINE = "assessment_deadline"
    ASSIGNMENT_PUBLISHED = "assignment_published"
    ASSIGNMENT_GRADED = "assignment_graded"
    ROADMAP_REMINDER = "roadmap_reminder"
    SKILL_VERIFIED = "skill_verified"

    # Account & System notifications
    PROFILE_REMINDER = "profile_reminder"
    RESUME_ANALYZED = "resume_analyzed"
    SECURITY_ALERT = "security_alert"
    ADMIN_ANNOUNCEMENT = "admin_announcement"
    INFO = "info"


class DeliveryStatus(str, Enum):
    DELIVERED = "delivered"
    IN_APP_ONLY = "in_app_only"
    SUPPRESSED_QUIET_HOURS = "suppressed_quiet_hours"
    SUPPRESSED_PREFERENCES = "suppressed_preferences"
    FAILED = "failed"


class NotificationItem(BaseModel):
    id: str
    user_id: str
    title: str
    message: str
    type: str = "info"
    category: str = "system"
    is_read: bool = False
    created_at: str
    link: Optional[str] = None
    action_url: Optional[str] = None
    job_id: Optional[str] = None
    company: Optional[str] = None
    role: Optional[str] = None
    apply_url: Optional[str] = None
    source_name: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    delivery_status: Optional[str] = "in_app_only"


class NotificationListResponse(BaseModel):
    items: List[NotificationItem]
    total: int
    unread_count: int


class UnreadCountResponse(BaseModel):
    unread_count: int


class DeviceTokenRegisterRequest(BaseModel):
    token: str = Field(..., description="FCM device registration token")
    device_type: Optional[str] = Field("browser", description="Device type (browser, chrome, edge, safari, android, ios)")
    user_agent: Optional[str] = Field(None, description="Client user agent string")


class UserNotificationPreferences(BaseModel):
    job_alerts: bool = True
    high_match_alerts: bool = True
    assignment_notifications: bool = True
    assessment_reminders: bool = True
    roadmap_reminders: bool = True
    email_notifications: bool = False
    quiet_hours_enabled: bool = False
    quiet_hours_start: str = "22:00"  # HH:MM
    quiet_hours_end: str = "08:00"    # HH:MM
    notification_frequency: str = "immediate"  # immediate | daily_digest | off
    min_match_threshold: int = Field(60, ge=0, le=100, description="Minimum match percentage required for job alerts")


class AdminAnnouncementRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=120)
    message: str = Field(..., min_length=5, max_length=1000)
    category: str = "system"
    target_role: Optional[str] = "STUDENT"  # STUDENT | ALL
    target_branch: Optional[str] = "ALL"   # CSE, ECE, ALL
    target_batch: Optional[str] = "ALL"    # 2025, 2026, ALL
    action_url: Optional[str] = None


class NotificationStatsResponse(BaseModel):
    total_notifications: int
    unread_notifications: int
    registered_devices: int
    active_fcm_tokens: int
    push_success_count: int
    push_failure_count: int
    deliveries_today: int
