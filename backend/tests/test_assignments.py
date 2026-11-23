"""
Test suite for Assignment & Practical Submission endpoints.
Verifies student submission flow, data persistence, RBAC enforcement, and faculty grading in MongoDB.
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_01_student_can_list_assignments(client: AsyncClient):
    """Test 1: Student can list available assignment templates with zero/open submission status."""
    student_headers = {"Authorization": "Bearer mock_token_student_asg_01"}
    res = await client.get("/api/v1/assignments", headers=student_headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    sample = data[0]
    assert "id" in sample
    assert "title" in sample
    assert "skill" in sample
    assert "deliverables" in sample
    assert isinstance(sample["deliverables"], list)
    assert sample["status"] in ("open", "pending", "submitted", "evaluated")


@pytest.mark.asyncio
async def test_02_student_submit_persists_full_deliverable_data(client: AsyncClient):
    """Test 2: Student can submit assignment with repo, live URL, code snippet, and notes."""
    student_token = "mock_token_student_asg_02"
    student_headers = {"Authorization": f"Bearer {student_token}"}

    # First get an assignment ID
    list_res = await client.get("/api/v1/assignments", headers=student_headers)
    assert list_res.status_code == 200
    assignments = list_res.json()
    assert len(assignments) > 0
    target_asg = assignments[0]
    asg_id = target_asg["id"]

    # Submit solution
    sub_payload = {
        "github_url": "https://github.com/student02/distributed-kv-store",
        "live_url": "https://kv-store.fly.dev",
        "code_snippet": "class LRUCache:\n    def __init__(self, capacity):\n        self.cap = capacity",
        "notes": "Implemented consistent hashing with virtual nodes and thread-safe lock striping.",
    }

    sub_res = await client.post(
        f"/api/v1/assignments/{asg_id}/submit",
        json=sub_payload,
        headers=student_headers,
    )
    assert sub_res.status_code == 200, sub_res.text
    sub_data = sub_res.json()
    assert sub_data["message"] == "Assignment submitted successfully"
    assert sub_data["score"] >= 70
    assert "auto_score" in sub_data

    # Re-fetch assignments as this student: status should now be 'submitted'
    refetch = await client.get("/api/v1/assignments", headers=student_headers)
    assert refetch.status_code == 200
    updated_list = refetch.json()
    updated_asg = next((a for a in updated_list if a["id"] == asg_id), None)
    assert updated_asg is not None
    assert updated_asg["status"] == "submitted"
    assert updated_asg["submission"] is not None
    assert updated_asg["submission"]["github_url"] == "https://github.com/student02/distributed-kv-store"
    assert updated_asg["submission"]["live_url"] == "https://kv-store.fly.dev"
    assert "LRUCache" in updated_asg["submission"]["code_snippet"]
    assert "consistent hashing" in updated_asg["submission"]["notes"]


@pytest.mark.asyncio
async def test_03_submit_validation_rejects_invalid_url(client: AsyncClient):
    """Test 3: Submitting an invalid or empty repository URL returns 400 Bad Request."""
    student_headers = {"Authorization": "Bearer mock_token_student_asg_03"}
    list_res = await client.get("/api/v1/assignments", headers=student_headers)
    asg_id = list_res.json()[0]["id"]

    res = await client.post(
        f"/api/v1/assignments/{asg_id}/submit",
        json={"github_url": "not-a-valid-url"},
        headers=student_headers,
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_04_student_cannot_access_admin_assignment_routes(client: AsyncClient):
    """Test 4: RBAC blocks student role from admin submissions and grading routes."""
    student_headers = {"Authorization": "Bearer mock_token_student_asg_04"}

    # Attempt to access admin submissions queue
    res_queue = await client.get("/api/v1/assignments/admin/submissions", headers=student_headers)
    assert res_queue.status_code in (401, 403)

    # Attempt to create assignment
    res_create = await client.post(
        "/api/v1/assignments",
        json={"title": "Hacked", "skill": "Security"},
        headers=student_headers,
    )
    assert res_create.status_code in (401, 403)


@pytest.mark.asyncio
async def test_05_admin_can_review_and_grade_student_submission(
    client: AsyncClient,
    test_admin_token,
):
    """Test 5: Admin inspects submissions in review queue and records official faculty grade & feedback."""
    admin_token, _ = test_admin_token
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    student_token = "mock_token_student_for_admin_grade"
    student_headers = {"Authorization": f"Bearer {student_token}"}

    # Student submits an assignment
    list_res = await client.get("/api/v1/assignments", headers=student_headers)
    asg_id = list_res.json()[0]["id"]

    await client.post(
        f"/api/v1/assignments/{asg_id}/submit",
        json={
            "github_url": "https://github.com/grade-target/repo",
            "live_url": "https://grade-target.dev",
            "code_snippet": "def test_eval(): pass",
            "notes": "Ready for faculty grading.",
        },
        headers=student_headers,
    )

    # Admin lists submissions
    admin_queue_res = await client.get("/api/v1/assignments/admin/submissions", headers=admin_headers)
    assert admin_queue_res.status_code == 200, admin_queue_res.text
    submissions = admin_queue_res.json()
    assert isinstance(submissions, list)
    target_sub = next((s for s in submissions if s["github_url"] == "https://github.com/grade-target/repo"), None)
    assert target_sub is not None
    assert target_sub["github_url"] == "https://github.com/grade-target/repo"

    # Admin grades the submission
    grade_payload = {
        "score": 96.5,
        "feedback": "Outstanding test isolation and ESR-compliant compound indexes.",
    }
    grade_res = await client.post(
        f"/api/v1/assignments/admin/submissions/{target_sub['id']}/grade",
        json=grade_payload,
        headers=admin_headers,
    )
    assert grade_res.status_code == 200, grade_res.text
    grade_data = grade_res.json()
    assert grade_data["grade"] == 96.5
    assert grade_data["status"] == "evaluated"
    assert "reviewed_by" in grade_data

    # Verify student now sees official evaluation
    student_check = await client.get("/api/v1/assignments", headers=student_headers)
    student_asgs = student_check.json()
    evaluated_asg = next((a for a in student_asgs if a["id"] == asg_id), None)
    assert evaluated_asg is not None
    assert evaluated_asg["status"] == "evaluated"
    assert evaluated_asg["submission"]["score"] == 96.5
    assert evaluated_asg["submission"]["feedback"] == "Outstanding test isolation and ESR-compliant compound indexes."
    assert evaluated_asg["submission"]["reviewed_by"] is not None


@pytest.mark.asyncio
async def test_06_admin_assignment_crud_lifecycle(
    client: AsyncClient,
    test_admin_token,
):
    """Test 6: Admin creates, updates, and deletes an assignment template."""
    admin_token, _ = test_admin_token
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Create template
    create_payload = {
        "title": "Build a Resilient Event-Driven Microservice with Kafka",
        "skill": "Kafka",
        "difficulty": "Advanced",
        "description": "Implement dead-letter queues, idempotent consumer offsets, and schema registry validation.",
        "deliverables": ["GitHub Repository URL", "Dead-Letter Queue Benchmark", "Docker Compose"],
        "estimated_hours": 6,
        "due_in_days": 14,
        "week_number": 3,
        "max_score": 100,
    }

    create_res = await client.post("/api/v1/assignments", json=create_payload, headers=admin_headers)
    assert create_res.status_code == 201, create_res.text
    created = create_res.json()
    new_id = created["id"]
    assert created["title"] == create_payload["title"]

    # Update template
    update_res = await client.put(
        f"/api/v1/assignments/{new_id}",
        json={"difficulty": "Intermediate", "estimated_hours": 8},
        headers=admin_headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["difficulty"] == "Intermediate"
    assert update_res.json()["estimated_hours"] == 8

    # Delete template
    delete_res = await client.delete(f"/api/v1/assignments/{new_id}", headers=admin_headers)
    assert delete_res.status_code == 200
    assert delete_res.json()["message"] == "Assignment deleted successfully"
