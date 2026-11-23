from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class HiringStatus(str, Enum):
    OPEN_ROLES_VERIFIED = "OPEN_ROLES_VERIFIED"
    INTERNSHIPS_VERIFIED = "INTERNSHIPS_VERIFIED"
    CAREERS_PAGE_AVAILABLE = "CAREERS_PAGE_AVAILABLE"
    NO_CURRENT_OPENINGS = "NO_CURRENT_OPENINGS"
    HIRING_STATUS_UNKNOWN = "HIRING_STATUS_UNKNOWN"
    SOURCE_UNAVAILABLE = "SOURCE_UNAVAILABLE"
    EXPIRED_ROLES = "EXPIRED_ROLES"


class CompanyClassification(str, Enum):
    STARTUP = "STARTUP"
    ESTABLISHED_TECH = "ESTABLISHED_TECH"
    PRODUCT_COMPANY = "PRODUCT_COMPANY"
    IT_SERVICES = "IT_SERVICES"
    EMERGING_VENTURE = "EMERGING_VENTURE"
    INCUBATED_VENTURE = "INCUBATED_VENTURE"
    OTHER = "OTHER"


class CompanyVerificationStatus(str, Enum):
    GOVERNMENT_VERIFIED = "GOVERNMENT_VERIFIED"
    MCA_VERIFIED = "MCA_VERIFIED"
    OFFICIAL_WEBSITE_VERIFIED = "OFFICIAL_WEBSITE_VERIFIED"
    INCUBATOR_VERIFIED = "INCUBATOR_VERIFIED"
    INDEPENDENTLY_SOURCED = "INDEPENDENTLY_SOURCED"
    SELF_REPORTED = "SELF_REPORTED"
    COMMUNITY_SUBMITTED = "COMMUNITY_SUBMITTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    UNVERIFIED = "UNVERIFIED"
    INACTIVE = "INACTIVE"


class DpiitStatus(str, Enum):
    RECOGNISED = "RECOGNISED"
    NOT_RECOGNISED = "NOT_RECOGNISED"
    UNKNOWN = "UNKNOWN"
    NOT_CHECKED = "NOT_CHECKED"


class LocationPrecision(str, Enum):
    VERIFIED_ADDRESS = "VERIFIED_ADDRESS"
    VERIFIED_CITY = "VERIFIED_CITY"
    APPROXIMATE_CENTROID = "APPROXIMATE_CENTROID"
    DISTRICT_LEVEL = "DISTRICT_LEVEL"
    STATE_LEVEL = "STATE_LEVEL"
    UNKNOWN = "UNKNOWN"


class ApplicationStatus(str, Enum):
    SAVED = "SAVED"
    APPLYING = "APPLYING"
    APPLIED = "APPLIED"
    ASSESSMENT = "ASSESSMENT"
    INTERVIEW = "INTERVIEW"
    OFFER = "OFFER"
    REJECTED = "REJECTED"
    WITHDRAWN = "WITHDRAWN"


class StartupResponse(BaseModel):
    id: str
    startup_id: str
    name: str
    legal_name: Optional[str] = None
    logo_url: str
    description: str
    industry: str
    sector: str
    sectors: Optional[List[str]] = None
    tech_stack: Optional[List[str]] = None
    company_classification: str = CompanyClassification.STARTUP.value
    verification_status: str = CompanyVerificationStatus.OFFICIAL_WEBSITE_VERIFIED.value
    dpiit_status: str = DpiitStatus.UNKNOWN.value
    location_precision: str = LocationPrecision.VERIFIED_CITY.value
    hq_city: str
    hq_state: str
    district: Optional[str] = None
    lat: float
    lng: float
    website: str
    careers_url: str
    founding_year: Optional[int] = None
    dpiit_recognized: bool = False
    dpiit_registration_number: Optional[str] = None
    funding_stage: str = "Seed / Early Stage"
    funding_info: Optional[str] = None
    company_size: str = "50-200"
    employee_range: Optional[str] = None
    incubator_accelerator: Optional[str] = None
    mca_cin: Optional[str] = None
    hiring_status: str = HiringStatus.CAREERS_PAGE_AVAILABLE.value
    internship_available: bool = False
    fresher_hiring: bool = True
    college_partner: bool = False
    data_source: str = "Multi-Source Tech Directory"
    source_confidence: str = "Verified"
    source_provenance: Optional[List[str]] = None
    discovery_date: str
    last_verified_at: str
    is_emerging: bool = False
    open_jobs_count: int = 0
    is_saved_watchlist: Optional[bool] = False
    match_score: Optional[float] = None
    match_reasons: Optional[List[str]] = None


class StartupCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    legal_name: Optional[str] = None
    logo_url: Optional[str] = None
    description: str = Field(..., min_length=10)
    industry: str
    sector: str
    sectors: Optional[List[str]] = None
    tech_stack: Optional[List[str]] = None
    company_classification: CompanyClassification = CompanyClassification.STARTUP
    verification_status: CompanyVerificationStatus = CompanyVerificationStatus.UNDER_REVIEW
    dpiit_status: DpiitStatus = DpiitStatus.UNKNOWN
    location_precision: LocationPrecision = LocationPrecision.VERIFIED_CITY
    hq_city: str
    hq_state: str
    district: Optional[str] = None
    lat: float
    lng: float
    website: str
    careers_url: str
    founding_year: Optional[int] = None
    dpiit_recognized: bool = False
    dpiit_registration_number: Optional[str] = None
    funding_stage: Optional[str] = "Seed"
    funding_info: Optional[str] = None
    company_size: Optional[str] = "10-50"
    incubator_accelerator: Optional[str] = None
    mca_cin: Optional[str] = None
    hiring_status: HiringStatus = HiringStatus.HIRING_STATUS_UNKNOWN
    internship_available: bool = False
    fresher_hiring: bool = True
    college_partner: bool = False


class StartupUpdateRequest(BaseModel):
    name: Optional[str] = None
    legal_name: Optional[str] = None
    logo_url: Optional[str] = None
    description: Optional[str] = None
    industry: Optional[str] = None
    sector: Optional[str] = None
    sectors: Optional[List[str]] = None
    tech_stack: Optional[List[str]] = None
    company_classification: Optional[CompanyClassification] = None
    verification_status: Optional[CompanyVerificationStatus] = None
    dpiit_status: Optional[DpiitStatus] = None
    location_precision: Optional[LocationPrecision] = None
    hq_city: Optional[str] = None
    hq_state: Optional[str] = None
    district: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    website: Optional[str] = None
    careers_url: Optional[str] = None
    founding_year: Optional[int] = None
    dpiit_recognized: Optional[bool] = None
    dpiit_registration_number: Optional[str] = None
    funding_stage: Optional[str] = None
    funding_info: Optional[str] = None
    company_size: Optional[str] = None
    incubator_accelerator: Optional[str] = None
    mca_cin: Optional[str] = None
    hiring_status: Optional[HiringStatus] = None
    internship_available: Optional[bool] = None
    fresher_hiring: Optional[bool] = None
    college_partner: Optional[bool] = None


class StartupJobResponse(BaseModel):
    id: str
    job_id: str
    startup_id: str
    company_name: str
    company_logo: str
    title: str
    location: str
    city: str
    state: str
    work_mode: str
    employment_type: str
    experience_level: str
    required_skills: List[str]
    salary: str
    apply_url: str
    posting_date: str
    match_score: Optional[float] = None
    match_reasons: Optional[List[str]] = None


class StartupMapHub(BaseModel):
    city: str
    state: str
    lat: float
    lng: float
    startup_count: int
    hiring_count: int
    top_sectors: List[str]
    sample_startups: List[Dict[str, Any]] = []


class StartupMapDataResponse(BaseModel):
    total_startups: int
    total_hiring: int
    hubs: List[StartupMapHub]
    state_counts: Dict[str, int]
    sector_counts: Dict[str, int]


class ApplicationTrackRequest(BaseModel):
    job_id: Optional[str] = None
    startup_id: Optional[str] = None
    notes: Optional[str] = None


class ApplicationStatusUpdateRequest(BaseModel):
    status: ApplicationStatus
    notes: Optional[str] = None


class StudentJobApplicationResponse(BaseModel):
    id: str
    user_id: str
    job_id: str
    job_title: str
    startup_id: str
    company_name: str
    company_logo: Optional[str] = None
    location: str
    apply_url: str
    status: str
    applied_at: str
    updated_at: str
    notes: Optional[str] = None


class WatchlistToggleRequest(BaseModel):
    startup_id: str
    express_interest: bool = False
    preferred_role: Optional[str] = None


class WatchlistResponse(BaseModel):
    startup_id: str
    is_saved: bool
    express_interest: bool
    message: str


class StartupOutreachCreate(BaseModel):
    startup_id: str
    company_name: str
    contact_person: str
    contact_email: Optional[str] = None
    contact_role: Optional[str] = None
    partnership_stage: str = "EXPLORATORY"  # EXPLORATORY, DISCUSSING_MOU, ACTIVE_RECRUITMENT, POOLED_DRIVE, DECLINED
    notes: Optional[str] = None
    target_branches: Optional[List[str]] = None
    expected_hires_count: Optional[int] = 0


class StartupOutreachResponse(BaseModel):
    id: str
    outreach_id: str
    startup_id: str
    company_name: str
    contact_person: str
    contact_email: Optional[str] = None
    partnership_stage: str
    notes: Optional[str] = None
    created_by: str
    created_at: str
    updated_at: str
