"""
Pydantic schemas for AI-powered resume parsing, semantic skill intelligence,
ATS quality diagnostics, and bullet optimization.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class PersonalInformation(BaseModel):
    name: str = Field(default="", description="Full name of candidate as stated on resume")
    email: str = Field(default="", description="Email address extracted from resume")
    phone: str = Field(default="", description="Phone number")
    college: str = Field(default="", description="College or University name")
    degree: str = Field(default="", description="Degree title (e.g. B.Tech, B.E., M.S.)")
    branch: str = Field(default="", description="Branch or Major (e.g. Computer Science)")
    graduation_year: Optional[int] = Field(default=None, description="Graduation year (e.g. 2025)")
    cgpa: Optional[float] = Field(default=None, description="CGPA or GPA on scale 0-10 or 0-4")
    github_url: str = Field(default="", description="GitHub profile URL")
    linkedin_url: str = Field(default="", description="LinkedIn profile URL")


class ExtractedSkillAI(BaseModel):
    skill_name: str = Field(description="Canonical normalized skill name")
    category: str = Field(
        default="Other",
        description="One of: Frontend, Backend & APIs, Databases, Cloud & DevOps, AI & Data Science, Testing & Security, Core CS",
    )
    source_evidence: str = Field(
        default="",
        description="Exact snippet or sentence quote from resume where the skill is demonstrated",
    )
    confidence: float = Field(
        default=0.85,
        ge=0.0,
        le=1.0,
        description="Confidence score between 0.0 and 1.0 based on evidence depth",
    )
    related_project_or_experience: Optional[str] = Field(
        default=None,
        description="Name of the specific project or role demonstrating this skill",
    )
    extraction_method: Literal["gemini_ai", "deterministic_fallback"] = Field(
        default="gemini_ai",
        description="Origin of extraction engine",
    )
    assessment_status: Literal["unverified", "verified"] = Field(
        default="unverified",
        description="Verification state in placement assessment bank",
    )


class ProjectRecordAI(BaseModel):
    title: str = Field(description="Project title or name")
    role: Optional[str] = Field(default=None, description="Candidate role on project")
    technologies: List[str] = Field(default_factory=list, description="Technologies and libraries used")
    highlights: List[str] = Field(default_factory=list, description="Bullet points detailing architecture and achievements")
    metrics: List[str] = Field(default_factory=list, description="Quantified outcomes extracted directly from bullet points")


class ExperienceRecordAI(BaseModel):
    company: str = Field(description="Company or Organization name")
    role: str = Field(description="Job title or Internship position")
    duration: Optional[str] = Field(default=None, description="Duration or date range")
    location: Optional[str] = Field(default=None, description="Location or remote indicator")
    responsibilities: List[str] = Field(default_factory=list, description="Responsibilities and contributions")
    technologies: List[str] = Field(default_factory=list, description="Technologies utilized in this role")


class CertificationRecordAI(BaseModel):
    name: str = Field(description="Name of certification or credential")
    issuer: Optional[str] = Field(default=None, description="Issuing organization (e.g. AWS, Coursera, Google)")
    year: Optional[int] = Field(default=None, description="Year earned if mentioned")


class EducationRecordAI(BaseModel):
    institution: str = Field(description="School, College, or University")
    degree: str = Field(description="Degree or Diploma")
    field_of_study: Optional[str] = Field(default=None, description="Major, branch, or field of study")
    graduation_year: Optional[int] = Field(default=None, description="Graduation year")
    score: Optional[str] = Field(default=None, description="CGPA, percentage, or honors")


class SemanticSkillClassification(BaseModel):
    core_skills: List[str] = Field(
        default_factory=list,
        description="Central high-proficiency skills defining candidate's main technical identity",
    )
    supporting_skills: List[str] = Field(
        default_factory=list,
        description="Complementary libraries, tooling, and operational skills",
    )
    missing_skills: List[str] = Field(
        default_factory=list,
        description="High-demand industry skills typically expected alongside candidate's core stack but absent from resume",
    )
    related_skills: List[str] = Field(
        default_factory=list,
        description="Adjacent skills candidate could quickly adopt based on existing stack",
    )
    outdated_skills: List[str] = Field(
        default_factory=list,
        description="Legacy technologies that may detract from modern recruiter appeal",
    )
    skills_requiring_assessment: List[str] = Field(
        default_factory=list,
        description="Detected core technical competencies that need proctored test verification",
    )


class ATSQualityAnalysisAI(BaseModel):
    estimated_ats_score: float = Field(
        ge=0.0,
        le=100.0,
        description="Algorithmic ATS readiness approximation (0-100)",
    )
    breakdown: Dict[str, float] = Field(
        default_factory=dict,
        description="Scores for contact, structure, skills, impact, readability",
    )
    section_completeness: Dict[str, bool] = Field(
        default_factory=dict,
        description="Presence of standard resume sections",
    )
    technical_keyword_relevance: float = Field(
        default=0.0,
        ge=0.0,
        le=100.0,
        description="Relevance and density of technical stack",
    )
    project_description_quality: str = Field(
        default="Moderate",
        description="Evaluation: Needs Improvement, Moderate, Strong, Exceptional",
    )
    experience_description_quality: str = Field(
        default="Moderate",
        description="Evaluation of internship/work description clarity and depth",
    )
    readability_analysis: str = Field(
        default="",
        description="Analysis of conciseness, formatting layout, and bullet parsing ease",
    )
    missing_information_suggestions: List[str] = Field(
        default_factory=list,
        description="Specific actionable missing elements",
    )
    role_specific_recommendations: List[str] = Field(
        default_factory=list,
        description="Suggestions tailored to target graduate software roles",
    )
    disclaimer: str = Field(
        default="Estimated ATS score is an internal heuristic simulation and does not guarantee results with proprietary third-party ATS systems (e.g., Workday, Taleo, Greenhouse).",
        description="Prominent disclosure distinguishing estimation from 3rd-party ATS systems",
    )


class ResumeOptimizationSuggestionAI(BaseModel):
    section: str = Field(description="Section name (e.g. Project: Placement Portal)")
    original_bullet: str = Field(description="Original bullet verbatim from resume")
    improved_bullet: str = Field(description="AI rewritten bullet using STAR framework with active power verb")
    improvement_rationale: str = Field(description="Why this rewrite increases ATS signal and recruiter readability")
    action_verbs_used: List[str] = Field(default_factory=list, description="Action verbs introduced")
    quantified_metrics_referenced: List[str] = Field(
        default_factory=list,
        description="Metrics preserved or highlighted from source evidence without fabrication",
    )
    student_approved: bool = Field(
        default=False,
        description="Whether candidate has explicitly reviewed and accepted this rewrite",
    )


class JobMatchResultAI(BaseModel):
    job_title: str = Field(default="Target Role")
    match_score: float = Field(ge=0.0, le=100.0, description="Overall explainable match percentage")
    required_skills_matched: List[str] = Field(default_factory=list)
    preferred_skills_matched: List[str] = Field(default_factory=list)
    missing_skills: List[str] = Field(default_factory=list)
    experience_match_level: str = Field(default="Entry-Level Fit")
    education_match: bool = Field(default=True)
    role_relevance_summary: str = Field(default="")
    improvement_recommendations: List[str] = Field(default_factory=list)
    explainable_breakdown: Dict[str, Any] = Field(default_factory=dict)


class ExtractionMetadata(BaseModel):
    method: Literal["gemini_ai", "deterministic_fallback"] = "deterministic_fallback"
    model: str = "regex-taxonomy-v1"
    latency_ms: int = 0
    tokens_used: int = 0
    fallback_used: bool = False
    error_message: Optional[str] = None


class FullResumeAIAnalysisResponse(BaseModel):
    personal_info: PersonalInformation
    technical_skills: List[ExtractedSkillAI]
    projects: List[ProjectRecordAI]
    experience: List[ExperienceRecordAI]
    education: List[EducationRecordAI]
    certifications: List[CertificationRecordAI]
    semantic_skills: SemanticSkillClassification
    ats_analysis: ATSQualityAnalysisAI
    optimization_suggestions: List[ResumeOptimizationSuggestionAI]
    metadata: ExtractionMetadata
