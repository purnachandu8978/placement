"""
Pydantic schemas for Phase 4: Autonomous Job Discovery, Ingestion,
Authorized Connectors, and Intelligent Student Matching.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


JobSourceType = str

JobSourceStatus = Literal["LIVE", "NOT_CONFIGURED", "DISABLED", "FAILED"]


class JobSourceCreate(BaseModel):
    name: str = Field(description="Display name of the job source, e.g., 'Greenhouse: Figma'")
    source_type: JobSourceType = Field(description="Connector type")
    endpoint_url: Optional[str] = Field(default=None, description="API endpoint or feed URL")
    board_token: Optional[str] = Field(default=None, description="Greenhouse board token or Lever site ID")
    api_key: Optional[str] = Field(default=None, description="API key or secret token if required")
    sync_interval_minutes: int = Field(default=60, ge=15, le=1440, description="Synchronization frequency")
    priority: int = Field(default=1, ge=1, le=10, description="Execution priority (1 = highest)")
    is_active: bool = Field(default=True, description="Whether sync is enabled")
    requires_auth: bool = Field(default=False, description="Whether this connector requires enterprise API credentials")


class JobSourceUpdate(BaseModel):
    name: Optional[str] = None
    endpoint_url: Optional[str] = None
    board_token: Optional[str] = None
    api_key: Optional[str] = None
    sync_interval_minutes: Optional[int] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None
    status: Optional[JobSourceStatus] = None


class JobSourceResponse(BaseModel):
    id: str
    name: str
    source_type: JobSourceType
    endpoint_url: Optional[str] = None
    board_token: Optional[str] = None
    sync_interval_minutes: int = 60
    priority: int = 1
    status: JobSourceStatus = "LIVE"
    is_active: bool = True
    requires_auth: bool = False
    last_sync_at: Optional[str] = None
    last_status: Optional[str] = None
    error_message: Optional[str] = None
    jobs_imported_count: int = 0
    created_at: Optional[str] = None


class JobMatchBreakdown(BaseModel):
    match_score: float = Field(ge=0.0, le=100.0, description="Overall explainable match score")
    verified_skills_matched: List[str] = Field(default_factory=list, description="Proven via proctored assessments")
    resume_skills_matched: List[str] = Field(default_factory=list, description="Extracted from resume text but unverified")
    missing_skills: List[str] = Field(default_factory=list, description="Required by job but missing from student")
    role_relevance_summary: str = Field(default="", description="Natural language explanation of role fit")
    eligibility_concerns: List[str] = Field(default_factory=list, description="CGPA or graduation year mismatch")
    recommended_preparation: List[str] = Field(default_factory=list, description="Actionable roadmap to qualify")
    formula_breakdown: Dict[str, float] = Field(
        default_factory=dict,
        description="Detailed score components: verified (40%), resume (25%), role (15%), location (10%), eligibility (10%)",
    )


class JobItemResponse(BaseModel):
    id: str
    title: str
    company: str
    location: str = "Remote"
    work_mode: Literal["Remote", "Hybrid", "Onsite"] = "Remote"
    salary: Optional[str] = None
    package_lpa: Optional[float] = None
    description: str
    required_skills: List[str] = Field(default_factory=list)
    preferred_skills: List[str] = Field(default_factory=list)
    eligibility: Optional[str] = None
    employment_type: str = "Full-time"
    original_apply_url: str
    original_job_url: Optional[str] = None
    source_name: str = "Direct Posting"
    source_type: Optional[str] = None
    source_job_id: Optional[str] = None
    posted_at: Optional[str] = None
    expires_at: Optional[str] = None
    is_active: bool = True
    is_new: bool = False
    match_score: float = 0.0
    matched_skills: List[str] = Field(default_factory=list)
    verified_matched_skills: List[str] = Field(default_factory=list)
    missing_skills: List[str] = Field(default_factory=list)
    match_breakdown: Optional[JobMatchBreakdown] = None
    has_applied: bool = False
    is_saved: bool = False
    click_count: int = 0


class JobSyncRunResponse(BaseModel):
    id: str
    source_id: str
    source_name: str
    started_at: str
    completed_at: Optional[str] = None
    status: Literal["success", "partial", "failed", "running"] = "success"
    jobs_fetched: int = 0
    jobs_inserted: int = 0
    jobs_updated: int = 0
    jobs_skipped: int = 0
    jobs_expired: int = 0
    error_details: Optional[str] = None


class JobIngestionStats(BaseModel):
    total_active_jobs: int = 0
    total_expired_jobs: int = 0
    sources_count: int = 0
    live_sources_count: int = 0
    not_configured_count: int = 0
    total_applications_recorded: int = 0
    total_matches_calculated: int = 0
    last_sync_timestamp: Optional[str] = None
    last_sync_status: str = "IDLE"
    active_jobs: int = 0
    total_sources: int = 0
    live_sources: int = 0


class StudentJobPreferences(BaseModel):
    target_job_titles: List[str] = Field(default_factory=list)
    preferred_career_paths: List[str] = Field(default_factory=list)
    skills_of_interest: List[str] = Field(default_factory=list)
    preferred_cities: List[str] = Field(default_factory=list)
    work_modes: List[str] = Field(default_factory=lambda: ["Remote", "Hybrid", "Onsite"])
    employment_types: List[str] = Field(default_factory=lambda: ["Full-time", "Internship"])
    fresher_or_experienced: str = Field(default="all")
    min_salary_lpa: Optional[float] = None
    min_stipend_monthly: Optional[float] = None
    preferred_companies: List[str] = Field(default_factory=list)
    excluded_companies: List[str] = Field(default_factory=list)
    notification_frequency: str = Field(default="immediate")
    alert_score_threshold: float = Field(default=60.0, ge=0.0, le=100.0)
    updated_at: Optional[str] = None


class JobApplicationStatusUpdate(BaseModel):
    status: Literal[
        "interested",
        "saved",
        "applied",
        "assessment_received",
        "interview",
        "selected",
        "rejected",
        "withdrawn",
        "archived",
    ] = "applied"
    notes: Optional[str] = None
    interview_date: Optional[str] = None
    application_method: Optional[str] = None


class WorkerHealthResponse(BaseModel):
    status: str
    active_workers_count: int
    active_leases_count: int
    active_workers: List[Dict[str, Any]] = Field(default_factory=list)
    active_leases: List[Dict[str, Any]] = Field(default_factory=list)
    last_scheduler_heartbeat: Optional[str] = None

