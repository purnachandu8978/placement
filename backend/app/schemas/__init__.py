"""Pydantic schemas for the Placement Intelligence application."""
from app.schemas.resume_ai import (
    PersonalInformation,
    ExtractedSkillAI,
    ProjectRecordAI,
    ExperienceRecordAI,
    CertificationRecordAI,
    EducationRecordAI,
    ATSQualityAnalysisAI,
    SemanticSkillClassification,
    ResumeOptimizationSuggestionAI,
    JobMatchResultAI,
    FullResumeAIAnalysisResponse,
)
from app.schemas.job_discovery import (
    JobSourceCreate,
    JobSourceUpdate,
    JobSourceResponse,
    JobItemResponse,
    JobMatchBreakdown,
    JobSyncRunResponse,
    JobIngestionStats,
)

__all__ = [
    "PersonalInformation",
    "ExtractedSkillAI",
    "ProjectRecordAI",
    "ExperienceRecordAI",
    "CertificationRecordAI",
    "EducationRecordAI",
    "ATSQualityAnalysisAI",
    "SemanticSkillClassification",
    "ResumeOptimizationSuggestionAI",
    "JobMatchResultAI",
    "FullResumeAIAnalysisResponse",
    "JobSourceCreate",
    "JobSourceUpdate",
    "JobSourceResponse",
    "JobItemResponse",
    "JobMatchBreakdown",
    "JobSyncRunResponse",
    "JobIngestionStats",
]
