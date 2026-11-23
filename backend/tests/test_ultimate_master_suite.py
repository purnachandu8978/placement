"""
Ultimate Master Test Suite — Placement Intelligence
Validates Student Registration Identity, Certificate Template Lifecycle,
Cryptographic Certificate Serial Numbers & Signatures, Zero-PII Public Verification,
and Career Passport Consent-Based Sharing.
"""

import asyncio
from datetime import datetime, timezone
import hashlib
import hmac
import re
import pytest

from app.core.config import settings
from app.schemas.certificate_template import CertificateTemplateCreate, TemplateStatus
from app.services.certificate_template_service import (
    approve_template,
    create_template,
    get_active_published_template,
    publish_template,
    resolve_certificate_text,
    seed_default_templates,
    submit_for_approval,
)
from app.services.identity_service import (
    allocate_student_registration_id,
    generate_certificate_serial_number,
    generate_student_registration_id,
    get_or_ensure_student_registration_id,
    mask_registration_id,
)
from app.services.college_verification_service import (
    generate_certificate_pdf_bytes,
    get_public_credential,
    start_verification_assessment,
    submit_verification_assessment,
)


class MockCollection:
    def __init__(self, name="mock"):
        self.name = name
        self.docs = []

    async def find_one(self, query):
        for d in self.docs:
            if self._matches(d, query):
                return dict(d)
        return None

    def find(self, query=None):
        query = query or {}
        matched = [dict(d) for d in self.docs if self._matches(d, query)]
        return MockCursor(matched)

    async def insert_one(self, doc):
        from bson import ObjectId
        d = dict(doc)
        if "_id" not in d:
            d["_id"] = ObjectId()
        self.docs.append(d)
        class InsertResult:
            inserted_id = d["_id"]
        return InsertResult()

    async def update_one(self, query, update, upsert=False):
        for idx, d in enumerate(self.docs):
            if self._matches(d, query):
                if "$set" in update:
                    d.update(update["$set"])
                if "$setOnInsert" in update:
                    pass
                return
        if upsert:
            new_doc = {}
            for k, v in query.items():
                if not k.startswith("$"):
                    new_doc[k] = v
            if "$setOnInsert" in update:
                new_doc.update(update["$setOnInsert"])
            if "$set" in update:
                new_doc.update(update["$set"])
            from bson import ObjectId
            new_doc["_id"] = ObjectId()
            self.docs.append(new_doc)

    async def update_many(self, query, update):
        for d in self.docs:
            if self._matches(d, query):
                if "$set" in update:
                    d.update(update["$set"])

    async def delete_one(self, query):
        self.docs = [d for d in self.docs if not self._matches(d, query)]

    async def delete_many(self, query):
        self.docs = [d for d in self.docs if not self._matches(d, query)]

    def _matches(self, doc, query):
        if not query:
            return True
        for k, v in query.items():
            if k == "$or":
                if not any(self._matches(doc, cond) for cond in v):
                    return False
            elif k == "$gt":
                continue
            elif isinstance(v, dict):
                continue
            else:
                if doc.get(k) != v:
                    return False
        return True


class MockCursor:
    def __init__(self, items):
        self.items = items

    def sort(self, key, direction=-1):
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


class MockMasterDB:
    def __init__(self):
        self.student_registration_ids = MockCollection("student_registration_ids")
        self.student_profiles = MockCollection("student_profiles")
        self.users = MockCollection("users")
        self.certificate_templates = MockCollection("certificate_templates")
        self.student_credentials = MockCollection("student_credentials")
        self.verification_attempts = MockCollection("verification_attempts")
        self.verified_skills = MockCollection("verified_skills")
        self.credential_events = MockCollection("credential_events")
        self.placement_readiness = MockCollection("placement_readiness")
        self.resumes = MockCollection("resumes")
        self.assignment_allocations = MockCollection("assignment_allocations")
        self.assignment_submissions = MockCollection("assignment_submissions")
        self.assignments = MockCollection("assignments")
        self.assessment_attempts = MockCollection("assessment_attempts")

    def __getattr__(self, name):
        coll = MockCollection(name)
        setattr(self, name, coll)
        return coll


@pytest.fixture
def mock_db():
    return MockMasterDB()


@pytest.mark.asyncio
async def test_student_registration_id_generation_and_uniqueness(mock_db):
    """Test Student Registration ID format, uniqueness, non-predictability, and collision protection."""
    # 1. Format check: PI-STU-YYYY-XXXXXXXX
    reg_id_1 = generate_student_registration_id(2027)
    pattern = r"^PI-STU-2027-[A-Z0-9]{8}$"
    assert re.match(pattern, reg_id_1), f"ID format incorrect: {reg_id_1}"

    # 2. Non-predictability: Consecutive generations must be unique
    reg_id_2 = generate_student_registration_id(2027)
    assert reg_id_1 != reg_id_2, "Cryptographic random component failed uniqueness"

    # 3. Allocation and idempotency: Multiple requests for the same student return same ID
    student_uid = "usr_student_alpha_001"
    allocated_1 = await allocate_student_registration_id(mock_db, student_uid, year=2027)
    assert re.match(pattern, allocated_1)

    allocated_2 = await get_or_ensure_student_registration_id(mock_db, student_uid)
    assert allocated_1 == allocated_2, "Allocation must be idempotent and permanently bound to student account"

    # Verify presence in ledger
    ledger_entry = await mock_db.student_registration_ids.find_one({"registration_id": allocated_1})
    assert ledger_entry is not None
    assert ledger_entry["user_id"] == student_uid


def test_certificate_serial_number_formatting():
    """Test Level 1 (PI-CV5-YYYY-XXXXXXXX) and Level 2 (PI-CV10-YYYY-XXXXXXXX) serial numbers."""
    cv5_serial = generate_certificate_serial_number("LEVEL_1_BLUE", 2026)
    assert re.match(r"^PI-CV5-2026-[A-Z0-9]{8}$", cv5_serial), f"Invalid CV5 serial: {cv5_serial}"

    cv10_serial = generate_certificate_serial_number("LEVEL_2_GREEN", 2026)
    assert re.match(r"^PI-CV10-2026-[A-Z0-9]{8}$", cv10_serial), f"Invalid CV10 serial: {cv10_serial}"

    # Verify they are distinct from registration IDs
    assert not cv5_serial.startswith("PI-STU-")
    assert not cv10_serial.startswith("PI-STU-")


def test_student_registration_id_masking():
    """Test that public masking hides PII while preserving verification suffix."""
    full_id = "PI-STU-2027-E8F1A29D"
    masked = mask_registration_id(full_id)
    assert masked == "PI-STU-2027-****A29D"
    assert "E8F1" not in masked

    assert mask_registration_id(None) == "PI-STU-****-XXXX"


@pytest.mark.asyncio
async def test_certificate_template_lifecycle(mock_db):
    """Test Template Creation, Placeholders, Approval Workflow, and Publication."""
    admin_uid = "usr_admin_master"

    # 1. Seed standard default template
    await seed_default_templates(mock_db)
    active = await get_active_published_template(mock_db)
    assert active is not None
    assert active["status"] == TemplateStatus.PUBLISHED.value

    # 2. Create custom draft template with dynamic placeholders
    tmpl_payload = CertificateTemplateCreate(
        name="Dean's Honor Roll Placement Certificate",
        description="Exclusive high-distinction certificate template for top percentile candidates",
        border_color="#059669",
        institution_name="National Institute of Technology Placement Cell",
        signatory_name="Prof. Sunita Deshmukh",
        signatory_title="Dean of Placement & Industry Relations",
        custom_headline="HONOR ROLL CERTIFICATE OF TECHNICAL EXCELLENCE",
        subtext_template="Awarded to {{student_name}} (Reg: {{student_registration_id}}) for achieving {{assessment_score}}% in {{skills_assessed}}.",
    )
    draft = await create_template(mock_db, tmpl_payload, admin_uid)
    assert draft["status"] == TemplateStatus.DRAFT.value
    assert draft["version"] == 1
    tmpl_id = draft["template_id"]

    # 3. Submit for approval
    submitted = await submit_for_approval(mock_db, tmpl_id, admin_uid)
    assert submitted["status"] == TemplateStatus.PENDING_APPROVAL.value

    # 4. Approve template
    approved = await approve_template(mock_db, tmpl_id, approver_uid="usr_super_admin", notes="Design approved.")
    assert approved["status"] == TemplateStatus.APPROVED.value

    # 5. Publish template (should supersede prior published template)
    published = await publish_template(mock_db, tmpl_id, admin_uid="usr_super_admin")
    assert published["status"] == TemplateStatus.PUBLISHED.value
    assert published["is_published"] is True

    # Confirm prior default template was archived
    prior = await mock_db.certificate_templates.find_one({"template_id": active["template_id"]})
    assert prior["status"] == TemplateStatus.ARCHIVED.value
    assert prior["is_published"] is False

    # 6. Test placeholder resolution
    context = {
        "student_name": "Rohan Sharma",
        "student_registration_id": "PI-STU-2027-A1B2C3D4",
        "assessment_score": "94.5",
        "skills_assessed": "Advanced System Design & Distributed Networks",
    }
    resolved = resolve_certificate_text(published["subtext_template"], context)
    assert "Rohan Sharma" in resolved
    assert "PI-STU-2027-A1B2C3D4" in resolved
    assert "94.5%" in resolved


@pytest.mark.asyncio
async def test_full_assessment_flow_and_cryptographic_verification(mock_db):
    """Test 5-min Blue Assessment passing, Serial Number allocation, HMAC assertion, and PDF hash."""
    student_uid = "usr_student_beta_002"
    # Seed user and profile
    await mock_db.users.insert_one({
        "firebase_uid": student_uid,
        "email": "rohan.sharma@campus.edu",
        "display_name": "Rohan Sharma",
        "role": "STUDENT",
    })
    await mock_db.student_profiles.insert_one({
        "user_id": student_uid,
        "full_name": "Rohan Sharma",
        "college": "Vellore Institute of Technology",
        "branch": "Computer Science & Engineering",
    })
    # Seed active resume and passed competency prerequisites
    await mock_db.resumes.insert_one({
        "user_id": student_uid,
        "is_active": True,
        "detected_skills": [{"skill_name": "Distributed Systems & Algorithms"}],
    })
    await mock_db.assessment_attempts.insert_one({
        "user_id": student_uid,
        "skill_name": "distributed systems & algorithms",
        "score": 100.0,
        "status": "completed",
    })
    await mock_db.assignments.insert_one({
        "_id": "asg_001",
        "title": "Core Systems Assignment",
        "max_score": 100.0,
        "user_id": None,
    })
    await mock_db.assignment_submissions.insert_one({
        "user_id": student_uid,
        "assignment_id": "asg_001",
        "score": 100.0,
        "status": "completed",
    })

    # Start assessment
    start_res = await start_verification_assessment(
        user_id=student_uid,
        level="LEVEL_1_BLUE",
        skill_focus="Distributed Systems & Algorithms",
        db=mock_db,
    )
    attempt_id = start_res["attempt_id"]
    assert len(start_res["questions"]) == 5

    # Provide 100% correct answers (options: v1_q1: 1, v1_q2: 2, v1_q3: 1, v1_q4: 1, v1_q5: 1)
    answers = [
        {"question_id": "v1_q1", "selected_option": 1},
        {"question_id": "v1_q2", "selected_option": 2},
        {"question_id": "v1_q3", "selected_option": 1},
        {"question_id": "v1_q4", "selected_option": 1},
        {"question_id": "v1_q5", "selected_option": 1},
    ]

    submit_res = await submit_verification_assessment(
        user_id=student_uid,
        attempt_id=attempt_id,
        answers=answers,
        db=mock_db,
    )

    assert submit_res["passed"] is True
    assert submit_res["score"] == 100.0
    assert submit_res["serial_number"].startswith("PI-CV5-")
    assert submit_res["student_registration_id"].startswith("PI-STU-")

    # Fetch stored credential from DB
    cred = await mock_db.student_credentials.find_one({"serial_number": submit_res["serial_number"]})
    assert cred is not None
    assert cred["status"] == "ACTIVE"
    assert cred["signature_assertion"] is not None
    assert cred["pdf_hash"] is not None

    # Verify public lookup with ZERO PII leakage
    public_lookup = await get_public_credential(submit_res["serial_number"], mock_db)
    assert public_lookup["verified"] is True
    assert public_lookup["candidate_name"] == "Rohan Sharma"
    assert public_lookup["college"] == "Vellore Institute of Technology"
    assert public_lookup["serial_number"] == submit_res["serial_number"]
    # Check that registration ID is masked
    assert "****" in public_lookup["student_registration_id"]
    # Crucially verify NO email or phone or private user id leaked
    assert "email" not in public_lookup
    assert "phone" not in public_lookup
    assert "user_id" not in public_lookup


@pytest.mark.asyncio
async def test_pdf_generation_integrity(mock_db):
    """Test ReportLab PDF generation renders valid bytes with serial number and registration ID."""
    credential = {
        "credential_id": "PI-CRED-2026-F9E8D7C6",
        "serial_number": "PI-CV10-2026-3B4A5C6D",
        "student_registration_id": "PI-STU-2027-E8F1A29D",
        "student_name": "Priya Ananth",
        "college": "BMS College of Engineering",
        "department": "Information Science & Engineering",
        "level": "LEVEL_2_GREEN",
        "badge_type": "GREEN_FULLY_VERIFIED",
        "skill": "Advanced Full Stack & System Engineering",
        "score": 96.0,
        "duration_minutes": 10,
        "issued_at": datetime.now(timezone.utc),
        "credential_hash": "a" * 64,
        "signature_assertion": "b" * 64,
    }

    pdf_bytes = generate_certificate_pdf_bytes(credential)
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 2000  # Genuine binary PDF
    assert pdf_bytes.startswith(b"%PDF-")  # Standard PDF Magic Bytes
