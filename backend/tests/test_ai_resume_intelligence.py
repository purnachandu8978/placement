"""
Unit & Integration Tests for Phase 3:
Advanced AI-Powered Resume Intelligence, Semantic Skill Analysis, and Resilient Gemini Fallbacks.
"""

import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.services.gemini_service import (
    call_gemini_structured_api,
    set_gemini_mock_handler,
    extract_resume_with_gemini,
)
from app.services.skill_normalizer import (
    normalize_skill,
    classify_semantic_skills,
)
from app.services.resume_intelligence import (
    parse_resume_content,
    parse_resume_hybrid_ai,
    optimize_resume_bullets_ai,
    match_resume_to_job_ai,
)


# -----------------------------------------------------------------------------
# 1. Semantic Skill Normalizer & Technology Boundary Separation Tests
# -----------------------------------------------------------------------------

def test_semantic_normalization_aliases():
    """Verify standard canonical normalization mappings."""
    assert normalize_skill("ReactJS") == "React"
    assert normalize_skill("react.js") == "React"
    assert normalize_skill("JS") == "JavaScript"
    assert normalize_skill("vanilla js") == "JavaScript"
    assert normalize_skill("ML") == "Machine Learning"
    assert normalize_skill("k8s") == "Kubernetes"
    assert normalize_skill("Postgres") == "PostgreSQL"
    assert normalize_skill("postgresql") == "PostgreSQL"
    assert normalize_skill("Mongo") == "MongoDB"
    assert normalize_skill("mongodb") == "MongoDB"
    assert normalize_skill("dockerfile") == "Docker"


def test_context_sensitive_normalization():
    """Verify 'Py' only normalizes to 'Python' when surrounding context supports it."""
    # With Python context:
    assert normalize_skill("Py", "Backend developer writing Py scripts for Django") == "Python"
    assert normalize_skill("Py", "Machine learning FastAPI engineer with Py experience") == "Python"
    # Without context / ambiguous:
    assert normalize_skill("Py", "Graphic design and UI sketching") == "Py"


def test_strict_technology_boundary_isolation():
    """Guarantee unrelated technologies are NEVER conflated or merged."""
    assert normalize_skill("Java") == "Java"
    assert normalize_skill("JavaScript") == "JavaScript"
    assert normalize_skill("Java") != normalize_skill("JavaScript")

    assert normalize_skill("C") == "C"
    assert normalize_skill("C++") == "C++"
    assert normalize_skill("C#") == "C#"
    assert normalize_skill("C") != normalize_skill("C++")
    assert normalize_skill("C++") != normalize_skill("C#")


def test_semantic_classification_categories():
    """Verify categorization into core, supporting, missing, and outdated legacy stacks."""
    skills = ["React", "FastAPI", "MongoDB", "Tailwind CSS"]
    text = "Developed frontend with React and styling in Tailwind. Legacy system used jQuery and SVN."

    semantic = classify_semantic_skills(skills, text)

    # Core vs Supporting
    assert "React" in semantic.core_skills
    assert "FastAPI" in semantic.core_skills
    assert "MongoDB" in semantic.core_skills
    assert "Tailwind CSS" in semantic.supporting_skills

    # Missing market expectations for candidate's stack
    assert len(semantic.missing_skills) > 0
    # Expected related engineering skills like TypeScript or Docker
    assert any(s in ("TypeScript", "Docker", "Git", "SQL") for s in semantic.missing_skills)

    # Outdated technologies detected in text
    assert "Jquery" in semantic.outdated_skills
    assert "Svn" in semantic.outdated_skills

    # Skills mapped to approved assessment questions
    assert "React" in semantic.skills_requiring_assessment
    assert "FastAPI" in semantic.skills_requiring_assessment
    assert "MongoDB" in semantic.skills_requiring_assessment


# -----------------------------------------------------------------------------
# 2. Resilient Gemini AI Service & Offline Mock Testing
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_gemini_service_with_mock_handler():
    """Verify structured response parsing and telemetry via mock handler."""
    mock_payload = {
        "personal_info": {
            "name": "Maya Patel",
            "email": "maya@university.edu",
            "college": "National Institute of Technology",
            "degree": "B.Tech Computer Science",
            "graduation_year": 2025,
            "cgpa": 9.1,
        },
        "technical_skills": [
            {
                "skill_name": "React",
                "category": "Frontend",
                "source_evidence": "Engineered single-page application using React 18 and Redux.",
                "confidence": 0.95,
            },
            {
                "skill_name": "Python",
                "category": "Backend & APIs",
                "source_evidence": "Designed high-concurrency microservices using Python and FastAPI.",
                "confidence": 0.92,
            },
        ],
        "projects": [
            {
                "title": "Distributed Task Scheduler",
                "technologies": ["Python", "FastAPI", "Redis"],
                "highlights": ["Processed 5,000 requests/sec with Redis queues."],
                "metrics": ["5,000 req/sec"],
            }
        ],
        "experience": [],
        "education": [],
        "certifications": [],
        "ats_analysis": {
            "section_completeness": {"contact": True, "skills": True, "projects": True},
            "technical_keyword_relevance": 92.0,
            "missing_information_suggestions": ["Add GitHub link in contact header."],
        },
        "optimization_suggestions": [
            {
                "section": "Project: Task Scheduler",
                "original_bullet": "Processed 5,000 requests/sec with Redis queues.",
                "improved_bullet": "Architected distributed queue using Python and Redis, sustaining 5,000 req/sec throughput.",
                "improvement_rationale": "Applies STAR format with active power verb.",
                "action_verbs_used": ["Architected"],
                "quantified_metrics_referenced": ["5,000 req/sec"],
            }
        ],
    }

    set_gemini_mock_handler(lambda payload: mock_payload)
    try:
        data, usage = await extract_resume_with_gemini("Resume text dummy")
        assert data["personal_info"]["name"] == "Maya Patel"
        assert len(data["technical_skills"]) == 2
        assert usage["totalTokenCount"] > 0
        assert usage["latency_ms"] >= 0
    finally:
        set_gemini_mock_handler(None)


@pytest.mark.asyncio
async def test_hybrid_pipeline_gemini_success():
    """Verify hybrid pipeline uses Gemini data when available and normalizes skills."""
    mock_payload = {
        "personal_info": {
            "name": "Rohan Verma",
            "email": "rohan@college.edu",
            "college": "IIT Delhi",
            "degree": "B.Tech CSE",
            "graduation_year": 2026,
            "cgpa": 8.8,
            "github_url": "https://github.com/rohanv",
            "linkedin_url": "",
        },
        "technical_skills": [
            {
                "skill_name": "ReactJS",  # will be normalized to React
                "category": "Frontend",
                "source_evidence": "Developed interactive UI components in ReactJS.",
                "confidence": 0.96,
            },
            {
                "skill_name": "Postgres",  # will be normalized to PostgreSQL
                "category": "Databases",
                "source_evidence": "Managed relational storage in Postgres.",
                "confidence": 0.91,
            },
        ],
        "projects": [],
        "experience": [],
        "education": [],
        "certifications": [],
        "ats_analysis": {
            "missing_information_suggestions": ["Add LinkedIn profile URL."],
        },
        "optimization_suggestions": [],
    }

    set_gemini_mock_handler(lambda payload: mock_payload)
    try:
        res = await parse_resume_hybrid_ai(
            raw_text="Developed interactive UI components in ReactJS. Managed relational storage in Postgres.",
            filename="rohan_resume.pdf",
        )
        assert res["candidate_name"] == "Rohan Verma"
        # Verify normalized skill names
        assert "React" in res["skill_names"]
        assert "PostgreSQL" in res["skill_names"]
        assert res["extraction_metadata"]["method"] == "gemini_ai"
        assert res["extraction_metadata"]["fallback_used"] is False
    finally:
        set_gemini_mock_handler(None)


# -----------------------------------------------------------------------------
# 3. Graceful Fallback on Failures & Zero-Downtime Guarantee
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_hybrid_fallback_on_gemini_exception():
    """Verify seamless fallback to deterministic regex when Gemini raises an exception."""
    def error_mock(payload):
        raise RuntimeError("Simulated Gemini 429 Rate Limit Exhausted")

    set_gemini_mock_handler(error_mock)
    try:
        sample_text = """
        Arjun Sharma
        arjun@placement.edu | +91 9876543210
        Education: B.Tech Computer Science, NIT Karnataka (2025) - CGPA 8.6
        Technical Skills: React, Python, FastAPI, Docker, PostgreSQL
        Projects:
        - Placement Portal: Developed full stack application using React and FastAPI.
        """
        res = await parse_resume_hybrid_ai(raw_text=sample_text, filename="arjun.pdf")

        # Must not crash; fallback data must be intact
        assert res["extraction_metadata"]["fallback_used"] is True
        assert res["extraction_metadata"]["method"] == "deterministic_fallback"
        assert "React" in res["skill_names"]
        assert "Python" in res["skill_names"]
        assert "FastAPI" in res["skill_names"]
        assert res["ats_score"] > 0
    finally:
        set_gemini_mock_handler(None)


@pytest.mark.asyncio
async def test_deterministic_extraction_baseline():
    """Verify deterministic fallback works offline with different resume formats."""
    text_sparse = "Python programmer interested in internships."
    parsed = parse_resume_content(text_sparse)
    assert "Python" in parsed["skill_names"]
    assert parsed["ats_score"] >= 0


# -----------------------------------------------------------------------------
# 4. Anti-Hallucination Evidence Verification
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_anti_hallucination_evidence_guarantee():
    """Verify skills without textual evidence in resume get grounded from actual text."""
    mock_payload = {
        "personal_info": {"name": "Test User"},
        "technical_skills": [
            {
                "skill_name": "Docker",
                "category": "Cloud & DevOps",
                "source_evidence": "",  # Empty evidence from AI
                "confidence": 0.8,
            }
        ],
        "projects": [],
        "experience": [],
        "education": [],
        "certifications": [],
        "ats_analysis": {},
        "optimization_suggestions": [],
    }

    set_gemini_mock_handler(lambda p: mock_payload)
    try:
        resume_text = "Experienced with Docker containers and Docker Compose in Linux."
        res = await parse_resume_hybrid_ai(raw_text=resume_text, filename="test.pdf")

        docker_skill = next((s for s in res["extracted_skills"] if s["skill_name"] == "Docker"), None)
        assert docker_skill is not None
        # Evidence must not be empty; grounded in text
        assert len(docker_skill["source_evidence"]) > 0
        assert "docker" in docker_skill["source_evidence"].lower()
    finally:
        set_gemini_mock_handler(None)


# -----------------------------------------------------------------------------
# 5. Explainable Job Matching & AI Bullet Optimization
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_explainable_job_matching():
    """Verify explainable job matching returns matched, missing, and breakdown."""
    resume_text = "Proficient in React, TypeScript, and HTML/CSS with Git workflow."
    skills = ["React", "TypeScript", "HTML/CSS", "Git"]

    res = await match_resume_to_job_ai(
        extracted_text=resume_text,
        extracted_skills=skills,
        job_title="Frontend Engineer",
        job_description="Seeking Frontend Engineer with React, TypeScript, Redux, and Jest experience.",
        required_skills=["React", "TypeScript", "Redux", "Jest"],
    )

    assert "match_score" in res
    assert "React" in res["required_skills_matched"]
    assert "TypeScript" in res["required_skills_matched"]
    assert "Redux" in res["missing_skills"]
    assert "Jest" in res["missing_skills"]
    assert len(res["improvement_recommendations"]) > 0


@pytest.mark.asyncio
async def test_ai_bullet_optimization_student_review_flow():
    """Verify AI bullet optimization provides STAR format and enforces student review."""
    projects = [
        {
            "title": "Cloud Analytics Platform",
            "highlights": ["Built backend endpoints using FastAPI and PostgreSQL database."],
            "technologies": ["FastAPI", "PostgreSQL"],
        }
    ]

    opt = await optimize_resume_bullets_ai(
        extracted_text="Built backend endpoints using FastAPI and PostgreSQL database.",
        projects=projects,
        target_role="Backend Engineer",
    )

    assert len(opt["suggestions"]) > 0
    first_suggestion = opt["suggestions"][0]
    # Every bullet must default to student_approved=False
    assert first_suggestion["student_approved"] is False
    assert len(first_suggestion["improved_bullet"]) > 0
    assert "disclaimer" in opt


# -----------------------------------------------------------------------------
# 6. Endpoints Integration Tests (Reprocess AI, Optimize AI, Approve, Semantic)
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_resume_endpoints_phase3(client: AsyncClient, test_student_token):
    """Test all Phase 3 API endpoints using authenticated student session."""
    token, _ = test_student_token
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Upload a resume
    sample_content = (
        b"Arjun Sharma\narjun@placement.edu | +91 9876543210\n"
        b"Education: B.Tech Computer Science, NITK (2025)\n"
        b"Skills: React, Python, PostgreSQL, Docker\n"
        b"Projects:\n"
        b"- Placement Portal: Built full-stack dashboard with React and PostgreSQL.\n"
    )
    files = {"file": ("arjun_resume.txt", sample_content, "text/plain")}
    up_res = await client.post("/api/v1/resumes/upload", files=files, headers=headers)
    assert up_res.status_code == 200, up_res.text
    resume_id = up_res.json()["resume_id"]

    # 2. Get semantic skills endpoint
    sem_res = await client.get(f"/api/v1/resumes/{resume_id}/semantic-skills", headers=headers)
    assert sem_res.status_code == 200, sem_res.text
    sem_data = sem_res.json()
    assert "core_skills" in sem_data
    assert "missing_skills" in sem_data
    assert "skills_requiring_assessment" in sem_data

    # 3. AI bullet optimization endpoint
    opt_res = await client.post(
        f"/api/v1/resumes/{resume_id}/optimize-ai",
        json={"job_title": "Full Stack Developer"},
        headers=headers,
    )
    assert opt_res.status_code == 200, opt_res.text
    opt_data = opt_res.json()
    assert "suggestions" in opt_data
    assert len(opt_data["suggestions"]) > 0

    # 4. Approve optimization endpoint
    bullets_to_approve = [opt_data["suggestions"][0]]
    app_res = await client.post(
        f"/api/v1/resumes/{resume_id}/approve-optimization",
        json={"approved_bullets": bullets_to_approve},
        headers=headers,
    )
    assert app_res.status_code == 200, app_res.text
    assert app_res.json()["approved_bullets"][0]["student_approved"] is True

    # 5. Explainable AI job matching endpoint
    match_res = await client.post(
        f"/api/v1/resumes/{resume_id}/match-job-ai",
        json={
            "job_title": "Full Stack Developer",
            "job_description": "We need React and Python engineers with PostgreSQL experience.",
            "required_skills": ["React", "Python", "PostgreSQL", "AWS"],
        },
        headers=headers,
    )
    assert match_res.status_code == 200, match_res.text
    match_data = match_res.json()
    assert "match_score" in match_data
    assert "required_skills_matched" in match_data

    # 6. Reprocess with AI endpoint
    reproc_res = await client.post(
        f"/api/v1/resumes/{resume_id}/reprocess-ai",
        headers=headers,
    )
    assert reproc_res.status_code == 200, reproc_res.text
    assert reproc_res.json()["message"] == "Resume reprocessed successfully"
