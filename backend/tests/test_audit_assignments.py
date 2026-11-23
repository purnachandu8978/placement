import asyncio
import os
import sys

# Ensure backend root on path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.mongodb import get_database
from app.api.v1.endpoints.assignments import (
    create_assignment,
    CreateAssignmentRequest,
    AssignmentQuestionInput,
    AllocationFilterPayload,
)

async def run_checks():
    db = await get_database()
    admin_user = {
        "firebase_uid": "admin_audit_user",
        "email": "admin@placement.edu",
        "role": "SUPER_ADMIN"
    }

    # Case 1: Simple assignment creation with empty questions
    print("--- Test 1: Empty questions, target_type=all ---")
    payload1 = {
        "title": "Audit Test Assignment 1",
        "description": "Comprehensive full stack test assignment",
        "instructions": "Submit GitHub repo link",
        "category": "Technical",
        "skill": "Full Stack",
        "difficulty": "Intermediate",
        "total_marks": 100,
        "deadline": "2026-12-01T23:59:59Z",
        "duration_minutes": 120,
        "late_submission_policy": "allow_penalty",
        "late_penalty_percent": 10.0,
        "deliverables": ["GitHub URL", "Architecture Notes"],
        "status": "published",
        "questions": [],
        "allocation": {
            "target_type": "all",
            "departments": ["Computer Science", "Information Technology"],
            "batches": [2025, 2026],
            "skills": ["Python", "React"],
            "student_uids": []
        }
    }
    try:
        req1 = CreateAssignmentRequest(**payload1)
        res1 = await create_assignment(req1, admin_user, db)
        print("Test 1 Result:", res1.get("id"), "Allocated:", res1.get("allocated_students_count"))
    except Exception as e:
        print("Test 1 FAILED:", repr(e))

    # Case 2: MCQ question with options as objects (how GET /questions returns them)
    print("\n--- Test 2: MCQ with options as list of dicts (from question bank) ---")
    payload2 = {
        "title": "Audit Test Assignment 2 - MCQ",
        "description": "MCQ testing options",
        "category": "Technical",
        "skill": "Python",
        "difficulty": "Beginner",
        "total_marks": 20,
        "status": "draft",
        "questions": [
            {
                "question_id": "q-mcq-1",
                "title": "Python Data Types",
                "question_text": "Which of the following is mutable?",
                "type": "mcq",
                "points": 10,
                "difficulty": "easy",
                "options": [
                    {"id": "opt-0", "option_text": "tuple", "order_index": 0},
                    {"id": "opt-1", "option_text": "list", "order_index": 1},
                    {"id": "opt-2", "option_text": "string", "order_index": 2},
                    {"id": "opt-3", "option_text": "int", "order_index": 3}
                ],
                "correct_answer": 1,
                "constraints": ["Answer must be selected"],
                "tags": ["python", "basics"]
            }
        ]
    }
    try:
        req2 = CreateAssignmentRequest(**payload2)
        res2 = await create_assignment(req2, admin_user, db)
        print("Test 2 Result:", res2.get("id"), "Total marks:", res2.get("total_marks"))
    except Exception as e:
        print("Test 2 FAILED:", repr(e))

    # Case 3: Coding question with test cases and string constraints
    print("\n--- Test 3: Coding Question with constraints and test_cases ---")
    payload3 = {
        "title": "Audit Test Assignment 3 - Coding",
        "description": "Coding question test",
        "category": "Coding",
        "skill": "Algorithms",
        "difficulty": "Hard",
        "total_marks": 50,
        "status": "published",
        "questions": [
            {
                "question_id": "q-code-1",
                "title": "Largest Element",
                "question_text": "Find largest element in array",
                "type": "simple_coding",
                "points": 50,
                "difficulty": "medium",
                "constraints": "1 <= N <= 10^5",
                "test_cases": [
                    {"label": "Sample 1", "input": "3\n1 5 2\n", "expected": "5\n", "is_hidden": False}
                ],
                "tags": "arrays, sorting"
            }
        ],
        "allocation": {
            "target_type": "batch",
            "batches": ["2025", 2026],
            "departments": [],
            "skills": []
        }
    }
    try:
        req3 = CreateAssignmentRequest(**payload3)
        res3 = await create_assignment(req3, admin_user, db)
        print("Test 3 Result:", res3.get("id"), "Allocated:", res3.get("allocated_students_count"))
    except Exception as e:
        print("Test 3 FAILED:", repr(e))

if __name__ == "__main__":
    asyncio.run(run_checks())
