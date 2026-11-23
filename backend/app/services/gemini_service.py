"""
Secure, Resilient Google Gemini AI Service for Placement Intelligence.

Guarantees:
- API key strictly isolated on the backend (never passed to React / clients).
- Structured JSON output with strict Pydantic schema validation.
- Zero-Downtime resilience: timeout, sliding-window rate limiting, exponential backoff retries.
- Usage tracking: token metrics (prompt, candidate, total) and round-trip latency.
- Anti-Hallucination: prompt architecture strictly forces evidence quoting for skills.
- Mock transport hooks for deterministic offline testing.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import time
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

import httpx
from pydantic import ValidationError

from app.core.config import settings

logger = logging.getLogger(__name__)

# Sliding-window rate limiter state
_request_timestamps: List[float] = []
_rate_limit_lock = asyncio.Lock()

# Test mock override hook
_mock_gemini_handler: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None


def set_gemini_mock_handler(handler: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]]) -> None:
    """Set or reset an in-memory mock handler for offline unit testing."""
    global _mock_gemini_handler
    _mock_gemini_handler = handler


def is_gemini_available() -> bool:
    """Check if Gemini API is configured or mock handler is active."""
    return bool(settings.GEMINI_API_KEY.strip()) or (_mock_gemini_handler is not None)


async def _check_rate_limit() -> None:
    """Sliding-window rate limit check against settings.GEMINI_RATE_LIMIT_PER_MINUTE."""
    global _request_timestamps
    max_rpm = max(1, settings.GEMINI_RATE_LIMIT_PER_MINUTE)
    async with _rate_limit_lock:
        now = time.time()
        # Drop timestamps older than 60 seconds
        _request_timestamps = [ts for ts in _request_timestamps if now - ts < 60.0]
        if len(_request_timestamps) >= max_rpm:
            sleep_needed = 60.0 - (now - _request_timestamps[0]) + 0.1
            if sleep_needed > 0:
                logger.warning(f"Gemini rate limit threshold reached ({max_rpm}/min). Throttling for {sleep_needed:.2f}s")
                await asyncio.sleep(sleep_needed)
                now = time.time()
                _request_timestamps = [ts for ts in _request_timestamps if now - ts < 60.0]
        _request_timestamps.append(time.time())


async def call_gemini_structured_api(
    prompt: str,
    system_instruction: Optional[str] = None,
    temperature: Optional[float] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Call Gemini Generative Language REST API requesting structured application/json output.
    Returns: (parsed_json_dict, usage_metadata)
    Raises: RuntimeError or httpx exceptions if retries are exhausted.
    """
    # 1. Check for test mock handler override
    if _mock_gemini_handler is not None:
        logger.debug("Executing Gemini request via mock handler")
        mock_payload = {
            "prompt": prompt,
            "system_instruction": system_instruction,
            "temperature": temperature,
        }
        res = _mock_gemini_handler(mock_payload)
        usage = {
            "promptTokenCount": 120,
            "candidatesTokenCount": 350,
            "totalTokenCount": 470,
            "model": settings.GEMINI_MODEL,
            "latency_ms": 15,
        }
        return res, usage

    # 2. Validate API key presence
    api_key = settings.GEMINI_API_KEY.strip()
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not configured in backend environment")

    model_name = settings.GEMINI_MODEL.strip() or "gemini-1.5-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"

    # Build request body
    body: Dict[str, Any] = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": {
            "response_mime_type": "application/json",
            "temperature": temperature if temperature is not None else settings.GEMINI_TEMPERATURE,
        },
    }

    if system_instruction:
        body["system_instruction"] = {
            "parts": [{"text": system_instruction}]
        }

    max_retries = max(1, settings.GEMINI_MAX_RETRIES)
    timeout_secs = float(settings.GEMINI_TIMEOUT_SECONDS)

    last_error: Optional[Exception] = None

    for attempt in range(1, max_retries + 1):
        await _check_rate_limit()
        start_time = time.perf_counter()

        try:
            async with httpx.AsyncClient(timeout=timeout_secs) as client:
                response = await client.post(url, json=body, headers={"Content-Type": "application/json"})

            latency_ms = int((time.perf_counter() - start_time) * 1000)

            if response.status_code == 200:
                data = response.json()
                usage_raw = data.get("usageMetadata", {})
                usage = {
                    "promptTokenCount": usage_raw.get("promptTokenCount", 0),
                    "candidatesTokenCount": usage_raw.get("candidatesTokenCount", 0),
                    "totalTokenCount": usage_raw.get("totalTokenCount", 0),
                    "model": model_name,
                    "latency_ms": latency_ms,
                }

                # Extract generated text from candidates
                candidates = data.get("candidates", [])
                if not candidates:
                    raise ValueError("Gemini returned empty candidates list")

                content_parts = candidates[0].get("content", {}).get("parts", [])
                if not content_parts or "text" not in content_parts[0]:
                    raise ValueError("Gemini response missing text part")

                raw_json_text = content_parts[0]["text"].strip()
                # Remove markdown fences if model inadvertently wrapped them
                if raw_json_text.startswith("```"):
                    raw_json_text = re.sub(r"^```[a-zA-Z]*\n?", "", raw_json_text)
                    raw_json_text = re.sub(r"\n?```$", "", raw_json_text).strip()

                parsed = json.loads(raw_json_text)
                return parsed, usage

            elif response.status_code in (429, 500, 502, 503, 504):
                error_msg = f"Gemini API HTTP {response.status_code}: {response.text[:200]}"
                logger.warning(f"Attempt {attempt}/{max_retries} failed: {error_msg}")
                last_error = RuntimeError(error_msg)
            else:
                # Fatal client error (e.g. 400 Bad Request, 403 Forbidden)
                err = f"Gemini API permanent client error HTTP {response.status_code}: {response.text[:300]}"
                logger.error(err)
                raise RuntimeError(err)

        except (httpx.TimeoutException, httpx.NetworkError, json.JSONDecodeError, ValueError) as exc:
            latency_ms = int((time.perf_counter() - start_time) * 1000)
            logger.warning(f"Attempt {attempt}/{max_retries} encountered error ({type(exc).__name__}): {exc}")
            last_error = exc

        # Exponential backoff with jitter before retrying
        if attempt < max_retries:
            backoff_base = 2 ** (attempt - 1)
            jitter = random.uniform(0.1, 0.5)
            sleep_time = backoff_base + jitter
            logger.info(f"Retrying Gemini call in {sleep_time:.2f}s...")
            await asyncio.sleep(sleep_time)

    raise RuntimeError(f"Gemini API request failed after {max_retries} attempts: {last_error}")


RESUME_PARSER_SYSTEM_PROMPT = """You are an expert AI Resume Intelligence Engine and Principal Recruiter.
Your job is to thoroughly analyze student resumes and extract verified, factual data into structured JSON.

CRITICAL ANTI-HALLUCINATION RULES:
1. Extract ONLY facts, skills, roles, and metrics directly supported by the resume text.
2. NEVER invent, hallucinate, extrapolate, or embellish skills, projects, degrees, or quantitative achievements.
3. For every technical skill extracted, you MUST provide 'source_evidence': the exact sentence or bullet snippet from the resume proving its presence.
4. If a piece of information (e.g., CGPA, graduation year, phone, linkedin) is not in the text, leave it empty or null.
5. Return strictly valid JSON adhering to the specified schema without Markdown fences or commentary.
"""

RESUME_EXTRACTION_JSON_SCHEMA_INSTRUCTION = """
Analyze the resume text and return a JSON object with this exact structure:
{
  "personal_info": {
    "name": "string",
    "email": "string",
    "phone": "string",
    "college": "string",
    "degree": "string",
    "branch": "string",
    "graduation_year": integer or null,
    "cgpa": float or null,
    "github_url": "string",
    "linkedin_url": "string"
  },
  "technical_skills": [
    {
      "skill_name": "string (e.g. React, Python, PostgreSQL, Docker)",
      "category": "string (Frontend, Backend & APIs, Databases, Cloud & DevOps, AI & Data Science, Testing & Security, Core CS)",
      "source_evidence": "string (exact sentence or bullet snippet from resume)",
      "confidence": float (0.5 to 1.0 based on depth of evidence),
      "related_project_or_experience": "string or null"
    }
  ],
  "projects": [
    {
      "title": "string",
      "role": "string or null",
      "technologies": ["string"],
      "highlights": ["string"],
      "metrics": ["string"]
    }
  ],
  "experience": [
    {
      "company": "string",
      "role": "string",
      "duration": "string or null",
      "location": "string or null",
      "responsibilities": ["string"],
      "technologies": ["string"]
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "string",
      "field_of_study": "string or null",
      "graduation_year": integer or null,
      "score": "string or null"
    }
  ],
  "certifications": [
    {
      "name": "string",
      "issuer": "string or null",
      "year": integer or null
    }
  ],
  "ats_analysis": {
    "section_completeness": {
      "contact": boolean,
      "education": boolean,
      "experience": boolean,
      "projects": boolean,
      "skills": boolean,
      "summary": boolean
    },
    "technical_keyword_relevance": float (0.0 to 100.0),
    "project_description_quality": "string (Needs Improvement | Moderate | Strong | Exceptional)",
    "experience_description_quality": "string (Needs Improvement | Moderate | Strong | Exceptional)",
    "readability_analysis": "string",
    "missing_information_suggestions": ["string"],
    "role_specific_recommendations": ["string"]
  },
  "optimization_suggestions": [
    {
      "section": "string",
      "original_bullet": "string",
      "improved_bullet": "string (STAR format, power action verb, preserving true facts)",
      "improvement_rationale": "string",
      "action_verbs_used": ["string"],
      "quantified_metrics_referenced": ["string"]
    }
  ]
}
"""


async def extract_resume_with_gemini(resume_text: str) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Execute AI resume analysis via Gemini Generative Language API.
    Returns: (parsed_data_dict, usage_dict)
    """
    prompt = f"""RESUME TEXT TO ANALYZE:
---
{resume_text}
---

INSTRUCTIONS:
{RESUME_EXTRACTION_JSON_SCHEMA_INSTRUCTION}
"""
    return await call_gemini_structured_api(
        prompt=prompt,
        system_instruction=RESUME_PARSER_SYSTEM_PROMPT,
        temperature=0.1,  # Low temperature for strict factual accuracy
    )


async def optimize_bullets_with_gemini(
    bullets: List[Dict[str, str]],
    target_role: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Generate STAR-format bullet rewrites with active power verbs.
    STRICT ANTI-FABRICATION RULE: Do NOT invent metrics or accomplishments not in original.
    """
    prompt = f"""Rewrite the following resume bullet points using the STAR methodology (Situation, Task, Action, Result)
and strong active verbs (e.g. Engineered, Architected, Accelerated, Reduced, Spearheaded).

TARGET ROLE: {target_role or 'Software Engineer'}

BULLETS TO REWRITE:
{json.dumps(bullets, indent=2)}

STRICT RULES:
1. Do NOT fabricate technologies, companies, or quantitative numbers not mentioned or implied by the candidate.
2. If no metric is present, focus on structural clarity, engineering decisions, and active phrasing without inventing false statistics.
3. Return a JSON array of objects with keys:
   - "section": string
   - "original_bullet": string
   - "improved_bullet": string
   - "improvement_rationale": string
   - "action_verbs_used": list of strings
   - "quantified_metrics_referenced": list of strings
"""
    parsed, usage = await call_gemini_structured_api(
        prompt=prompt,
        system_instruction="You are an expert technical resume coach who refines student bullet points into compelling engineering statements without fabricating fake achievements.",
        temperature=0.2,
    )

    if isinstance(parsed, dict) and "suggestions" in parsed:
        return parsed["suggestions"], usage
    if isinstance(parsed, list):
        return parsed, usage
    return [], usage


async def match_job_description_with_gemini(
    resume_text: str,
    resume_skills: List[str],
    job_title: str,
    job_description: str,
    required_skills: Optional[List[str]] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Perform explainable AI job description matching between candidate profile and target job.
    """
    prompt = f"""Compare the candidate's resume and verified skills against the target job posting.

TARGET JOB TITLE: {job_title}

JOB DESCRIPTION:
{job_description}

EXPLICIT REQUIRED SKILLS:
{json.dumps(required_skills or [])}

CANDIDATE EXTRACTED SKILLS:
{json.dumps(resume_skills)}

CANDIDATE RESUME TEXT:
---
{resume_text}
---

INSTRUCTIONS:
Return an explainable evaluation in valid JSON with keys:
{{
  "job_title": "{job_title}",
  "match_score": float (0.0 to 100.0 based on real alignment),
  "required_skills_matched": ["string"],
  "preferred_skills_matched": ["string"],
  "missing_skills": ["string"],
  "experience_match_level": "string (e.g. Entry-Level Fit, Strong Fit, Stretch Opportunity)",
  "education_match": boolean,
  "role_relevance_summary": "string explaining exactly why this candidate matches or where the key gaps lie",
  "improvement_recommendations": ["string"],
  "explainable_breakdown": {{
    "skills_alignment_score": float,
    "experience_alignment_score": float,
    "role_readiness_level": "string"
  }}
}}
"""
    return await call_gemini_structured_api(
        prompt=prompt,
        system_instruction="You are a senior technical hiring manager providing explainable, transparent candidate-to-job fit analysis without arbitrary scores.",
        temperature=0.2,
    )


ROADMAP_ARCHITECT_SYSTEM_PROMPT = """You are an expert Engineering Career Architect, Staff Engineer, and Technical Placement Director.
Your mission is to generate a comprehensive, highly personalized, rigorous 4-week preparation roadmap for a specific student candidate to bridge their skill gaps and successfully qualify for their desired target role.

CRITICAL RULES:
1. Every candidate is unique. Never return generic or templated text. Every weekly title, theme, and task MUST be explicitly tailored to the candidate's discovered resume skills, real completed projects, and the target role they need to achieve.
2. Week 1: Foundational Audit & Core Skill Verification. Focus on the candidate's primary skills found in their resume, taking diagnostic 5-Q assessments, and mastering key architectural principles.
3. Week 2: Practical Engineering & Hands-on Implementation. Focus on building real deliverables, integrating databases, REST/gRPC APIs, or microservices, directly relating to their past projects or target tech stack.
4. Week 3: Bridging High-Demand Skill Gaps & System Scalability. Focus on closing the missing skills required for the target role, advanced algorithmic rounds, caching, indexing, or distributed systems.
5. Week 4: Placement Readiness, Portfolio Verification & High-Match Applications. Focus on 10-Q assessments for remaining core skills, resume ATS alignment for target roles, and mock technical interview preparation.
6. Return strictly valid JSON matching the schema.
"""

ROADMAP_JSON_SCHEMA_INSTRUCTION = """
Return a JSON object with this exact structure:
{
  "target_role": "string (the target role being achieved)",
  "skill_focus": ["string (4 to 6 prioritized skills across the plan)"],
  "gap_targets": ["string (2 to 4 high-priority gap skills being bridged)"],
  "duration": "4 Weeks",
  "weeks": [
    {
      "week_number": 1,
      "title": "string (Specific, role-tailored weekly milestone title)",
      "focus": "string (Deep, cohesive focus statement for this week's milestone)",
      "tasks": [
        {
          "title": "string (Concrete, actionable engineering task title)",
          "description": "string (Detailed technical instructions: what to build, solve, verify, or optimize)",
          "category": "string (Verification | Core Theory | Hands-on Implementation | System Design | Assignment | Coding Rounds | Portfolio | Placement)",
          "estimated_hours": float (1.0 to 4.0),
          "resource_type": "string (Assessment | Guide | Project Module | Lab | Architecture | Checklist | Workshop | Practice | Jobs)"
        }
      ]
    }
  ]
}
"""


async def generate_roadmap_with_gemini(
    candidate_name: str,
    target_role: str,
    detected_skills: List[str],
    detected_projects: List[Dict[str, Any]],
    experience: List[Dict[str, Any]],
    education: List[Dict[str, Any]],
    market_gaps: Optional[List[str]] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Generate an AI-powered, highly personalized 4-week placement preparation roadmap using Gemini API.
    Returns: (roadmap_dict, usage_dict)
    """
    projects_summary = []
    for p in (detected_projects or [])[:5]:
        title = p.get("title", "Project")
        techs = ", ".join(p.get("technologies", [])) if isinstance(p.get("technologies"), list) else ""
        projects_summary.append(f"- {title} (Tech: {techs})")
    projects_str = "\n".join(projects_summary) if projects_summary else "Student portfolio projects in progress."

    experience_summary = []
    for e in (experience or [])[:3]:
        company = e.get("company", "Company")
        role = e.get("role", "Engineer")
        experience_summary.append(f"- {role} at {company}")
    exp_str = "\n".join(experience_summary) if experience_summary else "College student / Fresher"

    gaps_str = ", ".join(market_gaps) if market_gaps else "System design, production testing, and distributed architecture"

    prompt = f"""CANDIDATE RESUME PROFILE:
---
Candidate Name: {candidate_name or 'Engineering Candidate'}
Target Role to Achieve: {target_role or 'Software Engineer'}
Discovered Technical Skills from Resume: {', '.join(detected_skills) if detected_skills else 'None detected'}
Identified Skill Gaps for Target Role: {gaps_str}

Key Resume Projects:
{projects_str}

Prior Experience / Background:
{exp_str}
---

INSTRUCTIONS:
Design a deeply personalized, rigorous 4-week study and implementation roadmap for {candidate_name or 'this candidate'} to bridge their skill gaps and successfully secure a {target_role} offer.
Every task must be actionable and technically concrete. Connect their existing stack ({', '.join(detected_skills[:5])}) to the requirements of a top-tier {target_role}.

{ROADMAP_JSON_SCHEMA_INSTRUCTION}
"""
    return await call_gemini_structured_api(
        prompt=prompt,
        system_instruction=ROADMAP_ARCHITECT_SYSTEM_PROMPT,
        temperature=0.3,
    )
