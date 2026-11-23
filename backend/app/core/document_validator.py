"""
Strict Document Security and Magic Bytes Validation for Placement Intelligence.
Inspects binary signatures to prevent executable masquerading, path traversal, and malicious uploads.
"""

from __future__ import annotations

import io
import os
import re
import uuid
import zipfile
from pathlib import Path
from typing import Tuple

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings

# Disallowed binary executable signatures
DANGEROUS_MAGIC_SIGNATURES = [
    (b"MZ", "Windows Portable Executable (EXE/DLL)"),
    (b"\x7fELF", "Linux ELF Executable"),
    (b"\xca\xfe\xba\xbe", "Java Classfile / Mach-O Fat Binary"),
    (b"\xfe\xed\xfa\xce", "Mach-O 32-bit Binary"),
    (b"\xfe\xed\xfa\xcf", "Mach-O 64-bit Binary"),
    (b"\xce\xfa\xed\xfe", "Mach-O Reverse Endian Binary"),
    (b"\xcf\xfa\xed\xfe", "Mach-O Reverse Endian Binary"),
    (b"Rar!\x1a\x07", "RAR Archive"),
    (b"\x1f\x8b\x08", "GZIP Compressed Binary"),
    (b"7z\xbc\xaf\x27\x1c", "7-Zip Archive"),
]


def sanitize_filename(raw_filename: str) -> str:
    """Sanitize user-provided filename to prevent path traversal and shell injection."""
    if not raw_filename:
        return "resume.pdf"

    # Remove path elements
    clean = os.path.basename(raw_filename)
    clean = clean.replace("/", "").replace("\\", "").replace("..", "").replace("\x00", "")

    # Retain only alphanumeric, dots, dashes, underscores, and spaces
    clean = re.sub(r"[^A-Za-z0-9._\-\s]", "", clean).strip()
    if not clean or clean.startswith("."):
        clean = f"resume_{uuid.uuid4().hex[:6]}.pdf"

    # Length cap
    if len(clean) > 100:
        stem = Path(clean).stem[:90]
        ext = Path(clean).suffix
        clean = f"{stem}{ext}"

    return clean


def generate_secure_storage_key(student_id: str, original_filename: str) -> str:
    """
    Generate an unguessable, user-isolated object storage key.
    Format: resumes/<student_id>/<uuid16>-<sanitized_filename>
    """
    clean_student_id = re.sub(r"[^A-Za-z0-9_\-]", "", str(student_id))
    clean_filename = sanitize_filename(original_filename)
    unique_prefix = uuid.uuid4().hex[:16]
    return f"resumes/{clean_student_id}/{unique_prefix}-{clean_filename}"


def inspect_magic_bytes_and_format(raw_bytes: bytes, original_filename: str) -> Tuple[str, str]:
    """
    Inspect raw binary content to verify file format integrity.
    Never trusts file extensions alone.
    Returns: (detected_extension, canonical_mime_type)
    """
    if not raw_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded resume file is empty.",
        )

    # 1. Immediate rejection of known executable binaries
    for magic, desc in DANGEROUS_MAGIC_SIGNATURES:
        if raw_bytes.startswith(magic):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Security violation: File contains unauthorized binary executable signature ({desc}).",
            )

    claimed_ext = Path(original_filename).suffix.lower()

    # 2. PDF Content Validation
    if raw_bytes.startswith(b"%PDF-"):
        # Valid PDF magic header
        return ".pdf", "application/pdf"

    # 3. DOCX Content Validation (Zip container with OpenXML document structure)
    if raw_bytes.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(io.BytesIO(raw_bytes)) as zf:
                names = zf.namelist()
                has_word = any(
                    name.startswith("word/") or name == "[Content_Types].xml"
                    for name in names
                )
                if has_word:
                    return ".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                else:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid document: ZIP archive is not a valid Microsoft Word (.docx) document.",
                    )
        except zipfile.BadZipFile:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Corrupted Word document: ZIP header present but archive is malformed.",
            )

    # 4. Plain Text Content Validation
    if claimed_ext in (".txt", ""):
        # Check if text decodes cleanly
        is_text = False
        decoded_sample = ""
        for enc in ("utf-8", "latin-1"):
            try:
                decoded_sample = raw_bytes.decode(enc)
                is_text = True
                break
            except UnicodeDecodeError:
                continue

        if is_text:
            # Check printable character ratio to distinguish genuine text from random binary
            sample_slice = decoded_sample[:2048]
            printable_count = sum(1 for ch in sample_slice if ch.isprintable() or ch in "\r\n\t")
            ratio = printable_count / max(1, len(sample_slice))
            if ratio >= 0.85:
                return ".txt", "text/plain"

    # If the user claimed it was PDF or DOCX but magic bytes did not match:
    if claimed_ext in (".pdf", ".docx"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File content does not match its claimed '{claimed_ext}' extension (invalid magic header).",
        )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unsupported or unrecognizable file format. Allowed types: {', '.join(settings.ALLOWED_EXTENSIONS)}",
    )


def validate_resume_file(
    raw_bytes: bytes,
    filename: str,
    declared_content_type: str = "",
) -> Tuple[str, str, str, int]:
    """
    Comprehensive resume upload validation pipeline.
    Validates:
    - File size <= MAX_FILE_SIZE_BYTES
    - Content magic bytes (PDF, DOCX, TXT)
    - Filename sanitization
    Returns: (sanitized_filename, verified_ext, verified_content_type, file_size)
    """
    file_size = len(raw_bytes)
    max_bytes = settings.MAX_FILE_SIZE_BYTES

    if file_size > max_bytes:
        max_mb = max_bytes // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds maximum allowed limit of {max_mb} MB.",
        )

    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot process an empty file.",
        )

    clean_filename = sanitize_filename(filename)
    verified_ext, verified_mime = inspect_magic_bytes_and_format(raw_bytes, clean_filename)

    # Ensure extension matches detected format
    if not clean_filename.lower().endswith(verified_ext):
        base = Path(clean_filename).stem
        clean_filename = f"{base}{verified_ext}"

    return clean_filename, verified_ext, verified_mime, file_size

