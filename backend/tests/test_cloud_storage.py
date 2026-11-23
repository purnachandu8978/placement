"""
Automated Security, Cloud Storage, and Document Management Test Suite.
Validates magic bytes verification, executable rejection, randomized storage keys,
signed URLs, student ownership isolation, admin reprocessing, and cloud migration.
"""

from __future__ import annotations

import io
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

import pytest
from httpx import AsyncClient

from app.core.cloud_storage import (
    LocalStorageProvider,
    MockStorageProvider,
    StorageObjectMetadata,
    set_storage_provider_override,
)
from app.core.config import settings
from app.core.document_validator import (
    generate_secure_storage_key,
    inspect_magic_bytes_and_format,
    sanitize_filename,
    validate_resume_file,
)
from app.db.mongodb import mongo_manager
from app.db.seed import seed_mongodb_data
from app.scripts.migrate_resumes_to_cloud import run_resume_migration


@pytest.fixture(autouse=True)
def setup_mock_storage():
    """Ensure every test runs against a fresh in-memory mock storage provider by default."""
    mock_provider = MockStorageProvider()
    set_storage_provider_override(mock_provider)
    yield mock_provider
    set_storage_provider_override(None)


def create_minimal_pdf_bytes(text_content: str = "Placement Intelligence Sample PDF") -> bytes:
    """Creates a real minimal PDF with valid magic header %PDF-."""
    return (
        f"%PDF-1.4\n"
        f"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        f"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        f"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\n"
        f"xref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000053 00000 n\n0000000102 00000 n\n"
        f"trailer<</Size 4/Root 1 0 R>>\nstartxref\n180\n%%EOF\n% {text_content}\n"
    ).encode("latin-1")


def create_minimal_docx_bytes(sample_text: str = "Sample Word Resume") -> bytes:
    """Creates a genuine minimal Word .docx document (ZIP archive containing word/document.xml)."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
        zf.writestr(
            "word/document.xml",
            f'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            f"<w:body><w:p><w:r><w:t>{sample_text}</w:t></w:r></w:p></w:body></w:document>",
        )
    return buf.getvalue()


@pytest.mark.asyncio
async def test_01_document_validator_magic_bytes_and_security():
    """Verify magic bytes detection: genuine PDFs and DOCXs pass, but executables and disguised files fail."""
    # 1. Genuine PDF
    pdf_bytes = create_minimal_pdf_bytes("John Doe Resume")
    ext, mime = inspect_magic_bytes_and_format(pdf_bytes, "resume.pdf")
    assert ext == ".pdf"
    assert mime == "application/pdf"

    # 2. Genuine DOCX
    docx_bytes = create_minimal_docx_bytes("Jane Smith Resume")
    ext_docx, mime_docx = inspect_magic_bytes_and_format(docx_bytes, "resume.docx")
    assert ext_docx == ".docx"
    assert "wordprocessingml" in mime_docx

    # 3. Genuine TXT
    txt_bytes = "Rahul Sharma\nSkills: Python, FastAPI, React, Docker\nWarangal Institute".encode("utf-8")
    ext_txt, mime_txt = inspect_magic_bytes_and_format(txt_bytes, "resume.txt")
    assert ext_txt == ".txt"
    assert mime_txt == "text/plain"

    # 4. Disguised Windows PE Binary (.exe renamed to .pdf) must be strictly rejected
    fake_exe = b"MZ\x90\x00\x03\x00\x00\x00Malicious payload disguised as pdf"
    with pytest.raises(Exception) as excinfo:
        inspect_magic_bytes_and_format(fake_exe, "innocent.pdf")
    assert "binary executable signature" in str(excinfo.value.detail).lower()

    # 5. Linux ELF Binary disguised as .docx must be strictly rejected
    fake_elf = b"\x7fELF\x02\x01\x01\x00Disguised elf binary"
    with pytest.raises(Exception) as excinfo:
        inspect_magic_bytes_and_format(fake_elf, "innocent.docx")
    assert "binary executable signature" in str(excinfo.value.detail).lower()

    # 6. Plain text pretending to be PDF (claimed .pdf but lacks %PDF-)
    bad_pdf = b"I am plain text, not a pdf file."
    with pytest.raises(Exception) as excinfo:
        inspect_magic_bytes_and_format(bad_pdf, "fake.pdf")
    assert "does not match" in str(excinfo.value.detail).lower()


def test_02_filename_sanitization_and_secure_storage_keys():
    """Verify unguessable storage key structure and path traversal stripping."""
    raw_bad_names = [
        "../../../etc/passwd.pdf",
        "..\\..\\Windows\\System32\\cmd.exe.pdf",
        "resume\x00malicious.pdf",
        "My Resume (2026) & Final!.pdf",
    ]
    for raw in raw_bad_names:
        sanitized = sanitize_filename(raw)
        assert "/" not in sanitized
        assert "\\" not in sanitized
        assert ".." not in sanitized
        assert "\x00" not in sanitized

    key = generate_secure_storage_key("usr_student_999", "My Resume.pdf")
    assert key.startswith("resumes/usr_student_999/")
    assert len(key.split("/")[2]) >= 16  # Unguessable UUID prefix
    assert "My Resume.pdf" in key or "My_Resume" in key or "resume" in key.lower()


@pytest.mark.asyncio
async def test_03_oversized_and_empty_file_rejection():
    """Verify that empty files and files exceeding MAX_FILE_SIZE_BYTES are rejected."""
    # Empty file
    with pytest.raises(Exception) as excinfo:
        validate_resume_file(raw_bytes=b"", filename="empty.pdf")
    assert "empty" in str(excinfo.value.detail).lower()

    # Oversized file
    oversized = b"%PDF-" + b"0" * (settings.MAX_FILE_SIZE_BYTES + 1024)
    with pytest.raises(Exception) as excinfo:
        validate_resume_file(raw_bytes=oversized, filename="huge.pdf")
    assert excinfo.value.status_code == 413


@pytest.mark.asyncio
async def test_04_cloud_upload_and_metadata_persistence(client: AsyncClient, setup_mock_storage: MockStorageProvider):
    """Verify end-to-end cloud upload saves document in object storage, stores MongoDB metadata, and analyzes skills."""
    await seed_mongodb_data(mongo_manager.db)
    token = "mock_token_cloud_student_1"
    headers = {"Authorization": f"Bearer {token}"}

    pdf_content = (
        "%PDF-1.4\n"
        "Aarav Mehta\n"
        "aarav.mehta@college.edu | +91-9123456780\n"
        "B.Tech Computer Science, IIT Madras | CGPA: 9.1\n"
        "GitHub: https://github.com/aaravmehta | LinkedIn: https://linkedin.com/in/aaravmehta\n\n"
        "TECHNICAL SKILLS\n"
        "Python, FastAPI, TypeScript, React, PostgreSQL, Docker, AWS, Redis\n\n"
        "PROJECTS\n"
        "Distributed Event Streaming Platform - Built resilient FastAPI & Redis microservice.\n"
    )
    raw_pdf = create_minimal_pdf_bytes(pdf_content)

    res = await client.post(
        "/api/v1/resumes/upload",
        headers=headers,
        files={"file": ("aarav_resume.pdf", raw_pdf, "application/pdf")},
    )
    assert res.status_code == 200, res.text
    data = res.json()

    assert data["processing_status"] == "completed"
    assert data["storage_provider"] == "mock"
    assert "storage_key" in data
    assert data["storage_key"].startswith("resumes/usr_google_default_01/") or "resumes/" in data["storage_key"]
    assert len(data.get("extracted_skills", [])) >= 2

    # Verify object physically exists in storage provider
    assert await setup_mock_storage.object_exists(data["storage_key"])
    downloaded_bytes = await setup_mock_storage.download_bytes(data["storage_key"])
    assert downloaded_bytes == raw_pdf

    # Verify MongoDB document
    db = mongo_manager.db
    resume_doc = await db.resumes.find_one({"storage_key": data["storage_key"]})
    assert resume_doc is not None
    assert resume_doc["storage_provider"] == "mock"
    assert resume_doc["document_hash"] != ""
    assert resume_doc["file_size"] == len(raw_pdf)
    assert resume_doc["is_active"] is True


@pytest.mark.asyncio
async def test_05_student_ownership_and_cross_student_access_denial(client: AsyncClient):
    """Verify Student A cannot download or view Student B's resume (HTTP 403 Forbidden)."""
    tok_a = "mock_token_student_alpha"
    tok_b = "mock_token_student_beta"

    # Authenticate Student A and upload resume
    raw_a = create_minimal_pdf_bytes("Student Alpha Resume Content")
    res_a = await client.post(
        "/api/v1/resumes/upload",
        headers={"Authorization": f"Bearer {tok_a}"},
        files={"file": ("alpha.pdf", raw_a, "application/pdf")},
    )
    assert res_a.status_code == 200
    resume_a_id = res_a.json()["id"]

    # Student A can get their signed download URL
    url_res_a = await client.get(
        f"/api/v1/resumes/{resume_a_id}/download-url",
        headers={"Authorization": f"Bearer {tok_a}"},
    )
    assert url_res_a.status_code == 200
    assert "download_url" in url_res_a.json()

    # Student B attempts to access Student A's resume -> Must be rejected with 403 Forbidden!
    forbidden_res = await client.get(
        f"/api/v1/resumes/{resume_a_id}/download-url",
        headers={"Authorization": f"Bearer {tok_b}"},
    )
    assert forbidden_res.status_code == 403

    forbidden_direct = await client.get(
        f"/api/v1/resumes/{resume_a_id}/download",
        headers={"Authorization": f"Bearer {tok_b}"},
    )
    assert forbidden_direct.status_code == 403

    forbidden_delete = await client.delete(
        f"/api/v1/resumes/{resume_a_id}",
        headers={"Authorization": f"Bearer {tok_b}"},
    )
    assert forbidden_delete.status_code == 403


@pytest.mark.asyncio
async def test_06_signed_url_generation_and_local_hmac_expiration(tmp_path: Path):
    """Verify LocalStorageProvider HMAC signature generation and rejection of expired or tampered tokens."""
    local_driver = LocalStorageProvider(base_dir=tmp_path, secret_key="test-secret-key")
    test_key = "resumes/student_1/test_resume.pdf"
    content = b"%PDF-1.4\nTest signed URL content"
    await local_driver.upload_bytes(test_key, content, "application/pdf")

    # 1. Valid signed URL
    signed_url = await local_driver.generate_signed_url(test_key, expires_in_seconds=300, download_filename="my_resume.pdf")
    assert "/api/v1/resumes/download/signed?token=" in signed_url

    token = signed_url.split("token=")[1].split("&")[0]
    verified = local_driver.verify_token(token)
    assert verified is not None
    assert verified["storage_key"] == test_key
    assert verified["filename"] == "my_resume.pdf"

    # 2. Tampered token rejected
    tampered = token[:-4] + "ffff"
    assert local_driver.verify_token(tampered) is None

    # 3. Expired token rejected
    expired_token = local_driver.sign_token(test_key, expires_at=int(time.time()) - 10, filename="my_resume.pdf")
    assert local_driver.verify_token(expired_token) is None


@pytest.mark.asyncio
async def test_07_admin_telemetry_reprocessing_and_retention_deletion(client: AsyncClient, setup_mock_storage: MockStorageProvider):
    """Verify Admin RBAC: view all resumes, inspect storage stats, reprocess cloud documents, and delete via retention policy."""
    db = mongo_manager.db
    student_tok = "mock_token_student_for_admin"
    admin_tok = "mock_token_super_admin_test"

    raw_pdf = create_minimal_pdf_bytes(
        "Kiran Kumar\n"
        "kiran@example.edu\n"
        "Skills: Python, React, MongoDB, FastAPI\n"
    )
    up_res = await client.post(
        "/api/v1/resumes/upload",
        headers={"Authorization": f"Bearer {student_tok}"},
        files={"file": ("kiran.pdf", raw_pdf, "application/pdf")},
    )
    assert up_res.status_code == 200
    resume_id = up_res.json()["id"]

    admin_headers = {"Authorization": f"Bearer {admin_tok}"}

    # 1. Admin lists all resumes with storage metadata
    list_res = await client.get("/api/v1/admin/resumes", headers=admin_headers)
    assert list_res.status_code == 200
    rows = list_res.json()
    assert any(r["id"] == resume_id for r in rows)

    # 2. Admin inspects storage telemetry stats
    stats_res = await client.get("/api/v1/admin/resumes/storage-stats", headers=admin_headers)
    assert stats_res.status_code == 200
    stats = stats_res.json()
    assert stats["total_resumes"] >= 1
    assert "mock" in stats["providers"]

    # 3. Admin reprocesses resume from cloud storage
    reproc_res = await client.post(f"/api/v1/admin/resumes/{resume_id}/reprocess", headers=admin_headers)
    assert reproc_res.status_code == 200
    assert reproc_res.json()["status"] == "completed"

    # 4. Admin deletes document under retention policy
    del_res = await client.delete(f"/api/v1/admin/resumes/{resume_id}", headers=admin_headers)
    assert del_res.status_code == 200

    # Ensure document is purged from MongoDB and cloud storage
    assert await db.resumes.find_one({"_id": resume_id}) is None
    storage_key = up_res.json()["storage_key"]
    assert not await setup_mock_storage.object_exists(storage_key)


@pytest.mark.asyncio
async def test_08_resume_cloud_migration_utility(tmp_path: Path):
    """Verify resume cloud migration utility: dry-run mode and live migration with SHA-256 checksum verification."""
    from mongomock_motor import AsyncMongoMockClient

    mock_db = AsyncMongoMockClient()["test_migration_db"]
    mock_storage = MockStorageProvider()

    # Create dummy local files
    local_dir = tmp_path / "uploads" / "resumes" / "usr_student_mig"
    local_dir.mkdir(parents=True, exist_ok=True)
    local_file = local_dir / "old_resume.pdf"
    content = create_minimal_pdf_bytes("Migration Test Resume Content")
    local_file.write_bytes(content)

    doc_id = "507f1f77bcf86cd799439011"
    await mock_db.resumes.insert_one({
        "_id": doc_id,
        "user_id": "usr_student_mig",
        "filename": "old_resume.pdf",
        "storage_key": str(local_file),
        "storage_provider": "local",
        "file_size": len(content),
    })

    # 1. Dry run
    dry_summary = await run_resume_migration(
        dry_run=True,
        custom_db=mock_db,
        custom_storage=mock_storage,
    )
    assert dry_summary["dry_run"] is True
    assert dry_summary["migrated_count"] == 1
    # Verify mock storage was NOT modified during dry-run
    assert len(mock_storage.objects) == 0

    # 2. Live migration
    live_summary = await run_resume_migration(
        dry_run=False,
        custom_db=mock_db,
        custom_storage=mock_storage,
    )
    assert live_summary["dry_run"] is False
    assert live_summary["migrated_count"] == 1
    assert live_summary["failed_count"] == 0

    # Verify object now exists in storage provider with identical checksum
    updated_doc = await mock_db.resumes.find_one({"_id": doc_id})
    assert updated_doc["storage_provider"] == "mock"
    assert updated_doc["storage_key"].startswith("resumes/usr_student_mig/")

    cloud_bytes = await mock_storage.download_bytes(updated_doc["storage_key"])
    assert cloud_bytes == content
    assert local_file.exists()  # Local source was NOT prematurely deleted
