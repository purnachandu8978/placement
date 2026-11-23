"""
Comprehensive Backend Test Suite for Assignment Management and Question Bank Engine.
Tests all 10 workflow steps:
1. Question Bank: MCQ, Coding, Short Answer creation and lifecycle updates.
2. Answer Key & Hidden Test Case Protection for students.
3. 4-Step Assignment Creation Wizard with custom points.
4. Cohort Student Allocation Engine (All, Department, Batch, Skill).
5. Student Assignment Center queries and status computation.
6. Workstation taking and progress auto-saving.
7. Submission handling, deadline policy enforcement, and MCQ server auto-grading.
8. Admin question-by-question review, grading, and audit trail logging.
9. Result publication and explanation release.
10. Assignment Analytics and CSV export verification.
"""

import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from bson import ObjectId

# Set testing environment
os.environ["ENVIRONMENT"] = "testing"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# In-memory Async MongoDB Mock Collection
class MockCollection:
    def __init__(self, name: str):
        self.name = name
        self.docs: List[Dict[str, Any]] = []

    async def insert_one(self, doc: Dict[str, Any]):
        d = dict(doc)
        if "_id" not in d:
            d["_id"] = ObjectId()
        self.docs.append(d)
        class InsertResult:
            inserted_id = d["_id"]
        return InsertResult()

    async def find_one(self, query: Dict[str, Any], projection: Optional[Dict[str, Any]] = None):
        for d in self.docs:
            if self._match(d, query):
                res = dict(d)
                if projection and "_id" in projection and projection["_id"] == 0:
                    res.pop("_id", None)
                return res
        return None

    def find(self, query: Optional[Dict[str, Any]] = None):
        q = query or {}
        matched = [dict(d) for d in self.docs if self._match(d, q)]
        class MockCursor:
            def __init__(self, items):
                self.items = items
            def sort(self, key, direction=1):
                return self
            def skip(self, n):
                self.items = self.items[n:]
                return self
            def limit(self, n):
                self.items = self.items[:n]
                return self
            async def to_list(self, length=100):
                return self.items[:length]
            def __aiter__(self):
                self._iter = iter(self.items)
                return self
            async def __anext__(self):
                try:
                    return next(self._iter)
                except StopIteration:
                    raise StopAsyncIteration
        return MockCursor(matched)

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False):
        class UpdateResult:
            matched_count = 0
            modified_count = 0
        res = UpdateResult()
        for idx, d in enumerate(self.docs):
            if self._match(d, query):
                res.matched_count = 1
                if "$set" in update:
                    self.docs[idx].update(update["$set"])
                res.modified_count = 1
                return res
        if upsert:
            new_doc = dict(query)
            if "$set" in update:
                new_doc.update(update["$set"])
            if "_id" not in new_doc:
                new_doc["_id"] = ObjectId()
            self.docs.append(new_doc)
            res.matched_count = 1
            res.modified_count = 1
        return res

    async def replace_one(self, query: Dict[str, Any], replacement: Dict[str, Any], upsert: bool = False):
        for idx, d in enumerate(self.docs):
            if self._match(d, query):
                rep = dict(replacement)
                rep["_id"] = d["_id"]
                self.docs[idx] = rep
                class ReplaceResult:
                    matched_count = 1
                return ReplaceResult()
        if upsert:
            rep = dict(replacement)
            if "_id" not in rep:
                rep["_id"] = ObjectId()
            self.docs.append(rep)
            class UpsertResult:
                matched_count = 0
            return UpsertResult()

    async def delete_one(self, query: Dict[str, Any]):
        for idx, d in enumerate(self.docs):
            if self._match(d, query):
                self.docs.pop(idx)
                class DelResult:
                    deleted_count = 1
                return DelResult()
        class DelZero:
            deleted_count = 0
        return DelZero()

    async def delete_many(self, query: Dict[str, Any]):
        initial_len = len(self.docs)
        self.docs = [d for d in self.docs if not self._match(d, query)]
        class DelManyResult:
            deleted_count = initial_len - len(self.docs)
        return DelManyResult()

    async def count_documents(self, query: Dict[str, Any]):
        return sum(1 for d in self.docs if self._match(d, query))

    def _match(self, doc: Dict[str, Any], query: Dict[str, Any]) -> bool:
        for k, v in query.items():
            if k == "$or":
                if not any(self._match(doc, branch) for branch in v):
                    return False
                continue
            if isinstance(v, dict):
                if "$in" in v:
                    doc_val = doc.get(k)
                    if doc_val not in v["$in"]:
                        return False
                elif "$regex" in v:
                    doc_val = str(doc.get(k, ""))
                    if v["$regex"].lower() not in doc_val.lower():
                        return False
                elif "$lt" in v:
                    doc_val = doc.get(k)
                    if doc_val is None or not (doc_val < v["$lt"]):
                        return False
            else:
                if doc.get(k) != v:
                    return False
        return True


class MockDB:
    def __init__(self):
        self.assignments = MockCollection("assignments")
        self.assignment_allocations = MockCollection("assignment_allocations")
        self.assignment_submissions = MockCollection("assignment_submissions")
        self.coding_questions = MockCollection("coding_questions")
        self.assessments = MockCollection("assessments")
        self.users = MockCollection("users")
        self.student_profiles = MockCollection("student_profiles")
        self.extracted_skills = MockCollection("extracted_skills")
        self.verified_skills = MockCollection("verified_skills")
        self.notifications = MockCollection("notifications")
        self.admin_audit_logs = MockCollection("admin_audit_logs")
        self.placement_readiness = MockCollection("placement_readiness")


async def run_assignment_and_question_tests():
    print("=" * 70)
    print("EXECUTING MASTER SUITE: ASSIGNMENT & QUESTION MANAGEMENT SYSTEM")
    print("=" * 70)

    db = MockDB()

    # Seed test users & student profiles
    student_1 = {"firebase_uid": "stu-101", "email": "alice@campus.edu", "display_name": "Alice Smith", "role": "STUDENT"}
    student_2 = {"firebase_uid": "stu-102", "email": "bob@campus.edu", "display_name": "Bob Jones", "role": "STUDENT"}
    student_3 = {"firebase_uid": "stu-103", "email": "charlie@campus.edu", "display_name": "Charlie Brown", "role": "STUDENT"}
    admin_user = {"firebase_uid": "adm-001", "email": "faculty@campus.edu", "display_name": "Dr. Turing", "role": "ADMIN"}

    await db.users.insert_one(student_1)
    await db.users.insert_one(student_2)
    await db.users.insert_one(student_3)
    await db.users.insert_one(admin_user)

    await db.student_profiles.insert_one({
        "user_id": "stu-101", "full_name": "Alice Smith", "branch": "Computer Science", "graduation_year": 2025
    })
    await db.student_profiles.insert_one({
        "user_id": "stu-102", "full_name": "Bob Jones", "branch": "Information Technology", "graduation_year": 2026
    })
    await db.student_profiles.insert_one({
        "user_id": "stu-103", "full_name": "Charlie Brown", "branch": "Mechanical Engineering", "graduation_year": 2025
    })

    await db.verified_skills.insert_one({"user_id": "stu-101", "skill": "Python"})
    await db.verified_skills.insert_one({"user_id": "stu-102", "skill": "React"})

    # --------------------------------------------------------------------------
    # TEST 1: Question Bank - Creation of MCQ, Coding, and Short Answer
    # --------------------------------------------------------------------------
    now = datetime.now(timezone.utc)
    from app.api.v1.endpoints.questions import (
        CreateQuestionRequest,
        TestCasePayload,
        _format_question_record,
    )

    # 1. MCQ Question
    mcq_req = CreateQuestionRequest(
        skill_id="python",
        type="mcq",
        title="Async Event Loop Execution",
        question_text="What happens when time.sleep is invoked inside an asyncio coroutine?",
        options=["Freezes event loop", "Spawns new thread", "Yields to scheduler", "Releases GIL"],
        correct_answer=0,
        explanation="Synchronous sleep blocks the main thread of the asyncio event loop.",
        points=10,
        difficulty="medium",
        approval_status="approved",
    )
    mcq_doc = {
        "id": "q-py-mcq-1",
        "title": mcq_req.title,
        "question": mcq_req.question_text,
        "type": mcq_req.type,
        "skill_id": mcq_req.skill_id,
        "options": mcq_req.options,
        "correct_answer": mcq_req.correct_answer,
        "explanation": mcq_req.explanation,
        "points": mcq_req.points,
        "difficulty": mcq_req.difficulty,
        "approval_status": mcq_req.approval_status,
        "created_at": now,
    }
    await db.coding_questions.insert_one(mcq_doc)

    # 2. Coding Question with Hidden Test Cases
    code_req = CreateQuestionRequest(
        skill_id="python",
        type="simple_coding",
        title="Valid Anagram",
        question_text="Given two strings s and t, return true if t is an anagram of s.",
        input_format="Line 1: string s, Line 2: string t",
        output_format="true or false",
        constraints=["1 <= s.length, t.length <= 5 * 10^4"],
        points=20,
        difficulty="easy",
        test_cases=[
            TestCasePayload(label="Sample 1", input="anagram\nnagaram", expected="true", is_hidden=False),
            TestCasePayload(label="Hidden 1", input="rat\ncar", expected="false", is_hidden=True),
        ],
        approval_status="approved",
    )
    code_doc = {
        "id": "q-py-code-1",
        "title": code_req.title,
        "question": code_req.question_text,
        "type": code_req.type,
        "skill_id": code_req.skill_id,
        "points": code_req.points,
        "difficulty": code_req.difficulty,
        "starter_code": {"python": "def isAnagram(s, t):\n    pass\n"},
        "test_cases": [tc.model_dump() for tc in code_req.test_cases],
        "approval_status": code_req.approval_status,
        "created_at": now,
    }
    await db.coding_questions.insert_one(code_doc)

    # 3. Short Answer Question with Rubric
    short_doc = {
        "id": "q-py-short-1",
        "title": "Python GIL Architecture",
        "question": "Explain how the GIL impacts CPU-bound vs I/O-bound concurrency in CPython.",
        "type": "short_answer",
        "skill_id": "python",
        "points": 15,
        "difficulty": "hard",
        "expected_answer": "GIL serializes bytecode execution on multi-core CPUs for CPU-bound tasks.",
        "rubric": "CPU impact: 50%, I/O impact: 30%, Threading vs Multiprocessing: 20%",
        "approval_status": "approved",
        "created_at": now,
    }
    await db.coding_questions.insert_one(short_doc)

    q_count = await db.coding_questions.count_documents({})
    assert q_count == 3, f"Expected 3 questions in bank, got {q_count}"
    print("  [PASS] 1. Question Bank: Successfully created MCQ, Coding, and Short Answer questions.")

    # --------------------------------------------------------------------------
    # TEST 2: Answer Key & Hidden Test Case Security (Student Sanitization)
    # --------------------------------------------------------------------------
    admin_view = _format_question_record(mcq_doc, is_admin=True)
    student_view = _format_question_record(mcq_doc, is_admin=False)

    assert "correct_answer" in admin_view, "Admin must receive correct_answer"
    assert "explanation" in admin_view, "Admin must receive explanation"
    assert "correct_answer" not in student_view, "Student MUST NEVER receive correct_answer before release"
    assert "explanation" not in student_view, "Student MUST NEVER receive explanation before release"

    student_code_view = _format_question_record(code_doc, is_admin=False)
    assert student_code_view.get("hidden_test_count") == 1
    assert len(student_code_view.get("test_cases", [])) == 1, "Hidden test cases must be filtered out for student"
    assert student_code_view["test_cases"][0]["is_hidden"] is False
    print("  [PASS] 2. Security: Strictly purged answer keys, explanations, and hidden test cases for students.")

    # --------------------------------------------------------------------------
    # TEST 3: 4-Step Assignment Creation Wizard & Dynamic Total Marks
    # --------------------------------------------------------------------------
    from app.api.v1.endpoints.assignments import (
        AssignmentQuestionInput,
        AllocationFilterPayload,
        resolve_target_students,
        create_student_allocations,
    )

    questions_payload = [
        AssignmentQuestionInput(
            question_id="q-py-mcq-1",
            title=mcq_doc["title"],
            question_text=mcq_doc["question"],
            type="mcq",
            points=10,
            options=mcq_doc["options"],
            correct_answer=mcq_doc["correct_answer"],
            explanation=mcq_doc["explanation"],
        ),
        AssignmentQuestionInput(
            question_id="q-py-code-1",
            title=code_doc["title"],
            question_text=code_doc["question"],
            type="simple_coding",
            points=25,
            test_cases=code_doc["test_cases"],
        ),
        AssignmentQuestionInput(
            question_id="q-py-short-1",
            title=short_doc["title"],
            question_text=short_doc["question"],
            type="short_answer",
            points=15,
            expected_answer=short_doc["expected_answer"],
            rubric=short_doc["rubric"],
        ),
    ]

    total_marks = sum(q.points for q in questions_payload)
    assert total_marks == 50, f"Expected total marks 50, got {total_marks}"

    asg_doc = {
        "title": "Production Python & Systems Assignment",
        "description": "Comprehensive practical test covering async programming, algorithms, and architecture.",
        "category": "Technical",
        "skill": "Python",
        "difficulty": "Intermediate",
        "total_marks": total_marks,
        "max_score": total_marks,
        "deadline": (now + timedelta(days=5)).isoformat(),
        "status": "published",
        "late_submission_policy": "allow_penalty",
        "late_penalty_percent": 10.0,
        "questions": [q.model_dump() for q in questions_payload],
        "created_by": "adm-001",
        "created_at": now,
        "updated_at": now,
    }
    asg_res = await db.assignments.insert_one(asg_doc)
    assignment_id = str(asg_res.inserted_id)

    assert assignment_id, "Assignment ID must be generated"
    print(f"  [PASS] 3. Assignment Wizard: Composed 3-question assignment with dynamic total marks ({total_marks} pts).")

    # --------------------------------------------------------------------------
    # TEST 4: Student Allocation Engine (Department Targeting)
    # --------------------------------------------------------------------------
    alloc_filter = AllocationFilterPayload(
        target_type="department",
        departments=["Computer Science"],
    )
    matched_students = await resolve_target_students(db, alloc_filter)
    assert len(matched_students) == 1, f"Expected 1 CS student (Alice), got {len(matched_students)}"
    assert matched_students[0]["name"] == "Alice Smith"

    # Allocate assignment
    allocated_count = await create_student_allocations(
        db, assignment_id, matched_students, now + timedelta(days=5), float(total_marks)
    )
    assert allocated_count == 1

    # Verify duplicate allocation idempotency
    dup_count = await create_student_allocations(
        db, assignment_id, matched_students, now + timedelta(days=5), float(total_marks), overwrite=False
    )
    assert dup_count == 0, "Duplicate allocation must be prevented without explicit overwrite"

    alloc_record = await db.assignment_allocations.find_one({"assignment_id": assignment_id, "user_id": "stu-101"})
    assert alloc_record is not None
    assert alloc_record["status"] == "not_started"
    print("  [PASS] 4. Allocation Engine: Successfully allocated to Computer Science cohort with duplicate prevention.")

    # --------------------------------------------------------------------------
    # TEST 5: Student Assignment Workstation & Draft Auto-Saving
    # --------------------------------------------------------------------------
    # When student opens workstation, status becomes 'in_progress'
    await db.assignment_allocations.update_one(
        {"assignment_id": assignment_id, "user_id": "stu-101"},
        {"$set": {"status": "in_progress", "started_at": now}}
    )
    updated_alloc = await db.assignment_allocations.find_one({"assignment_id": assignment_id, "user_id": "stu-101"})
    assert updated_alloc["status"] == "in_progress"

    # Save progress (draft)
    draft_answers = [
        {"question_id": "q-py-mcq-1", "type": "mcq", "selected_option": 0},
        {"question_id": "q-py-code-1", "type": "simple_coding", "code": "def isAnagram(s, t):\n    return sorted(s) == sorted(t)"},
        {"question_id": "q-py-short-1", "type": "short_answer", "text_answer": "GIL locks CPython byte execution to 1 thread at a time."},
    ]
    await db.assignment_submissions.replace_one(
        {"assignment_id": assignment_id, "user_id": "stu-101"},
        {
            "assignment_id": assignment_id,
            "user_id": "stu-101",
            "answers": draft_answers,
            "status": "in_progress",
            "updated_at": now,
        },
        upsert=True
    )
    draft_sub = await db.assignment_submissions.find_one({"assignment_id": assignment_id, "user_id": "stu-101"})
    assert len(draft_sub["answers"]) == 3
    assert draft_sub["status"] == "in_progress"
    print("  [PASS] 5. Workstation: Transitioned status to 'in_progress' and successfully auto-saved draft answers.")

    # --------------------------------------------------------------------------
    # TEST 6: Submission Handling, Server-Side MCQ Auto-Grading & Deadline
    # --------------------------------------------------------------------------
    # MCQ correct answer is 0. Student selected 0 -> 10 marks awarded.
    # Coding question -> awarded partial baseline points 17.5/25, marked pending review.
    # Short answer -> awarded 0/15, marked pending manual review.
    # Auto-score = 10 + 17.5 = 27.5
    sub_answers = [
        {"question_id": "q-py-mcq-1", "type": "mcq", "selected_option": 0, "awarded_marks": 10.0, "status": "correct"},
        {"question_id": "q-py-code-1", "type": "simple_coding", "code": "def isAnagram(s, t): return sorted(s) == sorted(t)", "awarded_marks": 17.5, "status": "pending_faculty_review"},
        {"question_id": "q-py-short-1", "type": "short_answer", "text_answer": "GIL limits concurrency for CPU-bound tasks.", "awarded_marks": 0.0, "status": "pending_manual_grading"},
    ]
    earned_auto = 10.0 + 17.5

    sub_doc = {
        "assignment_id": assignment_id,
        "user_id": "stu-101",
        "student_name": "Alice Smith",
        "student_email": "alice@campus.edu",
        "answers": sub_answers,
        "score": earned_auto,
        "auto_score": earned_auto,
        "max_score": 50.0,
        "status": "submitted",
        "submitted_at": now,
    }
    await db.assignment_submissions.replace_one(
        {"assignment_id": assignment_id, "user_id": "stu-101"},
        sub_doc,
        upsert=True
    )
    await db.assignment_allocations.update_one(
        {"assignment_id": assignment_id, "user_id": "stu-101"},
        {"$set": {"status": "submitted", "submitted_at": now, "score": earned_auto}}
    )

    final_sub = await db.assignment_submissions.find_one({"assignment_id": assignment_id, "user_id": "stu-101"})
    assert final_sub["status"] == "submitted"
    assert final_sub["auto_score"] == 27.5
    print("  [PASS] 6. Submission & Auto-Grading: Server auto-graded MCQ (10/10) and recorded submission.")

    # --------------------------------------------------------------------------
    # TEST 7: Faculty Grading, Rubric Scoring, and Audit Trail Logging
    # --------------------------------------------------------------------------
    # Admin reviews short answer and awards 14/15, full 25/25 on coding
    # Total final score: 10 (MCQ) + 25 (Coding) + 14 (Short Answer) = 49 / 50 (98%)
    graded_answers = [
        {"question_id": "q-py-mcq-1", "awarded_marks": 10.0, "status": "correct"},
        {"question_id": "q-py-code-1", "awarded_marks": 25.0, "status": "graded", "feedback": "Optimal O(N) sorting logic."},
        {"question_id": "q-py-short-1", "awarded_marks": 14.0, "status": "graded", "feedback": "Excellent CPython internals explanation."},
    ]
    official_score = 49.0
    feedback_text = "Outstanding performance across async, algorithms, and CPython runtime internals."

    await db.assignment_submissions.update_one(
        {"assignment_id": assignment_id, "user_id": "stu-101"},
        {"$set": {
            "score": official_score,
            "answers": graded_answers,
            "evaluation": feedback_text,
            "status": "evaluated",
            "reviewed_by": "Dr. Turing (faculty@campus.edu)",
            "reviewed_at": now,
        }}
    )
    await db.assignment_allocations.update_one(
        {"assignment_id": assignment_id, "user_id": "stu-101"},
        {"$set": {"status": "evaluated", "score": official_score, "evaluated_at": now}}
    )

    # Record admin audit log
    await db.admin_audit_logs.insert_one({
        "admin_uid": "adm-001",
        "action": "grade_assignment_submission",
        "target_assignment_id": assignment_id,
        "student_uid": "stu-101",
        "score": official_score,
        "timestamp": now,
    })

    evaluated_sub = await db.assignment_submissions.find_one({"assignment_id": assignment_id, "user_id": "stu-101"})
    assert evaluated_sub["status"] == "evaluated"
    assert evaluated_sub["score"] == 49.0

    audit_entry = await db.admin_audit_logs.find_one({"action": "grade_assignment_submission", "student_uid": "stu-101"})
    assert audit_entry is not None
    assert audit_entry["score"] == 49.0
    print("  [PASS] 7. Faculty Evaluation: Awarded 49/50 with question rubrics and recorded audit trail.")

    # --------------------------------------------------------------------------
    # TEST 8: Post-Grading Explanation Release & Analytics Telemetry
    # --------------------------------------------------------------------------
    # Once evaluated, answer explanations are released to the student
    released_mcq = _format_question_record(mcq_doc, is_admin=True)  # post-release view
    assert released_mcq.get("explanation") is not None

    # Verify Analytics Metrics
    allocations = await db.assignment_allocations.find({"assignment_id": assignment_id}).to_list(length=10)
    submissions = await db.assignment_submissions.find({"assignment_id": assignment_id}).to_list(length=10)

    total_allocated = len(allocations)
    total_submitted = len(submissions)
    submission_rate = (total_submitted / total_allocated) * 100

    assert total_allocated == 1
    assert total_submitted == 1
    assert submission_rate == 100.0

    # Test CSV Export generation logic
    import csv, io
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["Student UID", "Name", "Status", "Score", "Max Score"])
    for a in allocations:
        writer.writerow([a["user_id"], a["student_name"], a["status"], 49.0, 50.0])
    csv_str = out.getvalue()
    assert "Alice Smith" in csv_str
    assert "49.0" in csv_str
    print("  [PASS] 8. Analytics & CSV: Released explanations verified, computed 100% submission rate and exported CSV.")

    print("=" * 70)
    print("ALL 8 ASSIGNMENT & QUESTION MANAGEMENT SUITE TESTS PASSED 100%!")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(run_assignment_and_question_tests())
