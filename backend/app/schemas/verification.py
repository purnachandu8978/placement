from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class VerificationLevel(str, Enum):
    LEVEL_1_BLUE = "LEVEL_1_BLUE"
    LEVEL_2_GREEN = "LEVEL_2_GREEN"


class VerificationBadgeType(str, Enum):
    BLUE_VERIFIED = "BLUE_VERIFIED"
    GREEN_FULLY_VERIFIED = "GREEN_FULLY_VERIFIED"


class VerificationStatus(str, Enum):
    NOT_STARTED = "NOT_STARTED"
    IN_PROGRESS = "IN_PROGRESS"
    FAILED = "FAILED"
    PASSED_BLUE = "PASSED_BLUE"
    PASSED_GREEN = "PASSED_GREEN"
    PENDING_ADMIN_REVIEW = "PENDING_ADMIN_REVIEW"
    ISSUED = "ISSUED"
    EXPIRED = "EXPIRED"
    REVOKED = "REVOKED"


class StartAssessmentRequest(BaseModel):
    level: VerificationLevel = Field(
        default=VerificationLevel.LEVEL_1_BLUE,
        description="LEVEL_1_BLUE (5-minute focused) or LEVEL_2_GREEN (10-minute comprehensive)"
    )
    skill_focus: Optional[str] = Field(
        default="Software Engineering & Core CS",
        description="Assessed competency focus"
    )


class AssessmentQuestionOut(BaseModel):
    question_id: str
    text: str
    type: str = "mcq"  # mcq, coding, short_answer
    options: Optional[List[str]] = None
    starter_code: Optional[str] = None
    language: Optional[str] = "python"
    points: float = 10.0


class StartAssessmentResponse(BaseModel):
    attempt_id: str
    level: str
    duration_seconds: int
    remaining_seconds: Optional[int] = None
    time_limit_minutes: int
    started_at: str
    expires_at: str
    server_time: Optional[str] = None
    questions: List[AssessmentQuestionOut]
    instructions: str
    passing_threshold_percent: float


class SubmitAnswerItem(BaseModel):
    question_id: str
    selected_option: Optional[int] = None
    code: Optional[str] = None
    text_answer: Optional[str] = None


class SubmitAssessmentRequest(BaseModel):
    attempt_id: str
    answers: List[SubmitAnswerItem]


class SubmitAssessmentResponse(BaseModel):
    attempt_id: str
    status: str
    score: float
    max_score: float
    percentage: float
    passed: bool
    passing_threshold_percent: float
    level: str
    credential_id: Optional[str] = None
    serial_number: Optional[str] = None
    student_registration_id: Optional[str] = None
    credential_hash: Optional[str] = None
    badge_type: Optional[str] = None
    title: Optional[str] = None
    feedback: str
    time_taken_seconds: int
    certificate_url: Optional[str] = None
    public_verification_url: Optional[str] = None


class StudentCredentialResponse(BaseModel):
    id: str
    credential_id: str
    serial_number: Optional[str] = None
    student_registration_id: Optional[str] = None
    user_id: str
    student_name: str
    college: str
    department: Optional[str] = ""
    level: str
    badge_type: str
    title: str
    skill: str
    score: float
    duration_minutes: int
    issued_at: str
    expires_at: Optional[str] = None
    status: str  # ACTIVE, REVOKED, EXPIRED
    credential_hash: str
    verification_url: str
    public_visibility: bool = True
    is_superseded: bool = False
    superseded_by: Optional[str] = None
    revocation_reason: Optional[str] = None
    template_id: Optional[str] = None
    template_version: Optional[int] = None
    signature_assertion: Optional[str] = None
    pdf_hash: Optional[str] = None


class ItemEvaluationSummary(BaseModel):
    id: str
    title: str
    type: str  # "assignment" or "assessment"
    skill: Optional[str] = None
    score: float = 0.0
    max_score: float = 100.0
    percentage: float = 0.0
    color: str = "INCOMPLETE"  # "GREEN", "BLUE", "INCOMPLETE"
    status: str = "not_started"


class StudentVerificationStatusOverview(BaseModel):
    current_level: str  # NOT_VERIFIED, LEVEL_1_BLUE, LEVEL_2_GREEN
    active_credential: Optional[StudentCredentialResponse] = None
    history: List[StudentCredentialResponse] = []
    level_1_eligible: bool = True
    level_2_eligible: bool = True
    college_name: str = "Placement Intelligence Partner College"
    trust_score: float = 0.0

    # Enhanced College-Verified Assessment & Assignment Audit Fields
    certification_percentage: int = 0  # 0, 50, or 100
    certification_status: str = "NOT_ELIGIBLE"  # "NOT_ELIGIBLE", "50_PERCENT_BLUE", "100_PERCENT_GREEN"
    all_assignments_completed: bool = False
    all_assessments_proven: bool = False
    total_assignments: int = 0
    completed_assignments: int = 0
    total_assessments: int = 0
    passed_assessments: int = 0
    green_count: int = 0
    blue_count: int = 0
    incomplete_count: int = 0
    assignment_items: List[ItemEvaluationSummary] = []
    assessment_items: List[ItemEvaluationSummary] = []
    eligibility_message: str = ""


class PublicCredentialVerificationResponse(BaseModel):
    verified: bool
    status: str  # ACTIVE_VERIFIED, REVOKED, EXPIRED, NOT_FOUND
    candidate_name: str
    college: str
    level: str
    badge_type: str
    title: str
    skill: str
    score: float
    evidence: str
    credential_id: str
    serial_number: Optional[str] = None
    student_registration_id: Optional[str] = None
    template_version: Optional[int] = None
    signature_assertion: Optional[str] = None
    pdf_hash: Optional[str] = None
    verification_hash: str
    issued_at: str
    issuing_platform: str = "Placement Intelligence Digital Credential Authority"
    cryptographic_algorithm: str = "SHA-256 Digest"
    revocation_reason: Optional[str] = None
