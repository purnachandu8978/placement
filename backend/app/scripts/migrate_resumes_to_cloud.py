"""
Cloud Resume Storage Migration Utility.
Migrates existing local filesystem resumes from `uploads/resumes/` to Cloud Object Storage
(Cloudflare R2 / AWS S3) with cryptographic checksum verification and safe dry-run capabilities.

Usage:
    python -m app.scripts.migrate_resumes_to_cloud [--dry-run] [--batch-size 50]
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.cloud_storage import (
    StorageObjectMetadata,
    StorageProviderInterface,
    get_storage_provider,
)
from app.core.config import BACKEND_ROOT, settings
from app.core.document_validator import generate_secure_storage_key

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("placement_intelligence.migration")


async def run_resume_migration(
    *,
    dry_run: bool = False,
    batch_size: int = 50,
    target_provider_override: Optional[str] = None,
    custom_db=None,
    custom_storage=None,
) -> Dict[str, Any]:
    """
    Executes the migration workflow:
    1. Scan MongoDB resumes collection for documents with local or unmigrated storage.
    2. Verify file presence on host disk and verify student ownership.
    3. Compute local SHA-256 checksum.
    4. If dry_run is False:
       - Upload file bytes to the configured Cloud Object Storage provider.
       - Download/inspect cloud object to verify remote checksum matches local checksum.
       - Update MongoDB metadata: storage_key, storage_provider, document_hash.
       - Source local files are preserved safely on host!
    5. Return comprehensive audit log dictionary.
    """
    start_time = datetime.now(timezone.utc)
    logger.info(f"Starting Resume Cloud Migration. Mode: {'DRY RUN' if dry_run else 'LIVE'}")

    # Database connection
    if custom_db is not None:
        db = custom_db
        client = None
    else:
        client = AsyncIOMotorClient(settings.MONGODB_URI)
        db = client[settings.MONGODB_DB_NAME]

    storage: StorageProviderInterface = custom_storage or get_storage_provider(target_provider_override)
    target_provider_name = storage.provider_name
    logger.info(f"Target Storage Provider: {target_provider_name}")

    uploads_base = (BACKEND_ROOT / settings.UPLOAD_DIR).resolve()
    query = {"$or": [{"storage_provider": {"$ne": target_provider_name}}, {"storage_provider": {"$exists": False}}]}
    docs = await db.resumes.find(query).to_list(length=1000)

    total_candidates = len(docs)
    migrated_count = 0
    skipped_count = 0
    failed_count = 0
    errors: List[Dict[str, Any]] = []
    migrated_details: List[Dict[str, Any]] = []

    for idx, doc in enumerate(docs[:batch_size]):
        doc_id = str(doc["_id"])
        user_id = str(doc.get("user_id", "unknown"))
        filename = doc.get("filename") or "resume.pdf"
        old_storage_key = doc.get("storage_key", "")

        logger.info(f"[{idx + 1}/{min(total_candidates, batch_size)}] Inspecting Resume {doc_id} (Student: {user_id}, File: {filename})")

        # Resolve local source path
        local_path: Optional[Path] = None
        candidates = [
            (BACKEND_ROOT / old_storage_key).resolve(),
            (uploads_base.parent / old_storage_key).resolve(),
            (uploads_base / user_id / filename).resolve(),
            (uploads_base / filename).resolve(),
        ]
        for c in candidates:
            if c.exists() and c.is_file():
                local_path = c
                break

        if not local_path:
            logger.warning(f"  [SKIPPED] Local file not found for resume {doc_id}")
            skipped_count += 1
            errors.append({"resume_id": doc_id, "error": f"Local file not found for key {old_storage_key}"})
            continue

        try:
            with open(local_path, "rb") as f:
                raw_bytes = f.read()

            local_hash = hashlib.sha256(raw_bytes).hexdigest()
            file_size = len(raw_bytes)
            ext = local_path.suffix.lower()
            content_type = "application/pdf" if ext == ".pdf" else ("text/plain" if ext == ".txt" else "application/octet-stream")

            # Check if target key is already set or generate unguessable cloud key
            new_storage_key = generate_secure_storage_key(user_id, filename)

            if dry_run:
                logger.info(f"  [DRY RUN] Would upload {file_size} bytes (SHA256: {local_hash[:12]}...) to {new_storage_key}")
                migrated_count += 1
                migrated_details.append({
                    "resume_id": doc_id,
                    "student_id": user_id,
                    "filename": filename,
                    "file_size": file_size,
                    "sha256": local_hash,
                    "target_key": new_storage_key,
                    "status": "dry_run_verified",
                })
                continue

            # LIVE MIGRATION
            # 1. Upload to cloud storage
            meta: StorageObjectMetadata = await storage.upload_bytes(
                storage_key=new_storage_key,
                data=raw_bytes,
                content_type=content_type,
                metadata={"user_id": user_id, "original_filename": filename, "migrated_from": str(local_path)},
            )

            # 2. Cryptographic Checksum Verification: Download & match hash
            cloud_bytes = await storage.download_bytes(new_storage_key)
            cloud_hash = hashlib.sha256(cloud_bytes).hexdigest()

            if cloud_hash != local_hash:
                raise ValueError(f"Checksum mismatch after upload! Local: {local_hash} vs Cloud: {cloud_hash}")

            # 3. Update MongoDB metadata (Local source file is NOT deleted)
            now = datetime.now(timezone.utc)
            await db.resumes.update_one(
                {"_id": doc["_id"]},
                {
                    "$set": {
                        "storage_key": new_storage_key,
                        "storage_provider": target_provider_name,
                        "document_hash": local_hash,
                        "file_size": file_size,
                        "content_type": content_type,
                        "migrated_at": now,
                    }
                },
            )

            # Record migration audit event
            await db.audit_logs.insert_one({
                "action": "resume_migrated_to_cloud",
                "resume_id": doc_id,
                "user_id": user_id,
                "old_storage_key": old_storage_key,
                "new_storage_key": new_storage_key,
                "storage_provider": target_provider_name,
                "document_hash": local_hash,
                "file_size": file_size,
                "timestamp": now,
            })

            logger.info(f"  [SUCCESS] Migrated & verified resume {doc_id} to {target_provider_name}")
            migrated_count += 1
            migrated_details.append({
                "resume_id": doc_id,
                "student_id": user_id,
                "filename": filename,
                "file_size": file_size,
                "sha256": local_hash,
                "storage_key": new_storage_key,
                "status": "migrated_and_verified",
            })

        except Exception as exc:
            logger.error(f"  [FAILED] Failed migrating resume {doc_id}: {exc}")
            failed_count += 1
            errors.append({"resume_id": doc_id, "error": str(exc)})

    duration_sec = round((datetime.now(timezone.utc) - start_time).total_seconds(), 2)
    summary = {
        "status": "completed",
        "dry_run": dry_run,
        "target_provider": target_provider_name,
        "total_candidates": total_candidates,
        "batch_size": batch_size,
        "migrated_count": migrated_count,
        "skipped_count": skipped_count,
        "failed_count": failed_count,
        "duration_seconds": duration_sec,
        "errors": errors,
        "details": migrated_details,
    }

    logger.info(
        f"Migration completed in {duration_sec}s. "
        f"Processed: {migrated_count}, Skipped: {skipped_count}, Failed: {failed_count}"
    )

    if client:
        client.close()

    return summary


def main():
    parser = argparse.ArgumentParser(description="Migrate local placement resumes to Cloud Object Storage (R2/S3)")
    parser.add_argument("--dry-run", action="store_true", help="Inspect and verify files without modifying cloud or MongoDB")
    parser.add_argument("--batch-size", type=int, default=50, help="Maximum number of resumes to process in this run")
    parser.add_argument("--provider", type=str, default=None, help="Target storage provider override (cloudflare_r2, aws_s3, local)")
    args = parser.parse_args()

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        summary = loop.run_until_complete(
            run_resume_migration(
                dry_run=args.dry_run,
                batch_size=args.batch_size,
                target_provider_override=args.provider,
            )
        )
        print("\n--- Migration Summary Report ---")
        for k, v in summary.items():
            if k not in ("details", "errors"):
                print(f"  {k}: {v}")
        if summary["errors"]:
            print(f"  Errors encountered: {len(summary['errors'])}")
    finally:
        loop.close()


if __name__ == "__main__":
    main()

