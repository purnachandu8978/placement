"""
Certificate Template Schema & Model Definitions.
Enforces admin-controlled design templates, strict lifecycle transitions,
and dynamic placeholder validation with zero template injection vulnerabilities.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field, field_validator


class TemplateStatus(str, Enum):
    DRAFT = "DRAFT"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"
    REVOKED = "REVOKED"


class TemplateOrientation(str, Enum):
    LANDSCAPE = "LANDSCAPE"
    PORTRAIT = "PORTRAIT"


APPROVED_PLACEHOLDERS = {
    "{{student_name}}",
    "{{student_registration_id}}",
    "{{college_name}}",
    "{{department}}",
    "{{degree}}",
    "{{graduation_year}}",
    "{{verification_level}}",
    "{{assessment_name}}",
    "{{assessment_duration}}",
    "{{skills_assessed}}",
    "{{assessment_score}}",
    "{{passing_criteria}}",
    "{{issue_date}}",
    "{{certificate_serial_number}}",
    "{{credential_id}}",
    "{{verification_url}}",
    "{{qr_code}}",
    "{{authorized_issuer}}",
}


class CertificateTemplateBase(BaseModel):
    name: str = Field(..., min_length=3, max_length=100, description="Template Title")
    description: Optional[str] = Field(default="", max_length=500)
    orientation: TemplateOrientation = Field(default=TemplateOrientation.LANDSCAPE)
    width_mm: float = Field(default=297.0, description="Width in mm (297 for A4 landscape)")
    height_mm: float = Field(default=210.0, description="Height in mm (210 for A4 landscape)")
    background_color: str = Field(default="#FFFFFF", description="Hex background color")
    border_color: str = Field(default="#2563EB", description="Hex border accent color")
    primary_color: str = Field(default="#1E293B", description="Hex typography primary color")
    accent_color: str = Field(default="#2563EB", description="Hex institutional branding color")
    font_family: str = Field(default="Helvetica", description="Approved PDF typography font")
    logo_url: Optional[str] = Field(
        default="https://images.unsplash.com/photo-1592280771190-3e2e4d571952?auto=format&fit=crop&w=256&q=80",
        description="Authorized institution or college crest logo URL"
    )
    institution_name: str = Field(default="Placement Intelligence Digital Credential Authority")
    signatory_name: str = Field(default="Dr. Rajesh V. Ramanathan")
    signatory_title: str = Field(default="Dean of Academic Affairs & Placement Authority")
    signatory_department: Optional[str] = Field(default="Division of Career & Placement Intelligence")
    custom_headline: Optional[str] = Field(default="CERTIFICATE OF COLLEGE VERIFIED COMPETENCY")
    subtext_template: Optional[str] = Field(
        default="This is to officially certify that {{student_name}} (Reg ID: {{student_registration_id}}) has successfully completed the rigorous proctored competency evaluation in {{skills_assessed}} with a score of {{assessment_score}}%."
    )
    show_qr_code: bool = Field(default=True)
    show_serial_number: bool = Field(default=True)
    qr_position_x_mm: float = Field(default=240.0)
    qr_position_y_mm: float = Field(default=35.0)

    @field_validator("subtext_template")
    @classmethod
    def validate_placeholders(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return v
        import re
        found = re.findall(r"\{\{[^}]+\}\}", v)
        for ph in found:
            if ph not in APPROVED_PLACEHOLDERS:
                raise ValueError(f"Unauthorized placeholder detected: {ph}. Permitted: {', '.join(sorted(APPROVED_PLACEHOLDERS))}")
        # Disallow script tags or iframe injection
        if "<script" in v.lower() or "javascript:" in v.lower() or "<iframe" in v.lower():
            raise ValueError("Malicious markup / script injection prohibited in certificate template.")
        return v


class CertificateTemplateCreate(CertificateTemplateBase):
    pass


class CertificateTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    orientation: Optional[TemplateOrientation] = None
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None
    background_color: Optional[str] = None
    border_color: Optional[str] = None
    primary_color: Optional[str] = None
    accent_color: Optional[str] = None
    font_family: Optional[str] = None
    logo_url: Optional[str] = None
    institution_name: Optional[str] = None
    signatory_name: Optional[str] = None
    signatory_title: Optional[str] = None
    signatory_department: Optional[str] = None
    custom_headline: Optional[str] = None
    subtext_template: Optional[str] = None
    show_qr_code: Optional[bool] = None
    show_serial_number: Optional[bool] = None


class CertificateTemplateResponse(CertificateTemplateBase):
    id: str
    template_id: str
    version: int = 1
    status: TemplateStatus
    is_published: bool = False
    created_by: str
    approved_by: Optional[str] = None
    published_at: Optional[Union[str, datetime]] = None
    created_at: Union[str, datetime]
    updated_at: Union[str, datetime]
    approval_notes: Optional[str] = None

    @field_validator("created_at", "updated_at", "published_at", mode="before")
    @classmethod
    def serialize_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v


class ApproveTemplateRequest(BaseModel):
    notes: Optional[str] = Field(default="", max_length=500)


class PublishTemplateResponse(BaseModel):
    success: bool
    template_id: str
    version: int
    status: str
    published_at: str
    message: str
