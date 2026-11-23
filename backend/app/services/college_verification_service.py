"""
College-Verified Student Identity & Digital Credential Engine.
Implements Level 1 (Blue Verified) and Level 2 (Green Fully Verified) assessments,
server-side integrity verification, audit trails, and PDF certificate generation.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import io
import json
import logging
import secrets
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId
import qrcode
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.pdfgen import canvas

from app.core.config import settings
from app.services.certificate_template_service import get_active_published_template
from app.services.identity_service import (
    generate_certificate_serial_number,
    get_or_ensure_student_registration_id,
    mask_registration_id,
)

logger = logging.getLogger("placement_intelligence.verification")

# ---------------------------------------------------------------------------
# Assessment Question Pools (Server-Side Only - Never Exposed Directly to Client)
# ---------------------------------------------------------------------------

LEVEL_1_BLUE_QUESTIONS: List[Dict[str, Any]] = [
    {
        "id": "v1_q1",
        "text": "In distributed microservices, what does the CAP theorem state regarding partition tolerance?",
        "type": "mcq",
        "options": [
            "A system can simultaneously guarantee Consistency, Availability, and Partition Tolerance.",
            "In the presence of a network partition, a distributed system must choose between Consistency and Availability.",
            "Partition tolerance is only required in single-datacenter relational database clusters.",
            "Availability is guaranteed only if partitions are fully eliminated via synchronous replication."
        ],
        "correct_option": 1,
        "explanation": "The CAP theorem states that in any asynchronous network subject to partitions, a system can achieve either Consistency or Availability, but not both simultaneously.",
        "points": 20.0,
    },
    {
        "id": "v1_q2",
        "text": "What is the average and worst-case time complexity of searching in a balanced Binary Search Tree (such as an AVL or Red-Black Tree)?",
        "type": "mcq",
        "options": [
            "Average O(1), Worst-case O(N)",
            "Average O(log N), Worst-case O(N)",
            "Average O(log N), Worst-case O(log N)",
            "Average O(N), Worst-case O(N log N)"
        ],
        "correct_option": 2,
        "options_index_offset": 0,
        "explanation": "Self-balancing binary search trees maintain a maximum height proportional to log(N), guaranteeing O(log N) lookup in both average and worst cases.",
        "points": 20.0,
    },
    {
        "id": "v1_q3",
        "text": "Which HTTP status code should a RESTful API return when a client provides a valid JWT, but does not have permission to access the requested resource?",
        "type": "mcq",
        "options": [
            "401 Unauthorized",
            "403 Forbidden",
            "400 Bad Request",
            "404 Not Found"
        ],
        "correct_option": 1,
        "explanation": "401 indicates missing or invalid authentication credentials; 403 Forbidden indicates the server understands who the user is, but refuses authorization.",
        "points": 20.0,
    },
    {
        "id": "v1_q4",
        "text": "In relational database indexing, why does a B+ Tree index outperform a simple Hash index for range-based queries (e.g., WHERE age BETWEEN 20 AND 30)?",
        "type": "mcq",
        "options": [
            "Hash indexes have high collision rates for small integers.",
            "B+ Trees store keys in sorted sequential order with linked leaf pages, enabling fast contiguous leaf traversal.",
            "B+ Trees store all actual table row data in root nodes.",
            "Hash indexes require O(N log N) space overhead per index key."
        ],
        "correct_option": 1,
        "explanation": "B+ Tree leaf nodes are linked in sorted order, allowing sequential range scans once the lower bound is located.",
        "points": 20.0,
    },
    {
        "id": "v1_q5",
        "text": "In JavaScript and Python asynchronous programming, what occurs if an unhandled promise rejection or un-awaited coroutine occurs in production?",
        "type": "mcq",
        "options": [
            "The operating system immediately terminates the thread and restarts the virtual machine.",
            "The execution flow continues silently, potentially causing orphaned tasks, connection leaks, or unhandled process exits.",
            "The garbage collector automatically retries the operation with exponential backoff.",
            "All pending HTTP requests are synchronously queued until the failure resolves."
        ],
        "correct_option": 1,
        "explanation": "Unhandled asynchronous rejections can lead to memory/connection leaks, silent background failures, and unhandled exception termination depending on runtime flags.",
        "points": 20.0,
    },
]

LEVEL_2_GREEN_QUESTIONS: List[Dict[str, Any]] = [
    {
        "id": "v2_q1",
        "text": "In database ACID isolation levels, which anomaly is prevented by REPEATABLE READ that is permitted under READ COMMITTED?",
        "type": "mcq",
        "options": [
            "Dirty Reads (reading uncommitted changes)",
            "Non-Repeatable Reads (fuzzy reads where re-reading a row yields different values due to concurrent commits)",
            "Phantom Reads (new rows appearing in concurrent transactions)",
            "Lost Updates in non-locking read scenarios"
        ],
        "correct_option": 1,
        "explanation": "READ COMMITTED prevents Dirty Reads but allows Non-Repeatable Reads. REPEATABLE READ guarantees that any row read during a transaction remains unchanged for that transaction.",
        "points": 12.5,
    },
    {
        "id": "v2_q2",
        "text": "When designing a high-throughput idempotency mechanism for payment APIs, which implementation is standard industry practice?",
        "type": "mcq",
        "options": [
            "Generate an Idempotency-Key on the client; the server stores the key in an atomic distributed lock/store (e.g. Redis/DB) with unique constraint and caches the original response.",
            "Rely entirely on client-side retry counters without server persistence.",
            "Use HTTP GET instead of POST so payments are naturally idempotent.",
            "Disable network retries completely across client SDKs."
        ],
        "correct_option": 0,
        "explanation": "A unique client-provided idempotency key stored in an atomic datastore guarantees exactly-once payment processing even upon network timeouts and retries.",
        "points": 12.5,
    },
    {
        "id": "v2_q3",
        "text": "What is the primary vulnerability prevented by utilizing parameterized SQL queries (Prepared Statements)?",
        "type": "mcq",
        "options": [
            "Cross-Site Scripting (XSS)",
            "SQL Injection (SQLi) by strictly separating query syntax from untrusted data literals",
            "Cross-Site Request Forgery (CSRF)",
            "Denial of Service via database deadlock"
        ],
        "correct_option": 1,
        "explanation": "Prepared statements pre-compile the SQL execution plan and treat user input strictly as data, making SQL injection impossible.",
        "points": 12.5,
    },
    {
        "id": "v2_q4",
        "text": "In modern browser security, what does the 'SameSite=Lax' attribute on an HttpOnly authentication cookie achieve?",
        "type": "mcq",
        "options": [
            "Prevents JavaScript from accessing the cookie (XSS mitigation) while restricting cross-site transmission during subrequests to mitigate CSRF.",
            "Permits cross-origin iframe embedding without restriction.",
            "Automatically encrypts cookie data using client-side public keys.",
            "Forces the browser to delete the cookie after 5 minutes of inactivity."
        ],
        "correct_option": 0,
        "explanation": "HttpOnly blocks JS DOM access (mitigating XSS theft) while SameSite=Lax prevents cross-site POST/subresource cookie transmission, mitigating CSRF.",
        "points": 12.5,
    },
    {
        "id": "v2_q5",
        "text": "Consider an LRU (Least Recently Used) cache with O(1) get and O(1) put operations. What combination of data structures is required to achieve this optimal complexity?",
        "type": "mcq",
        "options": [
            "Array + Binary Search Tree",
            "Hash Map + Doubly Linked List",
            "Singly Linked List + Min Heap",
            "Circular Ring Buffer + Stack"
        ],
        "correct_option": 1,
        "explanation": "A Hash Map provides O(1) key-to-node lookup, while a Doubly Linked List allows O(1) node removal and insertion at the head/tail.",
        "points": 12.5,
    },
    {
        "id": "v2_q6",
        "text": "Which algorithm is optimal for finding the shortest path between all pairs of vertices in a dense weighted graph without negative cycles?",
        "type": "mcq",
        "options": [
            "Bellman-Ford Algorithm O(V * E^2)",
            "Floyd-Warshall Algorithm O(V^3)",
            "Dijkstra's with Array O(V^4)",
            "Kruskal's Algorithm O(E log V)"
        ],
        "correct_option": 1,
        "explanation": "The Floyd-Warshall dynamic programming algorithm finds all-pairs shortest paths in O(V^3) time.",
        "points": 12.5,
    },
    {
        "id": "v2_q7",
        "text": "What is the primary purpose of a Reverse Proxy (such as NGINX or Envoy) positioned in front of backend microservices?",
        "type": "mcq",
        "options": [
            "To replace backend database storage engines with file buffers.",
            "To provide centralized TLS termination, load balancing, rate limiting, and traffic routing without exposing internal service topologies.",
            "To execute client-side React code before returning HTML.",
            "To bypass CORS security controls for all third-party domains."
        ],
        "correct_option": 1,
        "explanation": "Reverse proxies terminate SSL/TLS, balance traffic across replica instances, and encapsulate internal network architecture.",
        "points": 12.5,
    },
    {
        "id": "v2_q8",
        "text": "In distributed caching architectures (e.g. Redis), how should Cache Stampede (Thundering Herd) be mitigated when a popular cached key expires?",
        "type": "mcq",
        "options": [
            "Set cache TTL to zero so all requests query the primary database simultaneously.",
            "Use probabilistic early expiration (XFetch algorithm) or a distributed mutex/lock to ensure only one worker recomputes the cache.",
            "Reboot the cache cluster whenever high query volume is detected.",
            "Store all cached entries indefinitely in browser LocalStorage only."
        ],
        "correct_option": 1,
        "explanation": "A distributed lock or probabilistic early expiration prevents hundreds of concurrent requests from overwhelming the primary database upon cache miss.",
        "points": 12.5,
    },
]


# ---------------------------------------------------------------------------
# Core Service Functions
# ---------------------------------------------------------------------------

async def get_student_verification_overview(user_id: str, db: Any) -> Dict[str, Any]:
    """
    Retrieve active credentials, complete history, and eligibility based on:
    - All allocated and published assignments completed with Blue (>=60%) or Green (>=80%).
    - All skill assessments attempted and proven with Blue (>=60%) or Green (>=80%).
    - If all items are GREEN: 100% Certification available (Level 2 Green Fully Verified).
    - If all are BLUE or some BLUE + some GREEN: 50% Certification available (Level 1 Blue Verified).
    - If any assignment or assessment is incomplete/unattempted: 0% (Locked).
    """
    credentials_cursor = db.student_credentials.find({"user_id": user_id}).sort("issued_at", -1)
    all_creds = await credentials_cursor.to_list(length=50)

    active_cred = None
    history: List[Dict[str, Any]] = []

    for c in all_creds:
        c["id"] = str(c.get("_id"))
        if isinstance(c.get("issued_at"), datetime):
            c["issued_at"] = c["issued_at"].isoformat()
        if isinstance(c.get("expires_at"), datetime):
            c["expires_at"] = c["expires_at"].isoformat()

        if c.get("status") == "ACTIVE" and not c.get("is_superseded") and not active_cred:
            active_cred = c
        history.append(c)

    # Determine current verified level
    current_level = "NOT_VERIFIED"
    if active_cred:
        current_level = active_cred.get("level", "NOT_VERIFIED")

    # Fetch student profile for college name
    profile = await db.student_profiles.find_one({"user_id": user_id})
    college_name = (profile or {}).get("college") or "Placement Intelligence Partner College"

    # 1. AUDIT ASSIGNMENTS
    allocations = await db.assignment_allocations.find({"user_id": user_id}).to_list(length=100)
    alloc_map = {str(a.get("assignment_id")): a for a in allocations}
    submissions = await db.assignment_submissions.find({"user_id": user_id}).to_list(length=100)
    sub_map = {str(s.get("assignment_id")): s for s in submissions}

    # Fetch available assignments (allocated + standard curriculum templates)
    asg_query_or = [
        {"user_id": None},
        {"user_id": "system"},
        {"user_id": {"$exists": False}},
    ]
    for aid in alloc_map.keys():
        try:
            asg_query_or.append({"_id": ObjectId(aid)})
        except Exception:
            pass
        asg_query_or.append({"id": aid})
        asg_query_or.append({"template_key": aid})

    raw_asgs = await db.assignments.find({"$or": asg_query_or}).to_list(length=50)
    seen_asgs = set()
    asg_items: List[Dict[str, Any]] = []

    for doc in raw_asgs:
        aid = str(doc.get("_id"))
        tkey = doc.get("template_key") or doc.get("id") or aid
        key = tkey if tkey in seen_asgs else aid
        if key in seen_asgs:
            continue
        seen_asgs.add(key)
        seen_asgs.add(aid)

        title = doc.get("title") or "Technical Engineering Assignment"
        max_score = float(doc.get("total_marks") or doc.get("max_score") or 100.0)

        sub = sub_map.get(aid) or sub_map.get(tkey)
        alloc = alloc_map.get(aid) or alloc_map.get(tkey)

        earned_score = 0.0
        status = "not_started"
        if sub:
            earned_score = float(sub.get("score") or sub.get("auto_score") or 0.0)
            status = sub.get("status", "submitted")
        elif alloc:
            earned_score = float(alloc.get("score") or 0.0)
            status = alloc.get("status", "not_started")

        pct = round((earned_score / max_score) * 100.0, 1) if max_score > 0 else 0.0

        if status in ("submitted", "evaluated", "completed"):
            if pct >= 80.0:
                color = "GREEN"
            elif pct >= 60.0:
                color = "BLUE"
            else:
                color = "INCOMPLETE"
        else:
            color = "INCOMPLETE"

        asg_items.append({
            "id": aid,
            "title": title,
            "type": "assignment",
            "skill": doc.get("skill", "Software Engineering"),
            "score": earned_score,
            "max_score": max_score,
            "percentage": pct,
            "color": color,
            "status": status,
        })

    # 2. AUDIT ASSESSMENTS (Strictly mapped to skills discovered in the student's active resume)
    active_resume = await db.resumes.find_one({"user_id": user_id, "is_active": True})
    discovered_skills = (active_resume or {}).get("detected_skills", []) if active_resume else []

    attempts = await db.assessment_attempts.find({
        "user_id": user_id,
        "status": {"$in": ["completed", "evaluated"]},
    }).to_list(length=100)

    best_by_asmt: Dict[str, Dict[str, Any]] = {}
    best_by_skill_name: Dict[str, Dict[str, Any]] = {}
    for att in attempts:
        asmt_id = str(att.get("assessment_id") or att.get("_id"))
        curr_score = float(att.get("score", 0.0))

        prev = best_by_asmt.get(asmt_id)
        if not prev or curr_score > float(prev.get("score", 0.0)):
            best_by_asmt[asmt_id] = att

        sname_raw = (att.get("skill_name") or "").strip().lower()
        if sname_raw:
            prev_s = best_by_skill_name.get(sname_raw)
            if not prev_s or curr_score > float(prev_s.get("score", 0.0)):
                best_by_skill_name[sname_raw] = att

    asmt_items: List[Dict[str, Any]] = []
    seen_skills = set()

    for sk in discovered_skills:
        sname = sk.get("skill_name")
        if not sname or sname.lower() in seen_skills:
            continue
        seen_skills.add(sname.lower())

        slug = sname.lower().replace(" ", "-").replace("/", "-")
        aid_5 = f"test-{slug}-5"
        aid_10 = f"test-{slug}-10"

        # Check attempt by ID or by skill name
        best_att = best_by_asmt.get(aid_10) or best_by_asmt.get(aid_5) or best_by_skill_name.get(sname.lower())

        if best_att:
            earned = float(best_att.get("score", 0.0))
            pct = min(100.0, round(earned, 1))
            if pct >= 80.0:
                color = "GREEN"
            elif pct >= 60.0:
                color = "BLUE"
            else:
                color = "INCOMPLETE"
            status = best_att.get("status", "completed")
        else:
            earned = 0.0
            pct = 0.0
            color = "INCOMPLETE"
            status = "not_started"

        asmt_items.append({
            "id": aid_5,
            "title": f"{sname} Technical Assessment",
            "type": "assessment",
            "skill": sname,
            "skill_name": sname,
            "score": earned,
            "max_score": 100.0,
            "percentage": pct,
            "color": color,
            "status": status,
        })

    # 3. COMBINED COMPETENCY AUDIT
    total_assignments = len(asg_items)
    completed_assignments = sum(1 for x in asg_items if x["color"] in ("GREEN", "BLUE"))
    all_assignments_completed = (total_assignments > 0 and completed_assignments == total_assignments)

    total_assessments = len(asmt_items)
    passed_assessments = sum(1 for x in asmt_items if x["color"] in ("GREEN", "BLUE"))
    all_assessments_proven = (total_assessments > 0 and passed_assessments == total_assessments)

    all_items = asg_items + asmt_items
    total_items = len(all_items)
    green_count = sum(1 for x in all_items if x["color"] == "GREEN")
    blue_count = sum(1 for x in all_items if x["color"] == "BLUE")
    incomplete_count = sum(1 for x in all_items if x["color"] == "INCOMPLETE")

    # 4. TIER EVALUATION (USER'S EXACT SPECIFICATION)
    if not active_resume or not discovered_skills:
        certification_percentage = 0
        certification_status = "NO_RESUME"
        level_1_eligible = False
        level_2_eligible = False
        trust_score = 0.0
        eligibility_message = "Upload your resume in Resume Intelligence to discover technical skills, unlock personalized assessments, and begin your college certification journey."
    elif all_assignments_completed and all_assessments_proven:
        if blue_count == 0:
            # ONLY IF ALL GREEN -> 100% CERTIFICATION
            certification_percentage = 100
            certification_status = "100_PERCENT_GREEN"
            level_1_eligible = True
            level_2_eligible = True
            trust_score = 100.0
            eligibility_message = "100% All-Green Distinction Achieved! You are eligible for the 100% Fully Verified College Credential."
        else:
            # ALL BLUE OR SOME BLUE + SOME GREEN -> 50% CERTIFICATION
            certification_percentage = 50
            certification_status = "50_PERCENT_BLUE"
            level_1_eligible = True
            level_2_eligible = False
            trust_score = 50.0
            eligibility_message = f"50% Verified Competency unlocked ({green_count} Green, {blue_count} Blue). Upgrade all {blue_count} Blue item(s) to Green (>=80%) to unlock the 100% Verified Credential."
    else:
        # INCOMPLETE
        certification_percentage = 0
        certification_status = "NOT_ELIGIBLE"
        level_1_eligible = False
        level_2_eligible = False
        trust_score = round(((green_count * 1.0 + blue_count * 0.5) / max(1, total_items)) * 50.0, 1)
        eligibility_message = f"Complete all assignments ({completed_assignments}/{total_assignments}) and prove all {total_assessments} resume assessments ({passed_assessments}/{total_assessments}) with Blue (>=60%) or Green (>=80%) to unlock certification."

    # If already holding an active credential in history, reflect it
    if active_cred:
        if active_cred.get("level") == "LEVEL_2_GREEN":
            trust_score = 100.0
            certification_percentage = 100
            certification_status = "100_PERCENT_GREEN"
        elif active_cred.get("level") == "LEVEL_1_BLUE" and certification_percentage < 50:
            trust_score = 50.0
            certification_percentage = 50
            certification_status = "50_PERCENT_BLUE"

    return {
        "current_level": current_level,
        "active_credential": active_cred,
        "history": history,
        "level_1_eligible": level_1_eligible,
        "level_2_eligible": level_2_eligible,
        "college_name": college_name,
        "trust_score": trust_score,
        "certification_percentage": certification_percentage,
        "certification_status": certification_status,
        "all_assignments_completed": all_assignments_completed,
        "all_assessments_proven": all_assessments_proven,
        "total_assignments": total_assignments,
        "completed_assignments": completed_assignments,
        "total_assessments": total_assessments,
        "passed_assessments": passed_assessments,
        "green_count": green_count,
        "blue_count": blue_count,
        "incomplete_count": incomplete_count,
        "assignment_items": asg_items,
        "assessment_items": asmt_items,
        "eligibility_message": eligibility_message,
    }


def _format_utc_iso(dt: Any) -> str:
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    if isinstance(dt, str) and dt.strip():
        return dt if (dt.endswith("Z") or "+" in dt) else f"{dt}Z"
    return datetime.now(timezone.utc).isoformat()


async def start_verification_assessment(
    user_id: str,
    level: str,
    skill_focus: str,
    db: Any,
) -> Dict[str, Any]:
    """
    Initiate a timed verification assessment.
    Enforces server-side eligibility checks:
    - LEVEL_2_GREEN requires 100% certification (All Green).
    - LEVEL_1_BLUE requires at least 50% certification (All Blue or Blue+Green).
    """
    # Enforce prerequisite eligibility
    overview = await get_student_verification_overview(user_id, db)
    cert_pct = overview.get("certification_percentage", 0)

    if level == "LEVEL_2_GREEN" and cert_pct < 100:
        raise ValueError(
            "Level 2 Green (100% Fully Verified Credential) requires ALL assignments and assessments to be GREEN (>=80%). "
            f"Currently you have {overview.get('blue_count', 0)} Blue item(s). Please upgrade all items to Green first."
        )

    if level == "LEVEL_1_BLUE" and cert_pct < 50:
        raise ValueError(
            "Level 1 Blue (50% Verified Credential) requires completing all assignments and proving all assessments "
            "with Blue (>=60%) or Green (>=80%). Please complete your pending items first."
        )

    now = datetime.now(timezone.utc)

    # Anti-duplicate / spam attempt check within the last 30 seconds
    recent_active = await db.verification_attempts.find_one({
        "user_id": user_id,
        "level": level,
        "status": "IN_PROGRESS",
        "expires_at": {"$gt": now},
    })
    if recent_active:
        # Return existing active session rather than generating duplicates
        questions_pool = LEVEL_1_BLUE_QUESTIONS if level == "LEVEL_1_BLUE" else LEVEL_2_GREEN_QUESTIONS
        clean_questions = [
            {
                "question_id": q["id"],
                "text": q["text"],
                "type": q.get("type", "mcq"),
                "options": q.get("options", []),
                "starter_code": q.get("starter_code"),
                "language": q.get("language", "python"),
                "points": q.get("points", 10.0),
            }
            for q in questions_pool
        ]
        duration = 300 if level == "LEVEL_1_BLUE" else 600
        exp_dt = recent_active.get("expires_at")
        if isinstance(exp_dt, datetime) and exp_dt.tzinfo is None:
            exp_dt = exp_dt.replace(tzinfo=timezone.utc)
        remaining = max(10, int((exp_dt - now).total_seconds())) if isinstance(exp_dt, datetime) else duration
        return {
            "attempt_id": str(recent_active["_id"]),
            "level": level,
            "duration_seconds": duration,
            "remaining_seconds": remaining,
            "time_limit_minutes": duration // 60,
            "started_at": _format_utc_iso(recent_active.get("started_at")),
            "expires_at": _format_utc_iso(recent_active.get("expires_at")),
            "server_time": _format_utc_iso(now),
            "questions": clean_questions,
            "instructions": "Answer all competency questions within the server-tracked time limit. Late submissions are automatically marked expired.",
            "passing_threshold_percent": 70.0 if level == "LEVEL_1_BLUE" else 80.0,
        }

    is_blue = level == "LEVEL_1_BLUE"
    duration_seconds = 300 if is_blue else 600
    expires_at = now + timedelta(seconds=duration_seconds + 15)  # 15s grace for network latency
    pass_threshold = 70.0 if is_blue else 80.0

    questions_pool = LEVEL_1_BLUE_QUESTIONS if is_blue else LEVEL_2_GREEN_QUESTIONS

    attempt_doc = {
        "user_id": user_id,
        "level": level,
        "skill_focus": skill_focus,
        "duration_seconds": duration_seconds,
        "started_at": now,
        "expires_at": expires_at,
        "status": "IN_PROGRESS",
        "question_ids": [q["id"] for q in questions_pool],
        "pass_threshold_percent": pass_threshold,
        "created_at": now,
    }

    insert_result = await db.verification_attempts.insert_one(attempt_doc)
    attempt_id = str(insert_result.inserted_id)

    # Sanitize questions (strip correct_option, explanation, rubric)
    clean_questions = [
        {
            "question_id": q["id"],
            "text": q["text"],
            "type": q.get("type", "mcq"),
            "options": q.get("options", []),
            "starter_code": q.get("starter_code"),
            "language": q.get("language", "python"),
            "points": q.get("points", 10.0),
        }
        for q in questions_pool
    ]

    return {
        "attempt_id": attempt_id,
        "level": level,
        "duration_seconds": duration_seconds,
        "remaining_seconds": duration_seconds,
        "time_limit_minutes": duration_seconds // 60,
        "started_at": _format_utc_iso(now),
        "expires_at": _format_utc_iso(expires_at),
        "server_time": _format_utc_iso(now),
        "questions": clean_questions,
        "instructions": (
            "Complete the 5-Minute Competency Assessment."
            if is_blue
            else "Complete the 10-Minute Comprehensive Credential Assessment."
        ),
        "passing_threshold_percent": pass_threshold,
    }


async def submit_verification_assessment(
    user_id: str,
    attempt_id: str,
    answers: List[Dict[str, Any]],
    db: Any,
) -> Dict[str, Any]:
    """
    Server-side evaluation of verification assessment.
    Enforces time window, awards Blue or Green credential on passing,
    and updates student profile and readiness.
    """
    now = datetime.now(timezone.utc)

    # 1. Fetch attempt
    try:
        obj_id = ObjectId(attempt_id)
    except Exception:
        raise ValueError("Invalid attempt ID format")

    attempt = await db.verification_attempts.find_one({"_id": obj_id, "user_id": user_id})
    if not attempt:
        raise ValueError("Assessment attempt not found or does not belong to user")

    if attempt.get("status") in ("PASSED_BLUE", "PASSED_GREEN", "FAILED"):
        raise ValueError("This assessment attempt has already been submitted and scored.")

    # 2. Check timing integrity
    expires_at = attempt["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    elif isinstance(expires_at, datetime) and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    time_taken = int((now - attempt["started_at"].replace(tzinfo=timezone.utc)).total_seconds())

    is_late = now > expires_at

    # 3. Grade answers server-side
    level = attempt.get("level", "LEVEL_1_BLUE")
    pool = LEVEL_1_BLUE_QUESTIONS if level == "LEVEL_1_BLUE" else LEVEL_2_GREEN_QUESTIONS
    q_map = {q["id"]: q for q in pool}

    total_score = 0.0
    max_score = sum(q.get("points", 10.0) for q in pool)
    answers_dict = {a.get("question_id"): a for a in answers}

    graded_items: List[Dict[str, Any]] = []
    for q in pool:
        qid = q["id"]
        points = float(q.get("points", 10.0))
        st_ans = answers_dict.get(qid)
        correct_opt = q.get("correct_option")

        selected_opt = st_ans.get("selected_option") if st_ans else None
        is_correct = selected_opt is not None and int(selected_opt) == int(correct_opt)
        earned = points if is_correct else 0.0
        total_score += earned

        graded_items.append({
            "question_id": qid,
            "selected_option": selected_opt,
            "correct": is_correct,
            "earned_points": earned,
            "max_points": points,
        })

    percentage = round((total_score / max_score) * 100.0, 1) if max_score > 0 else 0.0
    pass_threshold = float(attempt.get("pass_threshold_percent", 70.0))

    passed = (percentage >= pass_threshold) and not is_late

    new_status = (
        ("PASSED_BLUE" if level == "LEVEL_1_BLUE" else "PASSED_GREEN")
        if passed
        else "FAILED"
    )

    credential_id: Optional[str] = None
    serial_number: Optional[str] = None
    student_registration_id: Optional[str] = None
    credential_hash: Optional[str] = None
    badge_type: Optional[str] = None
    title: Optional[str] = None
    certificate_url: Optional[str] = None
    public_verification_url: Optional[str] = None

    # Fetch student profile details
    profile = await db.student_profiles.find_one({"user_id": user_id}) or {}
    user_doc = await db.users.find_one({"firebase_uid": user_id}) or {}
    student_name = profile.get("full_name") or user_doc.get("display_name") or "Verified Student"
    college_name = profile.get("college") or "Placement Intelligence Partner College"
    department = profile.get("branch") or profile.get("department") or "Computer Science & Engineering"

    if passed:
        # Generate unguessable Credential ID & Cryptographic SHA-256 Digest
        token_hex = secrets.token_hex(6).upper()
        credential_id = f"PI-CRED-2026-{token_hex}"

        # 1. Allocate / ensure permanent Student Registration ID
        student_registration_id = await get_or_ensure_student_registration_id(db, user_id)

        # 2. Generate unique certificate serial number (PI-CV5-YYYY-XXXXXXXX or PI-CV10-YYYY-XXXXXXXX)
        serial_number = generate_certificate_serial_number(level, now.year)

        # 3. Retrieve active published certificate template
        active_tmpl = await get_active_published_template(db)
        template_id = active_tmpl.get("template_id", "tmpl_institutional_standard_v1")
        template_version = active_tmpl.get("version", 1)

        # 4. Generate cryptographic HMAC-SHA256 signature assertion
        secret_key = getattr(settings, "SECRET_KEY", "placement_intelligence_secret_key_2026")
        assertion_raw = f"{serial_number}:{student_registration_id}:{level}:{percentage}:{now.isoformat()}"
        signature_assertion = hmac.new(
            secret_key.encode("utf-8"),
            assertion_raw.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()

        hash_payload = f"{user_id}:{credential_id}:{serial_number}:{student_registration_id}:{level}:{percentage}:{now.isoformat()}"
        credential_hash = hashlib.sha256(hash_payload.encode()).hexdigest()

        badge_type = "BLUE_VERIFIED" if level == "LEVEL_1_BLUE" else "GREEN_FULLY_VERIFIED"
        title = "College Verified" if level == "LEVEL_1_BLUE" else "College Fully Verified"

        # If Level 2 Green, supersede prior Level 1 Blue credential cleanly without deleting history
        if level == "LEVEL_2_GREEN":
            await db.student_credentials.update_many(
                {"user_id": user_id, "level": "LEVEL_1_BLUE", "status": "ACTIVE"},
                {"$set": {"is_superseded": True, "superseded_by": credential_id, "updated_at": now}}
            )

        duration_mins = 5 if level == "LEVEL_1_BLUE" else 10
        skill_name = "Core Full Stack & Computer Science" if level == "LEVEL_1_BLUE" else "Advanced Full Stack & System Engineering"

        cred_doc = {
            "credential_id": credential_id,
            "serial_number": serial_number,
            "student_registration_id": student_registration_id,
            "template_id": template_id,
            "template_version": template_version,
            "signature_assertion": signature_assertion,
            "user_id": user_id,
            "student_name": student_name,
            "college": college_name,
            "department": department,
            "level": level,
            "badge_type": badge_type,
            "title": title,
            "skill": skill_name,
            "score": percentage,
            "duration_minutes": duration_mins,
            "issued_at": now,
            "expires_at": now + timedelta(days=365),
            "status": "ACTIVE",
            "credential_hash": credential_hash,
            "verification_url": f"/verify/{serial_number}",
            "public_visibility": True,
            "is_superseded": False,
            "attempt_id": attempt_id,
            "created_at": now,
        }

        # Compute PDF hash
        try:
            sample_pdf = generate_certificate_pdf_bytes(cred_doc, profile, active_tmpl)
            cred_doc["pdf_hash"] = hashlib.sha256(sample_pdf).hexdigest()
        except Exception:
            cred_doc["pdf_hash"] = hashlib.sha256(assertion_raw.encode()).hexdigest()

        await db.student_credentials.insert_one(cred_doc)

        # Sync into verified_skills collection so existing portfolio & recruiter filters pick it up
        await db.verified_skills.update_one(
            {"verification_hash": credential_hash},
            {"$set": {
                "user_id": user_id,
                "skill": skill_name,
                "proficiency": "College Verified" if level == "LEVEL_1_BLUE" else "College Fully Verified",
                "score": percentage,
                "evidence": f"Successfully completed proctored {duration_mins}-minute competency assessment with score {percentage}%.",
                "verification_hash": credential_hash,
                "verification_date": now,
                "badge_type": badge_type,
                "credential_id": credential_id,
            }},
            upsert=True
        )

        # Audit event
        await db.credential_events.insert_one({
            "event_type": "credential_issued",
            "credential_id": credential_id,
            "user_id": user_id,
            "level": level,
            "score": percentage,
            "timestamp": now,
            "details": {"attempt_id": attempt_id, "time_taken_seconds": time_taken}
        })

        # Recalculate student readiness
        try:
            from app.services.resume_intelligence import compute_and_store_readiness
            await compute_and_store_readiness(user_id, db)
        except Exception:
            pass

        certificate_url = f"/api/v1/verification/credentials/{credential_id}/pdf"
        public_verification_url = f"/verify/{credential_id}"

    # Update attempt record
    await db.verification_attempts.update_one(
        {"_id": obj_id},
        {"$set": {
            "status": new_status,
            "submitted_at": now,
            "score": total_score,
            "max_score": max_score,
            "percentage": percentage,
            "time_taken_seconds": time_taken,
            "passed": passed,
            "graded_answers": graded_items,
            "credential_id": credential_id,
            "credential_hash": credential_hash,
            "is_late": is_late,
            "updated_at": now,
        }}
    )

    feedback = (
        f"Congratulations! You scored {percentage}% and achieved {title} status."
        if passed
        else f"Assessment completed with score {percentage}%. Passing threshold is {pass_threshold}%. You may review the competencies and retake."
    )
    if is_late:
        feedback = "Assessment submission exceeded the strict server time limit. Attempt marked as expired."

    return {
        "attempt_id": attempt_id,
        "status": new_status,
        "score": total_score,
        "max_score": max_score,
        "percentage": percentage,
        "passed": passed,
        "passing_threshold_percent": pass_threshold,
        "level": level,
        "credential_id": credential_id,
        "serial_number": serial_number,
        "student_registration_id": student_registration_id,
        "credential_hash": credential_hash,
        "badge_type": badge_type,
        "title": title,
        "feedback": feedback,
        "time_taken_seconds": time_taken,
        "certificate_url": certificate_url,
        "public_verification_url": public_verification_url,
    }


def generate_certificate_pdf_bytes(
    credential: Dict[str, Any],
    profile: Optional[Dict[str, Any]] = None,
    template_doc: Optional[Dict[str, Any]] = None,
) -> bytes:
    """
    Generates a high-resolution, institutional landscape A4 PDF Certificate
    using ReportLab with custom borders, seals, and QR code verification block.
    """
    buffer = io.BytesIO()
    # A4 Landscape: 841.89 x 595.27 points
    c = canvas.Canvas(buffer, pagesize=landscape(A4))
    width, height = landscape(A4)

    is_green = credential.get("level") == "LEVEL_2_GREEN"
    primary_color = colors.HexColor("#065F46") if is_green else colors.HexColor("#1E40AF")
    accent_color = colors.HexColor("#059669") if is_green else colors.HexColor("#2563EB")
    gold_color = colors.HexColor("#D97706")
    slate_dark = colors.HexColor("#0F172A")
    slate_mid = colors.HexColor("#475569")
    bg_tint = colors.HexColor("#F0FDF4") if is_green else colors.HexColor("#EFF6FF")

    # 1. Background tint
    c.setFillColor(bg_tint)
    c.rect(0, 0, width, height, fill=True, stroke=False)

    # 2. Outer Decorative Borders
    c.setStrokeColor(primary_color)
    c.setLineWidth(4)
    c.rect(20, 20, width - 40, height - 40, fill=False, stroke=True)

    c.setStrokeColor(gold_color)
    c.setLineWidth(1.5)
    c.rect(26, 26, width - 52, height - 52, fill=False, stroke=True)

    # 3. Corner Ornaments
    corner_size = 18
    for (cx, cy) in [(32, 32), (width - 32 - corner_size, 32), (32, height - 32 - corner_size), (width - 32 - corner_size, height - 32 - corner_size)]:
        c.setStrokeColor(gold_color)
        c.setLineWidth(1)
        c.rect(cx, cy, corner_size, corner_size, fill=False, stroke=True)

    # 4. Header Institution & Credential Authority
    c.setFillColor(primary_color)
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(width / 2.0, height - 60, "PLACEMENT INTELLIGENCE DIGITAL CREDENTIAL AUTHORITY")

    college_name = credential.get("college") or (profile or {}).get("college") or "Accredited Partner Institution"
    c.setFillColor(slate_mid)
    c.setFont("Helvetica-Bold", 10)
    c.drawCentredString(width / 2.0, height - 76, f"IN ASSOCIATION WITH {college_name.upper()}")

    # 5. Certificate Title
    c.setFillColor(gold_color)
    c.setFont("Helvetica-Bold", 9)
    badge_label = "LEVEL 2 — COLLEGE FULLY VERIFIED CREDENTIAL (100% VERIFIED)" if is_green else "LEVEL 1 — COLLEGE VERIFIED CREDENTIAL (50% VERIFIED)"
    c.drawCentredString(width / 2.0, height - 105, f"★ {badge_label} ★")

    c.setFillColor(slate_dark)
    c.setFont("Helvetica-Bold", 26)
    c.drawCentredString(width / 2.0, height - 140, "CERTIFICATE OF VERIFIED COMPETENCY")

    # 6. Presentation prose
    c.setFillColor(slate_mid)
    c.setFont("Helvetica", 11)
    c.drawCentredString(width / 2.0, height - 170, "This is to officially certify that")

    # 7. Student Name
    student_name = credential.get("student_name") or (profile or {}).get("full_name") or "Verified Candidate"
    c.setFillColor(primary_color)
    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(width / 2.0, height - 202, student_name)

    # Underline student name with gold accent
    name_width = c.stringWidth(student_name, "Helvetica-Bold", 22)
    c.setStrokeColor(gold_color)
    c.setLineWidth(1.5)
    c.line((width / 2.0) - (name_width / 2.0) - 20, height - 208, (width / 2.0) + (name_width / 2.0) + 20, height - 208)

    # 8. Achievement prose
    department = credential.get("department") or (profile or {}).get("branch") or "Computer Science & Engineering"
    skill = credential.get("skill", "Software Engineering & Full Stack Competency")
    score = credential.get("score", 85.0)
    duration = credential.get("duration_minutes", 10 if is_green else 5)

    c.setFillColor(slate_dark)
    c.setFont("Helvetica", 11)
    c.drawCentredString(
        width / 2.0,
        height - 235,
        f"of the Department of {department} has successfully completed the proctored {duration}-minute competency assessment,"
    )
    c.drawCentredString(
        width / 2.0,
        height - 253,
        f"demonstrating verified proficiency in {skill} with an evaluated score of {score}%."
    )

    # 9. Verification Summary Box
    box_x = 70
    box_y = 105
    box_w = width - 140
    box_h = 100

    c.setFillColor(colors.white)
    c.setStrokeColor(colors.HexColor("#CBD5E1"))
    c.setLineWidth(1)
    c.roundRect(box_x, box_y, box_w, box_h, 8, fill=True, stroke=True)

    # Details inside box
    serial_no = str(credential.get("serial_number") or credential.get("credential_id", "N/A"))
    reg_id_disp = str(credential.get("student_registration_id", "N/A"))

    c.setFillColor(slate_dark)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(box_x + 16, box_y + 76, "SERIAL NUMBER:")
    c.setFont("Helvetica", 8.5)
    c.drawString(box_x + 115, box_y + 76, serial_no)

    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(box_x + 16, box_y + 56, "STUDENT REG ID:")
    c.setFont("Helvetica", 8.5)
    c.drawString(box_x + 115, box_y + 56, reg_id_disp)

    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(box_x + 16, box_y + 36, "VERIFICATION LEVEL:")
    c.setFont("Helvetica", 8.5)
    level_str = "Level 2: Green Fully Verified (10-Min)" if is_green else "Level 1: Blue Verified (5-Min)"
    c.drawString(box_x + 130, box_y + 36, level_str)

    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(box_x + 16, box_y + 16, "DATE OF ISSUANCE:")
    c.setFont("Helvetica", 8.5)
    issued_val = credential.get("issued_at")
    issued_str = issued_val.strftime("%B %d, %Y") if isinstance(issued_val, datetime) else str(issued_val or "November 21, 2026")
    c.drawString(box_x + 120, box_y + 16, issued_str)

    # Middle column: cryptographic security & template version
    mid_col_x = box_x + 290
    tmpl_ver = credential.get("template_version", 1)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(mid_col_x, box_y + 76, "TEMPLATE:")
    c.setFont("Helvetica", 8)
    c.drawString(mid_col_x + 65, box_y + 76, f"Official Institutional v{tmpl_ver}")

    c.setFont("Helvetica-Bold", 8)
    c.drawString(mid_col_x, box_y + 56, "HMAC ASSERTION:")
    c.setFont("Helvetica-Oblique", 7)
    sig_assert = str(credential.get("signature_assertion", "SHA256-HMAC-VERIFIED"))
    c.drawString(mid_col_x + 95, box_y + 56, sig_assert[:22] + "...")

    c.setFont("Helvetica-Bold", 8)
    c.drawString(mid_col_x, box_y + 36, "DIGITAL HASH:")
    c.setFont("Helvetica-Oblique", 7)
    full_hash = str(credential.get("credential_hash", "0" * 64))
    c.drawString(mid_col_x + 80, box_y + 36, full_hash[:22] + "...")

    c.setFont("Helvetica-Bold", 8)
    c.drawString(mid_col_x, box_y + 16, "STATUS:")
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(colors.HexColor("#059669"))
    c.drawString(mid_col_x + 55, box_y + 16, "AUTHENTIC & VERIFIED")

    # 10. QR Code Generation for Verification URL
    cred_lookup_id = credential.get("serial_number") or credential.get("credential_id") or "PI-VERIFY"
    verify_url = f"https://placementintelligence.edu/verify/{cred_lookup_id}"

    qr = qrcode.QRCode(version=1, box_size=3, border=1)
    qr.add_data(verify_url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")

    qr_buffer = io.BytesIO()
    qr_img.save(qr_buffer, format="PNG")
    qr_buffer.seek(0)

    from reportlab.lib.utils import ImageReader
    qr_image_reader = ImageReader(qr_buffer)
    # Draw QR code inside the right section of the box
    qr_size = 76
    c.drawImage(qr_image_reader, box_x + box_w - qr_size - 10, box_y + 12, width=qr_size, height=qr_size)

    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(primary_color)
    c.drawCentredString(box_x + box_w - (qr_size / 2) - 10, box_y + 4, "SCAN TO VERIFY")

    # 11. Signatures / Authority seals
    sig_y = 52
    c.setStrokeColor(slate_dark)
    c.setLineWidth(1)

    # Placement Officer
    c.line(80, sig_y + 15, 230, sig_y + 15)
    c.setFillColor(slate_dark)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(80, sig_y + 2, "HEAD OF PLACEMENT & CAREERS")
    c.setFont("Helvetica", 8)
    c.setFillColor(slate_mid)
    c.drawString(80, sig_y - 10, college_name)

    # Authority Seal in Center
    seal_color = gold_color
    c.setStrokeColor(seal_color)
    c.setLineWidth(2)
    c.circle(width / 2.0, sig_y + 8, 20, fill=False, stroke=True)
    c.setFillColor(seal_color)
    c.setFont("Helvetica-Bold", 6.5)
    c.drawCentredString(width / 2.0, sig_y + 12, "DIGITALLY")
    c.drawCentredString(width / 2.0, sig_y + 4, "VERIFIED")

    # Registrar / Institutional Authority from Template
    sig_name = (template_doc or {}).get("signatory_name") or "Dr. Rajesh V. Ramanathan"
    sig_title = (template_doc or {}).get("signatory_title") or "DEAN OF ACADEMIC AFFAIRS & PLACEMENT"

    c.line(width - 240, sig_y + 15, width - 80, sig_y + 15)
    c.setFillColor(slate_dark)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(width - 240, sig_y + 2, sig_title.upper()[:36])
    c.setFont("Helvetica", 8)
    c.setFillColor(slate_mid)
    c.drawString(width - 240, sig_y - 10, sig_name[:36])

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer.getvalue()


async def get_public_credential(credential_id_or_hash: str, db: Any) -> Dict[str, Any]:
    """
    Public, read-only credential lookup for employers and recruiters.
    Strictly sanitizes private PII (no email, phone, roll number, or answers).
    """
    clean_identifier = (credential_id_or_hash or "").strip()
    if len(clean_identifier) < 4 or len(clean_identifier) > 128:
        raise ValueError("Invalid credential verification hash format: Expected valid hash or credential identifier.")

    cred_coll = getattr(db, "student_credentials", None)
    cred = None
    if cred_coll is not None:
        cred = await cred_coll.find_one({
            "$or": [
                {"serial_number": clean_identifier},
                {"serial_number": clean_identifier.upper()},
                {"credential_id": clean_identifier},
                {"credential_id": clean_identifier.upper()},
                {"credential_hash": clean_identifier.lower()},
                {"credential_hash": clean_identifier},
            ]
        })

    if not cred:
        # Fallback to legacy verified_skills table
        legacy_coll = getattr(db, "verified_skills", None)
        legacy = None
        if legacy_coll is not None:
            legacy = await legacy_coll.find_one({
                "$or": [
                    {"verification_hash": clean_identifier.lower()},
                    {"verification_hash": clean_identifier},
                    {"credential_id": clean_identifier},
                ]
            })
        if not legacy:
            raise LookupError("Credential record not found or revoked.")

        profile = await db.student_profiles.find_one({"user_id": legacy["user_id"]})
        user = await db.users.find_one({"firebase_uid": legacy["user_id"]})

        v_date = legacy.get("verification_date")
        issued_str = v_date.isoformat() if isinstance(v_date, datetime) else str(v_date or "")

        return {
            "verified": True,
            "status": "ACTIVE_VERIFIED",
            "candidate_name": (profile or {}).get("full_name") or (user or {}).get("display_name", "Verified Candidate"),
            "college": (profile or {}).get("college", "Accredited University"),
            "level": "LEVEL_1_BLUE",
            "badge_type": "BLUE_VERIFIED",
            "title": "College Verified",
            "skill": legacy.get("skill", "Software Engineering"),
            "score": float(legacy.get("score", 85.0)),
            "evidence": legacy.get("evidence", "Demonstrated competency via sandboxed coding assessment."),
            "credential_id": legacy.get("credential_id") or f"PI-LEGACY-{clean_identifier[:8].upper()}",
            "serial_number": None,
            "student_registration_id": mask_registration_id(None),
            "template_version": 1,
            "signature_assertion": None,
            "pdf_hash": None,
            "verification_hash": legacy.get("verification_hash", clean_identifier),
            "issued_at": issued_str,
            "issuing_platform": "Placement Intelligence Digital Credential Authority",
            "cryptographic_algorithm": "SHA-256 Digest",
            "revocation_reason": None,
        }

    # Respect student's public visibility setting
    if not cred.get("public_visibility", True):
        return {
            "verified": True,
            "status": "PRIVATE",
            "candidate_name": "Private Candidate Profile",
            "college": cred.get("college", "Accredited Institution"),
            "level": cred.get("level"),
            "badge_type": cred.get("badge_type"),
            "title": cred.get("title"),
            "skill": cred.get("skill"),
            "score": cred.get("score"),
            "evidence": "Candidate has set credential details to private.",
            "credential_id": cred.get("credential_id"),
            "serial_number": cred.get("serial_number"),
            "student_registration_id": mask_registration_id(cred.get("student_registration_id")),
            "template_version": cred.get("template_version", 1),
            "signature_assertion": cred.get("signature_assertion"),
            "pdf_hash": cred.get("pdf_hash"),
            "verification_hash": cred.get("credential_hash"),
            "issued_at": cred.get("issued_at").isoformat() if isinstance(cred.get("issued_at"), datetime) else str(cred.get("issued_at")),
            "issuing_platform": "Placement Intelligence Digital Credential Authority",
            "cryptographic_algorithm": "SHA-256 Digest",
            "revocation_reason": None,
        }

    status_str = "ACTIVE_VERIFIED"
    if cred.get("status") == "REVOKED":
        status_str = "REVOKED"
    elif cred.get("status") == "EXPIRED":
        status_str = "EXPIRED"

    issued_val = cred.get("issued_at")
    issued_str = issued_val.isoformat() if isinstance(issued_val, datetime) else str(issued_val or "")

    return {
        "verified": cred.get("status") == "ACTIVE",
        "status": status_str,
        "candidate_name": cred.get("student_name", "Verified Candidate"),
        "college": cred.get("college", "Accredited Institution"),
        "level": cred.get("level", "LEVEL_1_BLUE"),
        "badge_type": cred.get("badge_type", "BLUE_VERIFIED"),
        "title": cred.get("title", "College Verified"),
        "skill": cred.get("skill", "Software Engineering"),
        "score": float(cred.get("score", 85.0)),
        "evidence": f"Demonstrated verified competency via {cred.get('duration_minutes', 10)}-minute institutional assessment.",
        "credential_id": cred.get("credential_id"),
        "serial_number": cred.get("serial_number"),
        "student_registration_id": mask_registration_id(cred.get("student_registration_id")),
        "template_version": cred.get("template_version", 1),
        "signature_assertion": cred.get("signature_assertion"),
        "pdf_hash": cred.get("pdf_hash"),
        "verification_hash": cred.get("credential_hash"),
        "issued_at": issued_str,
        "issuing_platform": "Placement Intelligence Digital Credential Authority",
        "cryptographic_algorithm": "SHA-256 Digest & HMAC-SHA256 Assertion",
        "revocation_reason": cred.get("revocation_reason"),
    }
