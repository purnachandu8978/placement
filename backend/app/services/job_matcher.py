"""
Explainable Student Job Matching Engine.

Computes mathematically explainable, evidence-grounded fit scores between
a student's authenticated profile (verified skills, resume-extracted skills,
academic standing, preferences) and active employer job postings.

STRICT PRINCIPLE:
Never treat resume-mentioned skills as verified skills.
Verified skills are backed by proctored assessments; resume mentions are unverified claims.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from pymongo import ReplaceOne

from app.schemas.job_discovery import JobMatchBreakdown
from app.services.skill_normalizer import normalize_skill_name


def _normalize_set(skills: List[str]) -> Set[str]:
    """Normalize a list of skill strings to lowercase canonical names."""
    res = set()
    for s in skills:
        if not s:
            continue
        norm = normalize_skill_name(s).strip().lower()
        if norm:
            res.add(norm)
    return res


def compute_job_match(
    student_profile: Dict[str, Any],
    job: Dict[str, Any],
) -> JobMatchBreakdown:
    """
    Calculate an explainable match breakdown for a single job against a student profile.

    student_profile:
      - verified_skills: List[str] (passed proctored tests)
      - resume_skills: List[str] (extracted from resume text)
      - target_roles: List[str]
      - preferred_locations: List[str]
      - preferred_work_modes: List[str]
      - preferences: Dict[str, Any] (personalized student job preferences)
      - graduation_year: Optional[int]
      - cgpa: Optional[float]
      - degree: Optional[str]
      - branch: Optional[str]

    job:
      - title: str
      - company: str
      - required_skills: List[str]
      - preferred_skills: List[str]
      - location: str
      - work_mode: str (Remote, Hybrid, Onsite)
      - employment_type: str (Full-time, Internship, Contract)
      - eligibility: str
      - min_cgpa: Optional[float]
      - allowed_grad_years: List[int]
      - description: str
    """
    prefs = student_profile.get("preferences", {}) or {}
    company_name = job.get("company", "Employer")
    job_title = (job.get("title") or "").lower()
    employment_type = (job.get("employment_type") or "Full-time").lower()
    is_internship = "intern" in job_title or "trainee" in job_title or "internship" in employment_type

    # 0. Excluded Companies Check (Hard filter)
    excluded_companies = [c.strip().lower() for c in prefs.get("excluded_companies", []) if c.strip()]
    if any(ec in company_name.lower() for ec in excluded_companies):
        return JobMatchBreakdown(
            match_score=0.0,
            verified_skills_matched=[],
            resume_skills_matched=[],
            missing_skills=job.get("required_skills", []) or [],
            role_relevance_summary=f"Excluded employer: {company_name} is in candidate's excluded companies list.",
            eligibility_concerns=[f"Excluded employer ({company_name}) based on your custom job preferences."],
            recommended_preparation=["Remove company from excluded list in Job Preferences if you wish to apply."],
            formula_breakdown={
                "verified_skills_component": 0.0,
                "resume_skills_component": 0.0,
                "role_alignment_component": 0.0,
                "location_fit_component": 0.0,
                "academic_eligibility_component": 0.0,
            },
        )

    verified_set = _normalize_set(student_profile.get("verified_skills", []))
    raw_resume_set = _normalize_set(student_profile.get("resume_skills", []))
    # STRICT: resume-only skills exclude skills already verified
    resume_only_set = raw_resume_set - verified_set

    req_skills_raw = job.get("required_skills", []) or []
    pref_skills_raw = job.get("preferred_skills", []) or []

    # Map normalized back to original or display name
    verified_matched: List[str] = []
    resume_matched: List[str] = []
    missing: List[str] = []
    pref_matched: List[str] = []

    for req in req_skills_raw:
        norm = normalize_skill_name(req).strip().lower()
        if norm in verified_set:
            verified_matched.append(req)
        elif norm in resume_only_set:
            resume_matched.append(req)
        else:
            missing.append(req)

    for pref in pref_skills_raw:
        norm = normalize_skill_name(pref).strip().lower()
        if norm in verified_set or norm in resume_only_set:
            pref_matched.append(pref)

    # 1. Verified Skills Component (Max 40 points)
    # Verified skills prove competence under proctored test condition
    if not req_skills_raw:
        verified_score = 30.0  # Open-skill posting baseline
    else:
        verified_score = round((len(verified_matched) / len(req_skills_raw)) * 40.0, 1)

    # 2. Resume Skills Component (Max 25 points)
    # Unverified claims from resume text carry moderate confidence
    if not req_skills_raw:
        resume_score = 20.0
    else:
        resume_score = round((len(resume_matched) / len(req_skills_raw)) * 25.0, 1)

    # Beginner / Internship weighting:
    fresher_pref = prefs.get("fresher_or_experienced", "all")
    is_fresher_candidate = fresher_pref == "fresher" or not student_profile.get("graduation_year") or int(student_profile.get("graduation_year") or 2026) >= 2025

    if is_internship and is_fresher_candidate:
        # Internships require foundational skills, do not penalize overly harshly for broad stacks
        if verified_matched or resume_matched:
            verified_score = min(40.0, verified_score + 5.0)
            resume_score = min(25.0, resume_score + 3.0)

    # 3. Role Alignment Component (Max 15 points)
    # Combine target roles from profile and preferences
    target_roles = [r.lower() for r in (student_profile.get("target_roles", []) + prefs.get("target_job_titles", []) + prefs.get("preferred_career_paths", [])) if r]
    role_score = 0.0

    if not target_roles:
        # If student hasn't specified target roles, check branch / degree alignment
        branch = (student_profile.get("branch") or "").lower()
        if any(tech_term in job_title for tech_term in ["software", "developer", "engineer", "full stack", "frontend", "backend", "data", "cloud", "qa", "intern"]):
            role_score = 12.0
        else:
            role_score = 9.0
    else:
        best_overlap = 0.0
        for tr in target_roles:
            tr_tokens = set(re.findall(r"\b\w+\b", tr))
            title_tokens = set(re.findall(r"\b\w+\b", job_title))
            if not tr_tokens:
                continue
            intersection = tr_tokens & title_tokens
            overlap_pct = len(intersection) / len(tr_tokens)
            if overlap_pct > best_overlap:
                best_overlap = overlap_pct
        if best_overlap >= 0.6:
            role_score = 15.0
        elif best_overlap >= 0.3:
            role_score = 12.0
        elif any(t in job_title for t in ["engineer", "developer", "intern"]):
            role_score = 10.0
        else:
            role_score = 6.0

    # Boost role alignment for internship roles matching student's fresher profile
    if is_internship and is_fresher_candidate:
        role_score = min(15.0, role_score + 3.0)

    # 4. Location & Work Mode Fit (Max 10 points)
    job_mode = (job.get("work_mode") or "Remote").lower()
    job_loc = (job.get("location") or "Remote").lower()
    pref_modes = [m.lower() for m in (student_profile.get("preferred_work_modes", []) + prefs.get("work_modes", []))]
    pref_locs = [l.lower() for l in (student_profile.get("preferred_locations", []) + prefs.get("preferred_cities", []))]

    location_score = 10.0
    if job_mode == "remote":
        location_score = 10.0
    elif pref_modes and job_mode not in pref_modes:
        location_score = 5.0
    elif pref_locs:
        if any(pl in job_loc for pl in pref_locs):
            location_score = 10.0
        else:
            location_score = 6.5

    # 5. Academic & Eligibility Fit (Max 10 points)
    academic_score = 10.0
    eligibility_concerns: List[str] = []

    # CGPA check
    student_cgpa = student_profile.get("cgpa")
    min_cgpa = job.get("min_cgpa")
    if min_cgpa is not None and student_cgpa is not None:
        try:
            if float(student_cgpa) < float(min_cgpa):
                academic_score -= 4.0
                eligibility_concerns.append(
                    f"Job specifies minimum {min_cgpa} CGPA; candidate profile has {student_cgpa}."
                )
        except (ValueError, TypeError):
            pass

    # Graduation year check
    allowed_years = job.get("allowed_grad_years") or []
    student_grad_year = student_profile.get("graduation_year")
    if allowed_years and student_grad_year:
        try:
            student_yr = int(student_grad_year)
            if student_yr not in allowed_years:
                academic_score -= 5.0
                eligibility_concerns.append(
                    f"Job targets batch {', '.join(str(y) for y in allowed_years)}; candidate grad year is {student_yr}."
                )
        except (ValueError, TypeError):
            pass

    # Check eligibility text string if no structured allowed_grad_years
    if not allowed_years and job.get("eligibility") and student_grad_year:
        elig_text = str(job.get("eligibility"))
        try:
            s_yr_str = str(int(student_grad_year))
            years_in_text = re.findall(r"\b20\d{2}\b", elig_text)
            if years_in_text and s_yr_str not in years_in_text:
                eligibility_concerns.append(
                    f"Role eligibility mentions '{elig_text}', which may conflict with candidate batch ({s_yr_str})."
                )
                academic_score = max(4.0, academic_score - 3.0)
        except Exception:
            pass

    # Check minimum compensation preferences
    min_lpa = prefs.get("min_salary_lpa")
    job_lpa = job.get("package_lpa")
    if min_lpa and job_lpa and float(job_lpa) < float(min_lpa):
        eligibility_concerns.append(f"Offered package ({job_lpa} LPA) is below student target ({min_lpa} LPA).")

    academic_score = max(0.0, round(academic_score, 1))

    # Overall Match Calculation (sum of 5 explainable components, capped at 100)
    total_match = round(min(100.0, verified_score + resume_score + role_score + location_score + academic_score), 1)

    # Preferred Companies Bonus (+5 points)
    preferred_companies = [c.strip().lower() for c in prefs.get("preferred_companies", []) if c.strip()]
    if any(pc in company_name.lower() for pc in preferred_companies):
        total_match = min(100.0, round(total_match + 5.0, 1))

    # If student has zero verified and zero resume skills
    if not verified_matched and not resume_matched and req_skills_raw:
        total_match = min(35.0, total_match)

    # Generate Role Relevance Summary
    if total_match >= 75.0:
        fit_level = "High-confidence alignment"
    elif total_match >= 50.0:
        fit_level = "Moderate competitive alignment"
    else:
        fit_level = "Growth & development fit"

    num_verified = len(verified_matched)
    num_resume = len(resume_matched)
    num_req = len(req_skills_raw)

    role_relevance_summary = (
        f"{fit_level} for {company_name}'s {job.get('title', 'Role')}. "
        f"{num_verified}/{num_req} required skills are formally verified, "
        f"{num_resume}/{num_req} unverified in resume, and {len(missing)} skill gaps remain."
    )

    # Actionable Recommended Preparation
    recommended_preparation: List[str] = []
    if resume_matched:
        recommended_preparation.append(
            f"Take proctored skill assessments for {', '.join(resume_matched[:2])} to convert unverified resume mentions into verified credentials (+15% match gain)."
        )
    if missing:
        recommended_preparation.append(
            f"Target missing required competencies: practice foundational coding and system design in {', '.join(missing[:3])}."
        )
    if pref_matched:
        recommended_preparation.append(
            f"Highlight your proficiency in preferred stack ({', '.join(pref_matched[:2])}) in your interview portfolio."
        )
    elif pref_skills_raw:
        recommended_preparation.append(
            f"Familiarize with preferred tools like {', '.join(pref_skills_raw[:2])} to stand out during recruiter screening."
        )

    formula_breakdown = {
        "verified_skills_component": verified_score,
        "resume_skills_component": resume_score,
        "role_alignment_component": role_score,
        "location_fit_component": location_score,
        "academic_eligibility_component": academic_score,
    }

    return JobMatchBreakdown(
        match_score=total_match,
        verified_skills_matched=verified_matched,
        resume_skills_matched=resume_matched,
        missing_skills=missing,
        role_relevance_summary=role_relevance_summary,
        eligibility_concerns=eligibility_concerns,
        recommended_preparation=recommended_preparation,
        formula_breakdown=formula_breakdown,
    )


async def recalculate_all_job_matches_for_student(
    uid: str,
    db: Any,
) -> List[Dict[str, Any]]:
    """
    Perform full explainable matching across all active jobs in MongoDB Atlas.
    Persists granular breakdowns into `job_matches` collection for the student.
    """
    user_doc = await db.users.find_one({"firebase_uid": uid}) or {}
    profile_doc = await db.student_profiles.find_one({"user_id": uid}) or {}
    prefs_doc = await db.student_job_preferences.find_one({"user_id": uid}) or {}
    extracted_docs = await db.extracted_skills.find({"user_id": uid}).to_list(length=150)
    verified_docs = await db.verified_skills.find({"user_id": uid}).to_list(length=150)

    # Get student profile fields
    resume_skills = [
        str(d.get("skill_name", "")).strip()
        for d in extracted_docs
        if d.get("skill_name")
    ]
    verified_skills = [
        str(d.get("skill") or d.get("skill_name", "")).strip()
        for d in verified_docs
        if d.get("skill") or d.get("skill_name")
    ]

    target_roles = (
        profile_doc.get("target_roles", [])
        or user_doc.get("target_roles", [])
        or ([user_doc.get("preferred_role")] if user_doc.get("preferred_role") else [])
    )

    student_profile = {
        "verified_skills": verified_skills,
        "resume_skills": resume_skills,
        "target_roles": target_roles,
        "preferred_locations": profile_doc.get("preferred_locations") or user_doc.get("preferred_locations", []),
        "preferred_work_modes": profile_doc.get("preferred_work_modes") or user_doc.get("preferred_work_modes", []),
        "preferences": prefs_doc,
        "graduation_year": profile_doc.get("graduation_year") or user_doc.get("graduation_year") or user_doc.get("grad_year"),
        "cgpa": profile_doc.get("cgpa") or user_doc.get("cgpa"),
        "degree": profile_doc.get("degree") or user_doc.get("degree"),
        "branch": profile_doc.get("branch") or user_doc.get("branch") or user_doc.get("department"),
    }

    jobs = await db.jobs.find({"status": "active"}).to_list(length=250)
    if not jobs:
        jobs = await db.jobs.find().to_list(length=250)

    now = datetime.now(timezone.utc)
    results: List[Dict[str, Any]] = []

    for job in jobs:
        job_id = str(job.get("_id", ""))
        breakdown = compute_job_match(student_profile, job)

        # Map to readiness label
        score = breakdown.match_score
        if not verified_skills and not resume_skills:
            readiness_status = "upload_resume_first"
        elif score >= 75.0:
            readiness_status = "strong_fit"
        elif score >= 50.0:
            readiness_status = "good_fit"
        else:
            readiness_status = "gap_building"

        recommendation = breakdown.recommended_preparation[0] if breakdown.recommended_preparation else breakdown.role_relevance_summary

        match_doc = {
            "user_id": uid,
            "job_id": job_id,
            "job_title": job.get("title", ""),
            "company": job.get("company", ""),
            "match_score": breakdown.match_score,
            "matched_skills": breakdown.verified_skills_matched + breakdown.resume_skills_matched,
            "verified_matched_skills": breakdown.verified_skills_matched,
            "resume_skills_matched": breakdown.resume_skills_matched,
            "missing_skills": breakdown.missing_skills,
            "eligibility_concerns": breakdown.eligibility_concerns,
            "role_relevance_summary": breakdown.role_relevance_summary,
            "recommended_preparation": breakdown.recommended_preparation,
            "formula_breakdown": breakdown.formula_breakdown,
            "readiness_status": readiness_status,
            "recommendation": recommendation,
            "updated_at": now,
        }

        results.append(match_doc)

    if results:
        try:
            bulk_ops = [
                ReplaceOne(
                    {"user_id": uid, "job_id": doc["job_id"]},
                    doc,
                    upsert=True,
                )
                for doc in results
            ]
            await db.job_matches.bulk_write(bulk_ops, ordered=False)
        except Exception:
            pass

    return results
