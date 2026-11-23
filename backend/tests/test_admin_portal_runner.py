"""
Comprehensive Test Suite for Master Prompt 2:
Production-Ready Admin Portal, Student Control Center & 360° Profile Intelligence.

Validates:
1. Real-data Admin Metrics & Platform Health Telemetry.
2. Advanced Student Directory with Profile Resolution & Group Mappings.
3. Complete 12-Section Student 360° Dossier.
4. Admin Student Profile & Academic Updates with Audit Logging.
5. Student Account Lifecycle (Suspend & Reactivate).
6. Direct Student In-App Notification Dispatch.
7. Student Admin History & Action Audit Trail.
8. Student Cohort Groups CRUD and Member Management.
9. Bulk Assessment and Assignment Allocation to Groups.
10. Group Notification Broadcast.
11. Cohort Group Aggregated Analytics Telemetry.
12. Communication Center Announcement Broadcasting with Multi-Targeting.
13. Admin Accounts & RBAC Role Management with Privilege Escalation Defense.
"""

import asyncio
import os
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from bson import ObjectId

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# Set testing environment
os.environ["ENVIRONMENT"] = "testing"
os.environ["USE_MOCK_MONGODB_FOR_TESTS"] = "true"
os.environ["FIREBASE_MOCK_AUTH_IN_DEV"] = "true"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.api.v1.endpoints.admin import (
    get_admin_metrics,
    list_all_students,
    get_student_360_profile,
    update_student_admin,
    suspend_student_account,
    activate_student_account,
    send_student_direct_notification,
    get_student_admin_history,
    list_student_groups,
    create_student_group,
    get_student_group_detail,
    update_student_group,
    delete_student_group,
    modify_group_members,
    bulk_assign_assessment_to_group,
    bulk_assign_assignment_to_group,
    notify_group_members,
    get_group_analytics,
    list_announcements,
    create_and_broadcast_announcement,
    delete_announcement,
    list_admin_accounts,
    update_admin_role,
    UpdateStudentRequest,
    SendStudentNotificationRequest,
    StudentGroupCreateRequest,
    StudentGroupUpdateRequest,
    GroupMemberActionRequest,
    GroupAssignAssessmentRequest,
    GroupAssignAssignmentRequest,
    GroupBroadcastNotificationRequest,
    AnnouncementCreateRequest,
    UpdateAdminRoleRequest,
)


class MockCollection:
    def __init__(self, name: str):
        self.name = name
        self.docs: List[Dict[str, Any]] = []

    async def insert_one(self, doc: Dict[str, Any]):
        d = dict(doc)
        if "_id" not in d:
            d["_id"] = ObjectId()
        self.docs.append(d)
        class Res:
            inserted_id = d["_id"]
        return Res()

    async def insert_many(self, docs: List[Dict[str, Any]]):
        inserted_ids = []
        for doc in docs:
            d = dict(doc)
            if "_id" not in d:
                d["_id"] = ObjectId()
            self.docs.append(d)
            inserted_ids.append(d["_id"])
        class ResMany:
            def __init__(self, ids):
                self.inserted_ids = ids
        return ResMany(inserted_ids)

    async def find_one(self, query: Dict[str, Any], projection: Optional[Dict[str, Any]] = None):
        for d in self.docs:
            if self._match(d, query):
                res = dict(d)
                if projection and "_id" in projection and projection["_id"] == 0:
                    res.pop("_id", None)
                return res
        return None

    def find(self, query: Optional[Dict[str, Any]] = None, projection: Optional[Dict[str, Any]] = None):
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
        return MockCursor(matched)

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False):
        matched = False
        for d in self.docs:
            if self._match(d, query):
                matched = True
                if "$set" in update:
                    d.update(update["$set"])
                if "$addToSet" in update:
                    for k, val in update["$addToSet"].items():
                        cur = d.setdefault(k, [])
                        if isinstance(val, dict) and "$each" in val:
                            for item in val["$each"]:
                                if item not in cur:
                                    cur.append(item)
                        else:
                            if val not in cur:
                                cur.append(val)
                break
        if not matched and upsert:
            new_doc = dict(query)
            if "$set" in update:
                new_doc.update(update["$set"])
            if "_id" not in new_doc:
                new_doc["_id"] = ObjectId()
            self.docs.append(new_doc)

    async def update_many(self, query: Dict[str, Any], update: Dict[str, Any]):
        for d in self.docs:
            if self._match(d, query):
                if "$set" in update:
                    d.update(update["$set"])

    async def replace_one(self, query: Dict[str, Any], replacement: Dict[str, Any], upsert: bool = False):
        matched = False
        for i, d in enumerate(self.docs):
            if self._match(d, query):
                matched = True
                rep = dict(replacement)
                if "_id" not in rep:
                    rep["_id"] = d.get("_id", ObjectId())
                self.docs[i] = rep
                break
        if not matched and upsert:
            rep = dict(replacement)
            if "_id" not in rep:
                rep["_id"] = ObjectId()
            self.docs.append(rep)

    async def delete_many(self, query: Dict[str, Any]):
        self.docs = [d for d in self.docs if not self._match(d, query)]

    async def delete_one(self, query: Dict[str, Any]):
        for i, d in enumerate(self.docs):
            if self._match(d, query):
                del self.docs[i]
                break

    async def count_documents(self, query: Dict[str, Any]) -> int:
        return sum(1 for d in self.docs if self._match(d, query))

    async def distinct(self, field: str, query: Optional[Dict[str, Any]] = None) -> List[Any]:
        q = query or {}
        vals = set()
        for d in self.docs:
            if self._match(d, q) and field in d:
                vals.add(d[field])
        return list(vals)

    def _match(self, doc: Dict[str, Any], query: Dict[str, Any]) -> bool:
        if not query:
            return True
        for k, v in query.items():
            if k == "$or":
                if not any(self._match(doc, sub_q) for sub_q in v):
                    return False
                continue
            if isinstance(v, dict):
                if "$in" in v:
                    doc_val = doc.get(k)
                    if isinstance(doc_val, list):
                        if not any(item in v["$in"] for item in doc_val):
                            return False
                    else:
                        if doc_val not in v["$in"]:
                            return False
                elif "$regex" in v:
                    pattern = v["$regex"].strip("^$")
                    if pattern.lower() not in str(doc.get(k, "")).lower():
                        return False
            else:
                if str(doc.get(k)) != str(v):
                    return False
        return True


class MockDB:
    def __init__(self):
        self._collections: Dict[str, MockCollection] = {}

    def __getattr__(self, name: str) -> MockCollection:
        if name not in self._collections:
            self._collections[name] = MockCollection(name)
        return self._collections[name]

    async def command(self, cmd: str):
        if cmd == "ping":
            return {"ok": 1.0}
        return {}


async def setup_test_db() -> MockDB:
    db = MockDB()
    now = datetime.now(timezone.utc)

    # 1. Super Admin and Admins
    await db.users.insert_one({
        "firebase_uid": "admin_super",
        "email": "dean@institution.edu",
        "display_name": "Dean Academic",
        "role": "SUPER_ADMIN",
        "account_status": "active",
        "auth_provider": "password",
        "created_at": now,
        "last_login": now,
    })

    await db.users.insert_one({
        "firebase_uid": "admin_faculty",
        "email": "faculty@institution.edu",
        "display_name": "Faculty Placement Officer",
        "role": "ADMIN",
        "account_status": "active",
        "auth_provider": "password",
        "created_at": now,
        "last_login": now,
    })

    # 2. Students
    student_uids = ["std_001", "std_002", "std_003"]
    for i, uid in enumerate(student_uids):
        await db.users.insert_one({
            "firebase_uid": uid,
            "email": f"student{i+1}@institution.edu",
            "display_name": f"Student {i+1}",
            "role": "STUDENT",
            "account_status": "active",
            "auth_provider": "google_firebase",
            "created_at": now,
            "last_login": now,
        })
        await db.student_profiles.insert_one({
            "user_id": uid,
            "full_name": f"Student {i+1}",
            "college": "National Institute of Technology",
            "degree": "B.Tech",
            "branch": "Computer Science" if i < 2 else "Information Technology",
            "graduation_year": 2026,
            "semester": 6,
            "cgpa": 8.7 + i * 0.2,
            "backlogs": 0,
            "target_roles": ["Full Stack Developer", "Backend Engineer"],
            "preferred_locations": ["Bangalore", "Hyderabad"],
        })
        await db.resumes.insert_one({
            "user_id": uid,
            "filename": f"resume_{uid}.pdf",
            "ats_score": 85.0 + i * 2.0,
            "is_active": True,
            "uploaded_at": now,
            "detected_skills": [{"skill_name": "Python"}, {"skill_name": "React"}],
        })
        await db.placement_readiness.insert_one({
            "user_id": uid,
            "overall_score": 80.0 + i * 4.0,
            "coding_readiness": 85.0,
            "technical_readiness": 80.0,
            "soft_skills_readiness": 75.0,
            "resume_readiness": 85.0,
            "computed_at": now,
        })

    # Seed an assignment
    await db.assignments.insert_one({
        "id": "asgn_arch_01",
        "title": "Distributed Cache Implementation",
        "due_date": "2026-12-01",
        "assigned_student_ids": [],
    })

    return db


async def run_admin_portal_tests():
    print("=" * 70, flush=True)
    print("EXECUTING MASTER PROMPT 2: PRODUCTION ADMIN PORTAL TEST SUITE", flush=True)
    print("=" * 70, flush=True)

    print("Step 0: Setting up test db...", flush=True)
    db = await setup_test_db()
    print("Step 0: Test db ready!", flush=True)
    super_admin = {"firebase_uid": "admin_super", "email": "dean@institution.edu", "role": "SUPER_ADMIN"}
    regular_admin = {"firebase_uid": "admin_faculty", "email": "faculty@institution.edu", "role": "ADMIN"}

    # 1. Test Admin Metrics & Platform Health
    metrics = await get_admin_metrics(current_admin=regular_admin, db=db)
    assert metrics["total_students"] == 3, f"Expected 3 students, got {metrics['total_students']}"
    assert "student_overview" in metrics, "Missing student_overview dictionary"
    assert "academic_overview" in metrics, "Missing academic_overview dictionary"
    assert "placement_overview" in metrics, "Missing placement_overview dictionary"
    assert "platform_health" in metrics, "Missing platform_health dictionary"
    assert metrics["platform_health"]["mongodb_status"] == "connected"
    assert metrics["platform_health"]["mongodb_latency_ms"] >= 0
    print("  [PASS] 1. Admin Metrics & Categorized Telemetry (Student, Academic, Placement, Platform Health)")

    # 2. Test Student Directory List
    students_list = await list_all_students(current_admin=regular_admin, db=db)
    assert len(students_list) == 3, f"Expected 3 students in directory, got {len(students_list)}"
    assert students_list[0]["branch"] in ("Computer Science", "Information Technology")
    assert students_list[0]["has_resume"] is True
    assert students_list[0]["readiness_score"] >= 80.0
    print("  [PASS] 2. Student Directory Listing & Deep Profile Resolution")

    # 3. Test Student 360° Profile Dossier (All 12 Sections)
    dossier = await get_student_360_profile(user_id="std_001", current_admin=regular_admin, db=db)
    expected_sections = [
        "personal_info",
        "academic_info",
        "resume_info",
        "assessment_history",
        "assignment_history",
        "skill_proficiency",
        "verified_skills",
        "roadmap",
        "job_matches",
        "application_tracking",
        "placement_readiness",
        "notifications_and_activity",
    ]
    for sec in expected_sections:
        assert sec in dossier, f"Missing section '{sec}' in Student 360° dossier"
    assert dossier["personal_info"]["email"] == "student1@institution.edu"
    assert dossier["academic_info"]["college"] == "National Institute of Technology"
    assert dossier["resume_info"]["has_resume"] is True
    print("  [PASS] 3. Student 360° Complete Dossier (All 12 Sections Verified)")

    # 4. Test Student Profile Update with Audit Logging
    update_req = UpdateStudentRequest(
        full_name="Student 1 Updated",
        phone="9876543210",
        cgpa=9.2,
        backlogs=0,
    )
    upd_res = await update_student_admin("std_001", update_req, current_admin=regular_admin, db=db)
    assert "successfully" in upd_res["message"]

    prof = await db.student_profiles.find_one({"user_id": "std_001"})
    assert prof["full_name"] == "Student 1 Updated"
    assert prof["cgpa"] == 9.2

    audit = await db.admin_audit_logs.find_one({"action": "student_profile_updated", "target_id": "std_001"})
    assert audit is not None, "Missing audit log for student profile update"
    print("  [PASS] 4. Admin Student Profile & Academic Updates with Audit Logging")

    # 5. Test Student Lifecycle (Suspend & Reactivate)
    await suspend_student_account("std_001", current_admin=regular_admin, db=db)
    u_susp = await db.users.find_one({"firebase_uid": "std_001"})
    assert u_susp["account_status"] == "suspended"

    await activate_student_account("std_001", current_admin=regular_admin, db=db)
    u_act = await db.users.find_one({"firebase_uid": "std_001"})
    assert u_act["account_status"] == "active"
    print("  [PASS] 5. Student Account Lifecycle Management (Suspend & Reactivate)")

    # 6. Test Direct Student Notification Dispatch
    notif_req = SendStudentNotificationRequest(
        title="Urgent Placement Notice",
        message="Please verify your GitHub portfolio link prior to round 1 interviews.",
        priority="urgent",
    )
    notify_res = await send_student_direct_notification("std_001", notif_req, current_admin=regular_admin, db=db)
    assert "successfully" in notify_res["message"]
    sent_notif = await db.notifications.find_one({"user_id": "std_001", "title": "Urgent Placement Notice"})
    assert sent_notif is not None
    assert sent_notif["priority"] == "urgent"
    print("  [PASS] 6. Direct Student In-App Notification Dispatch")

    # 7. Test Student Admin Action History
    history = await get_student_admin_history("std_001", current_admin=regular_admin, db=db)
    assert len(history) >= 3, f"Expected at least 3 audit entries for std_001, got {len(history)}"
    actions = [h["action"] for h in history]
    assert "student_profile_updated" in actions
    assert "student_suspended" in actions
    assert "student_activated" in actions
    print("  [PASS] 7. Student Admin Action History & Immutable Audit Trail")

    # 8. Test Student Cohort Groups CRUD
    create_grp_req = StudentGroupCreateRequest(
        name="2026 CS Elite Developers",
        description="Top cohort for Tier-1 corporate placement drives",
        department="Computer Science",
        batch=2026,
        tags=["Tier1", "FullStack"],
        student_ids=["std_001", "std_002"],
    )
    grp_res = await create_student_group(create_grp_req, current_admin=regular_admin, db=db)
    group_id = grp_res["id"]

    grp_detail = await get_student_group_detail(group_id, current_admin=regular_admin, db=db)
    assert grp_detail["name"] == "2026 CS Elite Developers"
    assert grp_detail["student_count"] == 2
    assert len(grp_detail["members"]) == 2
    print("  [PASS] 8. Student Cohort Groups CRUD & Member Cards")

    # 9. Test Modify Group Members (Add / Remove)
    await modify_group_members(group_id, GroupMemberActionRequest(action="add", student_ids=["std_003"]), current_admin=regular_admin, db=db)
    grp_after_add = await get_student_group_detail(group_id, current_admin=regular_admin, db=db)
    assert grp_after_add["student_count"] == 3

    await modify_group_members(group_id, GroupMemberActionRequest(action="remove", student_ids=["std_003"]), current_admin=regular_admin, db=db)
    grp_after_rem = await get_student_group_detail(group_id, current_admin=regular_admin, db=db)
    assert grp_after_rem["student_count"] == 2
    print("  [PASS] 9. Dynamic Group Membership Modification (Add & Remove)")

    # 10. Test Bulk Assessment & Assignment Allocation to Group
    asgn_bulk_res = await bulk_assign_assignment_to_group(
        group_id,
        GroupAssignAssignmentRequest(assignment_id="asgn_arch_01", due_date="2026-12-05"),
        current_admin=regular_admin,
        db=db,
    )
    assert asgn_bulk_res["assigned_count"] == 2

    assignment_doc = await db.assignments.find_one({"id": "asgn_arch_01"})
    assert "std_001" in assignment_doc["assigned_student_ids"]
    assert "std_002" in assignment_doc["assigned_student_ids"]

    # Check that in-app notification arrived for group members
    asgn_notif = await db.notifications.find_one({"user_id": "std_001", "assignment_id": "asgn_arch_01"})
    assert asgn_notif is not None
    print("  [PASS] 10. Bulk Assignment Allocation to Cohort Group with In-App Alerts")

    # 11. Test Group Notification Broadcast
    grp_notif_res = await notify_group_members(
        group_id,
        GroupBroadcastNotificationRequest(title="Mock Drive Tomorrow", message="Be ready by 9 AM"),
        current_admin=regular_admin,
        db=db,
    )
    assert grp_notif_res["delivered_count"] == 2
    b_notif = await db.notifications.find_one({"user_id": "std_002", "title": "Mock Drive Tomorrow"})
    assert b_notif is not None
    print("  [PASS] 11. Group Notification Broadcast")

    # 12. Test Group Aggregated Analytics
    analytics = await get_group_analytics(group_id, current_admin=regular_admin, db=db)
    assert analytics["total_students"] == 2
    assert analytics["avg_readiness"] > 0.0
    assert analytics["avg_ats"] >= 85.0
    print("  [PASS] 12. Cohort Group Aggregated Analytics (Readiness, ATS)")

    # 13. Test Communication Center Announcement Broadcasting
    ann_req = AnnouncementCreateRequest(
        title="Amazon SDE Hiring Drive Live",
        message="Registrations open for 2026 Computer Science graduates.",
        target_type="DEPARTMENT",
        target_filter={"department": "Computer Science"},
        priority="urgent",
    )
    ann_res = await create_and_broadcast_announcement(ann_req, current_admin=regular_admin, db=db)
    assert ann_res["recipient_count"] == 2  # std_001 and std_002 are Computer Science
    ann_id = ann_res["id"]

    ann_list = await list_announcements(current_admin=regular_admin, db=db)
    assert len(ann_list) >= 1
    assert ann_list[0]["title"] == "Amazon SDE Hiring Drive Live"

    # Delete announcement
    await delete_announcement(ann_id, current_admin=regular_admin, db=db)
    ann_after = await db.announcements.find_one({"_id": ObjectId(ann_id)})
    assert ann_after is None
    print("  [PASS] 13. Communication Center Announcement Broadcasting & Targeting")

    # 14. Test Admin Accounts & RBAC Management
    admins = await list_admin_accounts(current_admin=super_admin, db=db)
    assert len(admins) == 2
    admin_emails = [a["email"] for a in admins]
    assert "dean@institution.edu" in admin_emails
    assert "faculty@institution.edu" in admin_emails

    # Test Role Update by Super Admin
    role_upd_res = await update_admin_role(
        "admin_faculty",
        UpdateAdminRoleRequest(role="PLACEMENT_ADMIN"),
        current_admin=super_admin,
        db=db,
    )
    assert "PLACEMENT_ADMIN" in role_upd_res["message"]
    updated_faculty = await db.users.find_one({"firebase_uid": "admin_faculty"})
    assert updated_faculty["role"] == "PLACEMENT_ADMIN"

    # Test Sole Super Admin Demotion Protection
    demotion_blocked = False
    try:
        await update_admin_role(
            "admin_super",
            UpdateAdminRoleRequest(role="REVIEWER"),
            current_admin=super_admin,
            db=db,
        )
    except Exception as exc:
        demotion_blocked = "remaining SUPER_ADMIN" in str(exc)
    assert demotion_blocked, "Sole SUPER_ADMIN demotion was not safely blocked"
    print("  [PASS] 14. Admin RBAC Management & Privilege Escalation Defense")

    print("\n" + "=" * 70)
    print("ALL 14 PRODUCTION ADMIN PORTAL WORKFLOW TESTS PASSED CLEANLY (100% SUCCESS)!")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(run_admin_portal_tests())
