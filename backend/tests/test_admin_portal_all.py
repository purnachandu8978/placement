import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.mongodb import get_database
from app.services.certificate_template_service import list_templates, get_active_published_template
from app.api.v1.endpoints.admin import (
    get_admin_metrics,
    list_all_students,
    list_student_groups,
    list_announcements,
    get_api_quotas,
    get_login_audit,
    list_admin_accounts,
    get_integrations_config,
    list_all_uploaded_resumes,
    get_resume_storage_stats,
    list_verification_requests,
    list_coding_submissions_admin,
)
from app.api.v1.endpoints.questions import list_questions
from app.api.v1.endpoints.assignments import (
    get_admin_dashboard_stats,
    list_admin_assignments,
    get_admin_submissions,
    preview_target_students,
    create_assignment,
    CreateAssignmentRequest,
    AllocationPreviewRequest,
)
from app.api.v1.endpoints.admin_jobs import list_job_sources, get_job_ingestion_stats, get_worker_health
from app.api.v1.endpoints.jobs import list_jobs
from app.api.v1.endpoints.startups import list_startups
from app.api.v1.endpoints.assessments import list_assessments

async def test_all_admin_endpoints():
    db = await get_database()
    admin_user = {
        "firebase_uid": "admin_audit_super",
        "email": "admin@placement.edu",
        "role": "SUPER_ADMIN"
    }

    tests = []

    async def run_test(name, coro):
        try:
            res = await coro
            print(f"PASS: {name} -> Count/Type: {len(res) if isinstance(res, (list, dict)) else type(res)}")
            tests.append((name, True, None))
        except Exception as e:
            print(f"FAIL: {name} -> Error: {repr(e)}")
            tests.append((name, False, repr(e)))

    print("=== STARTING COMPREHENSIVE ADMIN PORTAL AUDIT ===")

    await run_test("Admin Metrics", get_admin_metrics(admin_user, db))
    await run_test("Student Directory", list_all_students(current_admin=admin_user, db=db))
    await run_test("Student Groups", list_student_groups(current_admin=admin_user, db=db))
    await run_test("Announcements", list_announcements(current_admin=admin_user, db=db))
    await run_test("Quota Telemetry", get_api_quotas(current_admin=admin_user, db=db))
    await run_test("Resume Storage Stats", get_resume_storage_stats(current_admin=admin_user, db=db))
    await run_test("All Resumes Admin", list_all_uploaded_resumes(current_admin=admin_user, db=db))
    await run_test("Verification Queue", list_verification_requests(status_filter="all", current_admin=admin_user, db=db))
    await run_test("Login Audit Logs", get_login_audit(current_admin=admin_user, db=db))
    await run_test("Admin Accounts", list_admin_accounts(current_admin=admin_user, db=db))
    await run_test("Platform Settings", get_integrations_config(current_admin=admin_user))
    await run_test("Certificate Templates List", list_templates(db=db))
    await run_test("Active Certificate Template", get_active_published_template(db=db))
    await run_test("Question Bank Questions", list_questions(type=None, skill=None, approval_status=None, current_user=admin_user, db=db))
    await run_test("Coding Submissions", list_coding_submissions_admin(status=None, language=None, question_id=None, limit=20, current_admin=admin_user, db=db))
    await run_test("Assignment Dashboard Stats", get_admin_dashboard_stats(current_admin=admin_user, db=db))
    await run_test("Assignment List", list_admin_assignments(q=None, status_filter=None, category_filter=None, page=1, limit=20, current_admin=admin_user, db=db))
    await run_test("Assignment Submissions", get_admin_submissions(current_admin=admin_user, db=db))
    await run_test("Allocation Preview", preview_target_students(AllocationPreviewRequest(target_type="all"), current_admin=admin_user, db=db))
    await run_test("Admin Job Sources", list_job_sources(admin=admin_user, db=db))
    await run_test("Admin Job Ingestion Stats", get_job_ingestion_stats(admin=admin_user, db=db))
    await run_test("Admin Job Listings", list_jobs(location=None, work_mode=None, search=None, employment_type=None, min_match_score=None, is_saved_only=None, has_applied_only=None, current_user=admin_user, db=db))
    await run_test("Startups List", list_startups(state=None, city=None, sector=None, classification=None, search=None, limit=20, skip=0, current_user=admin_user, db=db))
    await run_test("Assessments List", list_assessments(skill=None, current_user=admin_user, db=db))

    # Test Assignment Creation with real question
    q_bank = await list_questions(type=None, skill=None, approval_status=None, current_user=admin_user, db=db)
    selected = q_bank[:2] if q_bank else []
    print(f"\nTesting Assignment Creation with {len(selected)} question(s) from Question Bank...")
    create_payload = {
        "title": "Comprehensive E2E Assignment",
        "description": "Full-stack integration test assignment",
        "category": "Technical",
        "skill": "Software Engineering",
        "difficulty": "Intermediate",
        "total_marks": 100,
        "due_in_days": 14,
        "status": "published",
        "questions": selected,
        "allocation": {
            "target_type": "all",
            "departments": [],
            "batches": [],
            "skills": []
        }
    }
    await run_test("Create Assignment with Real Questions", create_assignment(CreateAssignmentRequest(**create_payload), admin_user, db))

    print("\n=== AUDIT SUMMARY ===")
    passed = sum(1 for _, ok, _ in tests if ok)
    failed = sum(1 for _, ok, _ in tests if not ok)
    print(f"Total: {len(tests)}, Passed: {passed}, Failed: {failed}")
    if failed > 0:
        print("Failed tests:")
        for name, ok, err in tests:
            if not ok:
                print(f" - {name}: {err}")
    assert failed == 0, f"{failed} test(s) failed!"

if __name__ == "__main__":
    asyncio.run(test_all_admin_endpoints())
