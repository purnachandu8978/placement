"""
Assessment result finalization, real deterministic grading, and verification issuance.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

from bson import ObjectId
from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel

from app.services.assessment_utils import find_or_generate_assessment
from app.core.dependencies import get_current_user
from app.db.mongodb import get_database
from app.services.resume_intelligence import (
    compute_and_store_readiness,
    recalculate_job_matches_for_user,
)

router = APIRouter()


class FinalizeRequest(BaseModel):
    answers: Optional[Dict[str, Union[int, str]]] = None


def _proficiency_from_score(score: float) -> str:
    if score >= 90.0:
        return "Expert"
    if score >= 75.0:
        return "Proficient"
    if score >= 50.0:
        return "Intermediate"
    return "Needs Practice"


@router.post("/{attempt_id}/finalize")
async def finalize_assessment_attempt(
    attempt_id: str,
    payload: Optional[FinalizeRequest] = Body(default=None),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Deterministically grade MCQ + Coding answers, store performance, issue verified credential on pass, and update readiness."""
    uid = current_user["firebase_uid"]
    try:
        oid = ObjectId(attempt_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid attempt_id format")

    attempt = await db.assessment_attempts.find_one({"_id": oid})
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt["user_id"] != uid:
        raise HTTPException(status_code=403, detail="Unauthorized access")

    asmt = await find_or_generate_assessment(attempt["assessment_id"], db)
    if not asmt:
        raise HTTPException(status_code=404, detail="Assessment template not found")

    skill_name = asmt.get("skill_name", attempt.get("skill_name", "Technical Skill"))
    pass_threshold = float(asmt.get("pass_score_percentage", 75.0))
    questions = asmt.get("questions", [])

    merged_answers: Dict[str, Union[int, str]] = {**(attempt.get("answers") or {})}
    if payload and payload.answers:
        merged_answers.update(payload.answers)

    code_submissions: Dict[str, Any] = attempt.get("code_submissions") or {}

    earned_points = 0.0
    total_points = 0.0
    mcq_correct = 0
    mcq_total = 0
    coding_passed_cases = 0
    coding_total_cases = 0
    question_breakdown: List[Dict[str, Any]] = []
    strengths: List[str] = []
    weaknesses: List[str] = []

    for q in questions:
        qid = q.get("id", "")
        qtype = q.get("type", "mcq")
        pts = float(q.get("points", 10 if qtype == "mcq" else 20))
        total_points += pts

        if qtype == "mcq":
            mcq_total += 1
            correct_idx = q.get("correct_answer", 0)
            options = q.get("options", [])
            user_ans = merged_answers.get(qid)

            is_correct = False
            if isinstance(user_ans, int):
                is_correct = user_ans == correct_idx
            elif isinstance(user_ans, str):
                if user_ans.isdigit():
                    is_correct = int(user_ans) == correct_idx
                elif isinstance(correct_idx, int) and 0 <= correct_idx < len(options):
                    is_correct = user_ans.strip().lower() == str(options[correct_idx]).strip().lower()

            q_earned = pts if is_correct else 0.0
            earned_points += q_earned
            if is_correct:
                mcq_correct += 1

            question_breakdown.append({
                "question_id": qid,
                "type": "mcq",
                "question": q.get("question", ""),
                "is_correct": is_correct,
                "earned_points": q_earned,
                "max_points": pts,
                "explanation": q.get("explanation", ""),
            })
        else:
            sub = code_submissions.get(qid, {})
            t_cases = int(sub.get("total_test_cases") or len(q.get("test_cases", [])) or 1)
            passed_cases = int(sub.get("passed_test_cases", 0))
            sub_status = sub.get("status", "not_submitted")
            if sub_status == "compilation_error":
                passed_cases = 0

            coding_passed_cases += passed_cases
            coding_total_cases += t_cases

            if sub_status == "compilation_error":
                q_earned = 0.0
            elif "score_percentage" in sub:
                q_earned = round(pts * (float(sub["score_percentage"]) / 100.0), 2)
            else:
                ratio = (passed_cases / t_cases) if t_cases > 0 else 0.0
                q_earned = round(pts * ratio, 2)
            earned_points += q_earned

            question_breakdown.append({
                "question_id": qid,
                "type": qtype,
                "title": q.get("title", "Coding Challenge"),
                "language": sub.get("language", ""),
                "passed_test_cases": passed_cases,
                "total_test_cases": t_cases,
                "status": sub_status,
                "execution_time_ms": sub.get("execution_time_ms", 0.0),
                "hidden_summary": sub.get("hidden_summary"),
                "earned_points": q_earned,
                "max_points": pts,
            })

    overall_score = round((earned_points / total_points) * 100.0, 1) if total_points > 0 else 0.0
    passed = overall_score >= pass_threshold
    proficiency = _proficiency_from_score(overall_score)

    if mcq_total > 0 and mcq_correct / mcq_total >= 0.67:
        strengths.append(f"Strong conceptual mastery in {skill_name} ({mcq_correct}/{mcq_total} MCQs correct)")
    else:
        weaknesses.append(f"Review core {skill_name} concepts ({mcq_correct}/{mcq_total} MCQs correct)")

    if coding_total_cases > 0:
        if coding_passed_cases / coding_total_cases >= 0.7:
            strengths.append(f"Clean practical problem-solving ({coding_passed_cases}/{coding_total_cases} test cases passed)")
        else:
            weaknesses.append(f"Strengthen edge-case implementation in coding tasks ({coding_passed_cases}/{coding_total_cases} cases passed)")

    now = datetime.now(timezone.utc)
    result_status = "passed" if passed else "failed"

    await db.assessment_attempts.update_one(
        {"_id": oid},
        {
            "$set": {
                "attempt_id": attempt_id,
                "answers": merged_answers,
                "status": "completed",
                "score": overall_score,
                "earned_points": round(earned_points, 1),
                "total_points": round(total_points, 1),
                "result": result_status,
                "proficiency": proficiency,
                "strengths": strengths,
                "weaknesses": weaknesses,
                "question_breakdown": question_breakdown,
                "end_time": now,
            }
        },
    )

    await db.skill_performance.replace_one(
        {"user_id": uid, "skill_name": skill_name},
        {
            "user_id": uid,
            "skill_name": skill_name,
            "score": overall_score,
            "proficiency": proficiency,
            "strengths": strengths,
            "weaknesses": weaknesses,
            "updated_at": now,
        },
        upsert=True,
    )

    verification_hash = None
    if passed:
        await db.extracted_skills.update_many(
            {"user_id": uid, "skill_name": {"$regex": f"^{skill_name}$", "$options": "i"}},
            {"$set": {"assessment_status": "verified"}},
        )
        verification_hash = f"ver_{uuid.uuid4().hex[:12]}"
        existing_ver = await db.verified_skills.find_one({"user_id": uid, "skill": skill_name})
        if existing_ver and existing_ver.get("verification_hash"):
            verification_hash = existing_ver["verification_hash"]

        await db.verified_skills.replace_one(
            {"user_id": uid, "skill": skill_name},
            {
                "user_id": uid,
                "skill": skill_name,
                "proficiency": proficiency,
                "score": overall_score,
                "evidence": f"Passed {asmt.get('title', skill_name)} with {overall_score}%",
                "verification_hash": verification_hash,
                "verification_date": now,
            },
            upsert=True,
        )

    # Sync personalized roadmap skill mastery & remedial guidance
    existing_roadmap = await db.roadmaps.find_one({"user_id": uid})
    if existing_roadmap:
        mastery_map = dict(existing_roadmap.get("skill_mastery") or {})
        mastery_map[skill_name] = {
            "score": overall_score,
            "proficiency": proficiency,
            "verified": passed,
            "coding_passed_cases": coding_passed_cases,
            "coding_total_cases": coding_total_cases,
            "updated_at": now,
        }
        gap_targets = list(existing_roadmap.get("gap_targets") or [])
        if not passed and skill_name not in gap_targets:
            gap_targets.insert(0, skill_name)
        elif passed and skill_name in gap_targets:
            gap_targets = [g for g in gap_targets if g != skill_name]

        await db.roadmaps.update_one(
            {"_id": existing_roadmap["_id"]},
            {
                "$set": {
                    "skill_mastery": mastery_map,
                    "gap_targets": gap_targets[:8],
                    "updated_at": now,
                }
            },
        )

    await recalculate_job_matches_for_user(uid, db)
    readiness = await compute_and_store_readiness(uid, db)

    await db.notifications.insert_one({
        "user_id": uid,
        "title": f"{skill_name} Assessment {'Passed' if passed else 'Completed'} ({overall_score}%)",
        "message": (
            f"Verified credential ({proficiency}) issued for {skill_name}. Portfolio & job matches updated."
            if passed
            else f"Scored {overall_score}% (target {pass_threshold}%). Review missed explanations and retake when ready."
        ),
        "type": "assessment",
        "is_read": False,
        "created_at": now,
    })

    return {
        "attempt_id": attempt_id,
        "assessment_id": attempt["assessment_id"],
        "skill_name": skill_name,
        "overall_score": overall_score,
        "earned_points": round(earned_points, 1),
        "total_points": round(total_points, 1),
        "pass_threshold": pass_threshold,
        "status": "completed",
        "result": result_status,
        "passed": passed,
        "proficiency": proficiency,
        "verification_badge_issued": passed,
        "verification_hash": verification_hash,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "question_breakdown": question_breakdown,
        "readiness_score": readiness["overall_score"],
    }


@router.get("/{attempt_id}")
async def get_assessment_result(
    attempt_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Retrieve persisted assessment result for current user or authorized admin."""
    uid = current_user["firebase_uid"]
    role = current_user.get("role", "STUDENT")
    try:
        oid = ObjectId(attempt_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid attempt_id format")

    attempt = await db.assessment_attempts.find_one({"_id": oid})
    if not attempt:
        raise HTTPException(status_code=404, detail="Result not found")
    if attempt["user_id"] != uid and role not in ("ADMIN", "SUPER_ADMIN"):
        raise HTTPException(status_code=403, detail="Unauthorized access")

    score = round(float(attempt.get("score", 0.0)), 1)
    return {
        "attempt_id": attempt_id,
        "assessment_id": attempt.get("assessment_id"),
        "skill_name": attempt.get("skill_name", "Technical Skill"),
        "overall_score": score,
        "earned_points": attempt.get("earned_points", 0),
        "total_points": attempt.get("total_points", 100),
        "status": attempt.get("status", "in_progress"),
        "result": attempt.get("result", "pending"),
        "passed": attempt.get("result") == "passed",
        "proficiency": attempt.get("proficiency", _proficiency_from_score(score)),
        "strengths": attempt.get("strengths", []),
        "weaknesses": attempt.get("weaknesses", []),
        "question_breakdown": attempt.get("question_breakdown", []),
        "completed_at": attempt["end_time"].isoformat() if isinstance(attempt.get("end_time"), datetime) else attempt.get("end_time"),
    }
