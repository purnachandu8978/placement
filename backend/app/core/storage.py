"""
Unified Storage Manager bridging Cloud Object Storage (Cloudflare R2 / AWS S3)
and Local Storage with magic bytes validation and ownership isolation.
"""

from __future__ import annotations

import hashlib
import os
import uuid
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from fastapi import HTTPException, UploadFile, status

from app.core.cloud_storage import (
    StorageObjectMetadata,
    StorageProviderInterface,
    get_storage_provider,
)
from app.core.config import BACKEND_ROOT, settings
from app.core.document_validator import (
    generate_secure_storage_key,
    sanitize_filename,
    validate_resume_file,
)


class SecureStorageManager:
    """Enterprise cloud and local file storage manager with content inspection and ownership isolation."""

    def __init__(self, provider: Optional[StorageProviderInterface] = None):
        self._provider = provider

    @property
    def provider(self) -> StorageProviderInterface:
        return self._provider or get_storage_provider()

    async def save_resume_bytes(
        self,
        user_id: str,
        filename: str,
        raw_bytes: bytes,
        declared_content_type: str = "",
    ) -> Tuple[str, str, int, str, str]:
        """
        Validates content magic bytes, uploads to object storage with an unguessable key,
        and returns: (storage_key, sanitized_filename, file_size, sha256_hash, storage_provider_name)
        """
        clean_name, ext, mime_type, file_size = validate_resume_file(
            raw_bytes=raw_bytes,
            filename=filename,
            declared_content_type=declared_content_type,
        )

        storage_key = generate_secure_storage_key(student_id=user_id, original_filename=clean_name)
        try:
            meta: StorageObjectMetadata = await self.provider.upload_bytes(
                storage_key=storage_key,
                data=raw_bytes,
                content_type=mime_type,
                metadata={"user_id": str(user_id), "original_filename": clean_name},
            )
        except Exception as exc:
            if self.provider.provider_name != "mongodb":
                import logging
                logging.getLogger(__name__).warning(
                    f"Storage provider '{self.provider.provider_name}' failed ({exc}). Falling back to MongoStorageProvider."
                )
                from app.core.cloud_storage import MongoStorageProvider
                fallback_provider = MongoStorageProvider()
                meta = await fallback_provider.upload_bytes(
                    storage_key=storage_key,
                    data=raw_bytes,
                    content_type=mime_type,
                    metadata={"user_id": str(user_id), "original_filename": clean_name},
                )
            else:
                raise

        return (
            meta.storage_key,
            clean_name,
            meta.file_size,
            meta.document_hash,
            meta.storage_provider,
        )

    async def save_resume(self, user_id: Any, file: UploadFile) -> Tuple[str, str, int, str]:
        """
        Legacy adapter for UploadFile parameters.
        Returns: (storage_key, sanitized_filename, file_size, sha256_hash)
        """
        raw_bytes = await file.read()
        await file.seek(0)
        filename = file.filename or "resume.pdf"
        storage_key, clean_filename, file_size, doc_hash, _provider = await self.save_resume_bytes(
            user_id=str(user_id),
            filename=filename,
            raw_bytes=raw_bytes,
            declared_content_type=file.content_type or "",
        )
        return storage_key, clean_filename, file_size, doc_hash

    async def download_resume_bytes(self, storage_key: str) -> bytes:
        """Download raw resume bytes from active object storage provider."""
        try:
            return await self.provider.download_bytes(storage_key)
        except Exception as exc:
            if self.provider.provider_name != "mongodb":
                from app.core.cloud_storage import MongoStorageProvider
                return await MongoStorageProvider().download_bytes(storage_key)
            raise

    async def generate_signed_url(
        self,
        storage_key: str,
        expires_in_seconds: int = 900,
        download_filename: Optional[str] = None,
        provider_name: Optional[str] = None,
    ) -> str:
        """Generate short-lived signed URL for direct authenticated download, with smart fallback to local/mongo."""
        from app.core.cloud_storage import LocalStorageProvider, MongoStorageProvider

        # 1. Check local filesystem first
        local_p = LocalStorageProvider()
        if await local_p.object_exists(storage_key):
            return await local_p.generate_signed_url(
                storage_key=storage_key,
                expires_in_seconds=expires_in_seconds,
                download_filename=download_filename,
            )

        # 2. Check MongoDB collection
        mongo_p = MongoStorageProvider()
        if await mongo_p.object_exists(storage_key):
            return await mongo_p.generate_signed_url(
                storage_key=storage_key,
                expires_in_seconds=expires_in_seconds,
                download_filename=download_filename,
            )

        # 3. Try the active provider (e.g., Supabase)
        try:
            return await self.provider.generate_signed_url(
                storage_key=storage_key,
                expires_in_seconds=expires_in_seconds,
                download_filename=download_filename,
            )
        except Exception:
            # Fallback to local signed URL
            return await local_p.generate_signed_url(
                storage_key=storage_key,
                expires_in_seconds=expires_in_seconds,
                download_filename=download_filename,
            )

    async def delete_resume(self, storage_key: str) -> bool:
        """Delete document from object storage."""
        return await self.provider.delete_object(storage_key)

    def delete_file(self, relative_path: str) -> bool:
        """Synchronous deletion adapter for legacy code paths."""
        try:
            # Check local file existence if path looks local
            base = (BACKEND_ROOT / settings.UPLOAD_DIR).resolve()
            full_path = (BACKEND_ROOT / relative_path).resolve()
            if full_path.exists() and str(full_path).startswith(str(base.parent)):
                full_path.unlink()
                return True
        except Exception:
            pass

        # Try async deletion via provider in background or sync thread
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(self.provider.delete_object(relative_path))
            else:
                loop.run_until_complete(self.provider.delete_object(relative_path))
        except Exception:
            pass
        return True

    def get_file_path(self, relative_path: str) -> Path:
        """Retrieves verified absolute file path for local files, preventing directory traversal."""
        base_dir = (BACKEND_ROOT / settings.UPLOAD_DIR).resolve()
        full_path = (base_dir.parent / relative_path).resolve()
        if not str(full_path).startswith(str(base_dir.resolve())):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Illegal path traversal attempt.",
            )
        if not full_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Resume file not found on disk.",
            )
        return full_path


storage_manager = SecureStorageManager()
