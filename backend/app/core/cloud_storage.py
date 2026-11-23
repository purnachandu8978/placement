"""
Secure Cloud Object Storage Abstraction for Placement Intelligence.
Supports Cloudflare R2 (primary S3-compatible provider), AWS S3, and Local Storage with HMAC signed URLs.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import hmac
import logging
import os
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import urlencode

from app.core.config import BACKEND_ROOT, settings

logger = logging.getLogger(__name__)


@dataclass
class StorageObjectMetadata:
    storage_key: str
    storage_provider: str
    file_size: int
    content_type: str
    document_hash: str  # SHA-256
    etag: Optional[str] = None
    last_modified: Optional[datetime] = None
    custom_metadata: Dict[str, str] = field(default_factory=dict)


class StorageError(Exception):
    """Base exception for storage errors."""
    pass


class StorageNotFoundError(StorageError):
    """Raised when an object does not exist in storage."""
    pass


class StorageProviderInterface(ABC):
    """Abstract interface for persistent cloud object storage."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        raise NotImplementedError

    @abstractmethod
    async def upload_bytes(
        self,
        storage_key: str,
        data: bytes,
        content_type: str,
        metadata: Optional[Dict[str, str]] = None,
    ) -> StorageObjectMetadata:
        """Upload raw file bytes into object storage."""
        raise NotImplementedError

    @abstractmethod
    async def download_bytes(self, storage_key: str) -> bytes:
        """Download raw file bytes from object storage."""
        raise NotImplementedError

    @abstractmethod
    async def delete_object(self, storage_key: str) -> bool:
        """Delete an object from storage. Returns True if deleted or did not exist."""
        raise NotImplementedError

    @abstractmethod
    async def object_exists(self, storage_key: str) -> bool:
        """Check whether an object exists in storage."""
        raise NotImplementedError

    @abstractmethod
    async def get_metadata(self, storage_key: str) -> Optional[StorageObjectMetadata]:
        """Retrieve object metadata without downloading full payload."""
        raise NotImplementedError

    @abstractmethod
    async def generate_signed_url(
        self,
        storage_key: str,
        expires_in_seconds: int = 900,
        download_filename: Optional[str] = None,
    ) -> str:
        """Generate a short-lived signed URL for authenticated document download."""
        raise NotImplementedError


class S3CompatibleStorageProvider(StorageProviderInterface):
    """
    Cloudflare R2 and AWS S3 storage implementation using boto3.
    Cloudflare R2 is fully S3-compatible and uses Signature Version 4.
    """

    def __init__(
        self,
        *,
        bucket_name: str,
        provider_name: str = "cloudflare_r2",
        endpoint_url: Optional[str] = None,
        access_key_id: Optional[str] = None,
        secret_access_key: Optional[str] = None,
        region_name: str = "auto",
    ) -> None:
        self.bucket_name = bucket_name
        self._provider_name = provider_name
        self.endpoint_url = endpoint_url
        self.access_key_id = access_key_id
        self.secret_access_key = secret_access_key
        self.region_name = region_name or "auto"
        self._client: Any = None

    @property
    def provider_name(self) -> str:
        return self._provider_name

    def _get_client(self) -> Any:
        if self._client is None:
            import boto3
            from botocore.config import Config

            client_config = Config(
                signature_version="s3v4",
                s3={"addressing_style": "virtual" if self._provider_name == "aws_s3" else "path"},
                retries={"max_attempts": 3, "mode": "standard"},
            )

            kwargs: Dict[str, Any] = {
                "service_name": "s3",
                "config": client_config,
                "region_name": self.region_name,
            }
            if self.endpoint_url:
                kwargs["endpoint_url"] = self.endpoint_url
            if self.access_key_id and self.secret_access_key:
                kwargs["aws_access_key_id"] = self.access_key_id
                kwargs["aws_secret_access_key"] = self.secret_access_key

            self._client = boto3.client(**kwargs)
        return self._client

    async def upload_bytes(
        self,
        storage_key: str,
        data: bytes,
        content_type: str,
        metadata: Optional[Dict[str, str]] = None,
    ) -> StorageObjectMetadata:
        sha256 = hashlib.sha256(data).hexdigest()
        clean_meta = {k: str(v) for k, v in (metadata or {}).items()}
        clean_meta["sha256"] = sha256

        def _do_put():
            client = self._get_client()
            resp = client.put_object(
                Bucket=self.bucket_name,
                Key=storage_key,
                Body=data,
                ContentType=content_type,
                Metadata=clean_meta,
            )
            return resp

        try:
            resp = await asyncio.to_thread(_do_put)
            return StorageObjectMetadata(
                storage_key=storage_key,
                storage_provider=self.provider_name,
                file_size=len(data),
                content_type=content_type,
                document_hash=sha256,
                etag=resp.get("ETag", "").strip('"'),
                last_modified=datetime.now(timezone.utc),
                custom_metadata=clean_meta,
            )
        except Exception as exc:
            logger.error(f"S3/R2 upload error for {storage_key}: {exc}")
            raise StorageError(f"Cloud upload failed: {exc}") from exc

    async def download_bytes(self, storage_key: str) -> bytes:
        def _do_get():
            client = self._get_client()
            resp = client.get_object(Bucket=self.bucket_name, Key=storage_key)
            return resp["Body"].read()

        try:
            return await asyncio.to_thread(_do_get)
        except Exception as exc:
            err_code = getattr(exc, "response", {}).get("Error", {}).get("Code", "")
            if err_code in ("NoSuchKey", "404"):
                raise StorageNotFoundError(f"Object {storage_key} not found") from exc
            logger.error(f"S3/R2 download error for {storage_key}: {exc}")
            raise StorageError(f"Cloud download failed: {exc}") from exc

    async def delete_object(self, storage_key: str) -> bool:
        def _do_delete():
            client = self._get_client()
            client.delete_object(Bucket=self.bucket_name, Key=storage_key)
            return True

        try:
            return await asyncio.to_thread(_do_delete)
        except Exception as exc:
            logger.error(f"S3/R2 delete error for {storage_key}: {exc}")
            return False

    async def object_exists(self, storage_key: str) -> bool:
        def _do_head():
            client = self._get_client()
            try:
                client.head_object(Bucket=self.bucket_name, Key=storage_key)
                return True
            except Exception as e:
                code = getattr(e, "response", {}).get("Error", {}).get("Code", "")
                if code in ("404", "NoSuchKey"):
                    return False
                raise

        try:
            return await asyncio.to_thread(_do_head)
        except Exception:
            return False

    async def get_metadata(self, storage_key: str) -> Optional[StorageObjectMetadata]:
        def _do_head():
            client = self._get_client()
            return client.head_object(Bucket=self.bucket_name, Key=storage_key)

        try:
            resp = await asyncio.to_thread(_do_head)
            meta = resp.get("Metadata", {})
            return StorageObjectMetadata(
                storage_key=storage_key,
                storage_provider=self.provider_name,
                file_size=resp.get("ContentLength", 0),
                content_type=resp.get("ContentType", "application/octet-stream"),
                document_hash=meta.get("sha256", ""),
                etag=resp.get("ETag", "").strip('"'),
                last_modified=resp.get("LastModified"),
                custom_metadata=meta,
            )
        except Exception:
            return None

    async def generate_signed_url(
        self,
        storage_key: str,
        expires_in_seconds: int = 900,
        download_filename: Optional[str] = None,
    ) -> str:
        def _do_presign():
            client = self._get_client()
            params: Dict[str, Any] = {
                "Bucket": self.bucket_name,
                "Key": storage_key,
            }
            if download_filename:
                clean_name = os.path.basename(download_filename).replace('"', "")
                params["ResponseContentDisposition"] = f'attachment; filename="{clean_name}"'

            return client.generate_presigned_url(
                ClientMethod="get_object",
                Params=params,
                ExpiresIn=expires_in_seconds,
            )

        try:
            return await asyncio.to_thread(_do_presign)
        except Exception as exc:
            logger.error(f"Presigned URL generation failed for {storage_key}: {exc}")
            raise StorageError(f"Failed to generate signed download URL: {exc}") from exc


class FirebaseCloudStorageProvider(StorageProviderInterface):
    """
    Firebase Storage / Google Cloud Storage provider.
    Uses firebase_admin.storage to upload, download, delete, and generate signed URLs
    in the project's native Google Cloud Firebase Storage bucket.
    """

    def __init__(self, bucket_name: Optional[str] = None) -> None:
        raw_bucket = (
            bucket_name
            or settings.STORAGE_BUCKET_NAME
            or settings.FIREBASE_WEB_STORAGE_BUCKET
            or f"{settings.FIREBASE_PROJECT_ID}.firebasestorage.app"
        )
        self.bucket_name = raw_bucket.replace("gs://", "").strip()
        self._bucket: Any = None

    @property
    def provider_name(self) -> str:
        return "firebase"

    def _get_bucket(self) -> Any:
        if self._bucket is None:
            from app.core.firebase import init_firebase_admin
            init_firebase_admin()
            from firebase_admin import storage
            self._bucket = storage.bucket(self.bucket_name)
        return self._bucket

    async def upload_bytes(
        self,
        storage_key: str,
        data: bytes,
        content_type: str,
        metadata: Optional[Dict[str, str]] = None,
    ) -> StorageObjectMetadata:
        sha256 = hashlib.sha256(data).hexdigest()
        clean_meta = {k: str(v) for k, v in (metadata or {}).items()}
        clean_meta["sha256"] = sha256

        def _do_upload():
            bucket = self._get_bucket()
            blob = bucket.blob(storage_key)
            blob.metadata = clean_meta
            blob.upload_from_string(data, content_type=content_type)
            return blob

        try:
            blob = await asyncio.to_thread(_do_upload)
            return StorageObjectMetadata(
                storage_key=storage_key,
                storage_provider=self.provider_name,
                file_size=len(data),
                content_type=content_type,
                document_hash=sha256,
                etag=getattr(blob, "etag", None),
                last_modified=datetime.now(timezone.utc),
                custom_metadata=clean_meta,
            )
        except Exception as exc:
            logger.error(f"Firebase Storage upload error for {storage_key}: {exc}")
            raise StorageError(f"Firebase upload failed: {exc}") from exc

    async def download_bytes(self, storage_key: str) -> bytes:
        def _do_download():
            bucket = self._get_bucket()
            blob = bucket.blob(storage_key)
            if not blob.exists():
                raise StorageNotFoundError(f"Firebase Storage object {storage_key} not found")
            return blob.download_as_bytes()

        try:
            return await asyncio.to_thread(_do_download)
        except StorageNotFoundError:
            raise
        except Exception as exc:
            logger.error(f"Firebase Storage download error for {storage_key}: {exc}")
            raise StorageError(f"Firebase download failed: {exc}") from exc

    async def delete_object(self, storage_key: str) -> bool:
        def _do_delete():
            bucket = self._get_bucket()
            blob = bucket.blob(storage_key)
            if blob.exists():
                blob.delete()
            return True

        try:
            return await asyncio.to_thread(_do_delete)
        except Exception as exc:
            logger.error(f"Firebase Storage delete error for {storage_key}: {exc}")
            return False

    async def object_exists(self, storage_key: str) -> bool:
        def _do_check():
            bucket = self._get_bucket()
            blob = bucket.blob(storage_key)
            return blob.exists()

        try:
            return await asyncio.to_thread(_do_check)
        except Exception:
            return False

    async def get_metadata(self, storage_key: str) -> Optional[StorageObjectMetadata]:
        def _do_get():
            bucket = self._get_bucket()
            blob = bucket.get_blob(storage_key)
            if not blob:
                return None
            meta = blob.metadata or {}
            return StorageObjectMetadata(
                storage_key=storage_key,
                storage_provider=self.provider_name,
                file_size=blob.size or 0,
                content_type=blob.content_type or "application/octet-stream",
                document_hash=meta.get("sha256", ""),
                etag=blob.etag,
                last_modified=blob.updated,
                custom_metadata=meta,
            )

        try:
            return await asyncio.to_thread(_do_get)
        except Exception:
            return None

    async def generate_signed_url(
        self,
        storage_key: str,
        expires_in_seconds: int = 900,
        download_filename: Optional[str] = None,
    ) -> str:
        from datetime import timedelta

        def _do_sign():
            bucket = self._get_bucket()
            blob = bucket.blob(storage_key)
            disposition = f'attachment; filename="{download_filename}"' if download_filename else None
            try:
                return blob.generate_signed_url(
                    expiration=timedelta(seconds=expires_in_seconds),
                    response_disposition=disposition,
                    method="GET",
                )
            except Exception:
                safe_key = storage_key.replace("/", "%2F")
                return f"https://firebasestorage.googleapis.com/v0/b/{bucket.name}/o/{safe_key}?alt=media"

        try:
            return await asyncio.to_thread(_do_sign)
        except Exception as exc:
            logger.error(f"Firebase signed URL generation failed for {storage_key}: {exc}")
            raise StorageError(f"Failed to generate Firebase signed URL: {exc}") from exc


class MongoStorageProvider(StorageProviderInterface):
    """
    Native MongoDB Atlas Document & Binary Storage Provider.
    Stores resume documents directly in the cloud on MongoDB Atlas (db.resume_files)
    without requiring third-party cloud accounts, billing setups, or credit cards.
    """

    def __init__(self, db=None, secret_key: Optional[str] = None) -> None:
        self._db = db
        self.secret_key = (secret_key or settings.STORAGE_SIGNING_SECRET).encode("utf-8")

    @property
    def provider_name(self) -> str:
        return "mongodb"

    def _get_db(self):
        if self._db is not None:
            return self._db
        from app.db.mongodb import mongo_manager
        return mongo_manager.db

    async def upload_bytes(
        self,
        storage_key: str,
        data: bytes,
        content_type: str,
        metadata: Optional[Dict[str, str]] = None,
    ) -> StorageObjectMetadata:
        db = self._get_db()
        sha256 = hashlib.sha256(data).hexdigest()
        now = datetime.now(timezone.utc)
        clean_meta = {k: str(v) for k, v in (metadata or {}).items()}
        clean_meta["sha256"] = sha256

        doc = {
            "storage_key": storage_key,
            "data": data,
            "content_type": content_type,
            "file_size": len(data),
            "document_hash": sha256,
            "metadata": clean_meta,
            "uploaded_at": now,
        }
        await db.resume_files.replace_one({"storage_key": storage_key}, doc, upsert=True)
        return StorageObjectMetadata(
            storage_key=storage_key,
            storage_provider="mongodb",
            file_size=len(data),
            content_type=content_type,
            document_hash=sha256,
            last_modified=now,
            custom_metadata=clean_meta,
        )

    async def download_bytes(self, storage_key: str) -> bytes:
        db = self._get_db()
        doc = await db.resume_files.find_one({"storage_key": storage_key})
        if not doc or "data" not in doc:
            raise StorageNotFoundError(f"MongoDB storage key {storage_key} not found")
        return bytes(doc["data"])

    async def delete_object(self, storage_key: str) -> bool:
        db = self._get_db()
        res = await db.resume_files.delete_one({"storage_key": storage_key})
        return res.deleted_count > 0

    async def object_exists(self, storage_key: str) -> bool:
        db = self._get_db()
        count = await db.resume_files.count_documents({"storage_key": storage_key})
        return count > 0

    async def get_metadata(self, storage_key: str) -> Optional[StorageObjectMetadata]:
        db = self._get_db()
        doc = await db.resume_files.find_one({"storage_key": storage_key}, {"data": 0})
        if not doc:
            return None
        return StorageObjectMetadata(
            storage_key=storage_key,
            storage_provider="mongodb",
            file_size=doc.get("file_size", 0),
            content_type=doc.get("content_type", "application/pdf"),
            document_hash=doc.get("document_hash", ""),
            last_modified=doc.get("uploaded_at"),
            custom_metadata=doc.get("metadata", {}),
        )

    def sign_token(self, storage_key: str, expires_at: int, filename: Optional[str] = None) -> str:
        data = json.dumps({"k": storage_key, "exp": expires_at, "fn": filename or ""})
        raw_b64 = base64.urlsafe_b64encode(data.encode("utf-8")).decode("ascii").rstrip("=")
        sig = hmac.new(self.secret_key, raw_b64.encode("ascii"), hashlib.sha256).hexdigest()
        return f"{raw_b64}.{sig}"

    def verify_token(self, token_str: str) -> Optional[Dict[str, Any]]:
        parts = token_str.split(".", 1)
        if len(parts) != 2:
            return None
        raw_b64, sig = parts
        expected = hmac.new(self.secret_key, raw_b64.encode("ascii"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        padding = "=" * (-len(raw_b64) % 4)
        try:
            payload = json.loads(base64.urlsafe_b64decode((raw_b64 + padding).encode("ascii")).decode("utf-8"))
        except Exception:
            return None
        exp_time = int(payload.get("exp", 0))
        if time.time() > exp_time:
            return None
        return {
            "storage_key": payload.get("k"),
            "expires_at": exp_time,
            "filename": payload.get("fn") or None,
        }

    async def generate_signed_url(
        self,
        storage_key: str,
        expires_in_seconds: int = 900,
        download_filename: Optional[str] = None,
    ) -> str:
        expires_at = int(time.time()) + expires_in_seconds
        token = self.sign_token(storage_key, expires_at, download_filename)
        params = {"token": token}
        if download_filename:
            params["filename"] = download_filename
        return f"/api/v1/resumes/download/signed?{urlencode(params)}"


class SupabaseStorageProvider(StorageProviderInterface):
    """
    Supabase Cloud Object Storage Provider.
    Uses the native Supabase Storage REST API (via async httpx) to upload, download,
    delete, and generate time-limited HMAC-signed URLs.
    Includes auto-provisioning of the storage bucket if it does not already exist.
    """

    def __init__(
        self,
        supabase_url: Optional[str] = None,
        supabase_key: Optional[str] = None,
        bucket_name: Optional[str] = None,
    ) -> None:
        self.supabase_url = (supabase_url or getattr(settings, "SUPABASE_URL", "")).rstrip("/")
        self.supabase_key = supabase_key or getattr(settings, "SUPABASE_KEY", "")
        self.bucket_name = (
            bucket_name
            or getattr(settings, "SUPABASE_STORAGE_BUCKET", "resumes")
            or "resumes"
        ).strip()
        self._bucket_checked = False

    @property
    def provider_name(self) -> str:
        return "supabase"

    def _get_headers(self, content_type: Optional[str] = None) -> Dict[str, str]:
        headers: Dict[str, str] = {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
        }
        if content_type:
            headers["Content-Type"] = content_type
        return headers

    async def _ensure_bucket_exists(self) -> None:
        if self._bucket_checked or not self.supabase_url or not self.supabase_key:
            return
        import httpx

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(
                    f"{self.supabase_url}/storage/v1/bucket/{self.bucket_name}",
                    headers=self._get_headers(),
                )
                if res.status_code == 404:
                    # Bucket does not exist, auto-create it as a private bucket
                    await client.post(
                        f"{self.supabase_url}/storage/v1/bucket",
                        headers=self._get_headers("application/json"),
                        json={"id": self.bucket_name, "name": self.bucket_name, "public": False},
                    )
                    logger.info(f"Auto-created private Supabase storage bucket: '{self.bucket_name}'")
                self._bucket_checked = True
        except Exception as e:
            logger.warning(f"Could not verify/create Supabase bucket: {e}")
            self._bucket_checked = True

    async def upload_bytes(
        self,
        storage_key: str,
        data: bytes,
        content_type: str,
        metadata: Optional[Dict[str, str]] = None,
    ) -> StorageObjectMetadata:
        await self._ensure_bucket_exists()
        sha256 = hashlib.sha256(data).hexdigest()
        clean_meta = {k: str(v) for k, v in (metadata or {}).items()}
        clean_meta["sha256"] = sha256

        clean_key = storage_key.lstrip("/\\").replace("\\", "/")
        url = f"{self.supabase_url}/storage/v1/object/{self.bucket_name}/{clean_key}"
        headers = self._get_headers(content_type or "application/pdf")
        headers["x-upsert"] = "true"

        import httpx

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(url, headers=headers, content=data)
                if res.status_code not in (200, 201):
                    raise StorageError(f"Supabase upload failed ({res.status_code}): {res.text}")

                return StorageObjectMetadata(
                    storage_key=clean_key,
                    storage_provider="supabase",
                    file_size=len(data),
                    content_type=content_type or "application/pdf",
                    document_hash=sha256,
                    last_modified=datetime.now(timezone.utc),
                    custom_metadata=clean_meta,
                )
        except Exception as exc:
            logger.error(f"Supabase upload error for {storage_key}: {exc}")
            raise StorageError(f"Supabase upload failed: {exc}") from exc

    async def download_bytes(self, storage_key: str) -> bytes:
        clean_key = storage_key.lstrip("/\\").replace("\\", "/")
        url = f"{self.supabase_url}/storage/v1/object/authenticated/{self.bucket_name}/{clean_key}"
        headers = self._get_headers()

        import httpx

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.get(url, headers=headers)
                if res.status_code == 404:
                    raise StorageNotFoundError(f"Supabase object {clean_key} not found")
                elif res.status_code != 200:
                    raise StorageError(f"Supabase download failed ({res.status_code}): {res.text}")
                return res.content
        except StorageNotFoundError:
            raise
        except Exception as exc:
            logger.error(f"Supabase download error for {storage_key}: {exc}")
            raise StorageError(f"Supabase download failed: {exc}") from exc

    async def delete_object(self, storage_key: str) -> bool:
        clean_key = storage_key.lstrip("/\\").replace("\\", "/")
        url = f"{self.supabase_url}/storage/v1/object/{self.bucket_name}/{clean_key}"
        headers = self._get_headers()

        import httpx

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.delete(url, headers=headers)
                return res.status_code in (200, 204, 404)
        except Exception as exc:
            logger.error(f"Supabase delete error for {storage_key}: {exc}")
            return False

    async def object_exists(self, storage_key: str) -> bool:
        clean_key = storage_key.lstrip("/\\").replace("\\", "/")
        url = f"{self.supabase_url}/storage/v1/object/info/authenticated/{self.bucket_name}/{clean_key}"
        headers = self._get_headers()

        import httpx

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(url, headers=headers)
                return res.status_code == 200
        except Exception:
            return False

    async def get_metadata(self, storage_key: str) -> Optional[StorageObjectMetadata]:
        clean_key = storage_key.lstrip("/\\").replace("\\", "/")
        url = f"{self.supabase_url}/storage/v1/object/info/authenticated/{self.bucket_name}/{clean_key}"
        headers = self._get_headers()

        import httpx

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(url, headers=headers)
                if res.status_code != 200:
                    return None
                data = res.json()
                return StorageObjectMetadata(
                    storage_key=clean_key,
                    storage_provider="supabase",
                    file_size=data.get("size", 0),
                    content_type=data.get("mimetype", "application/pdf"),
                    document_hash="",
                    etag=data.get("id"),
                    last_modified=datetime.now(timezone.utc),
                )
        except Exception:
            return None

    async def generate_signed_url(
        self,
        storage_key: str,
        expires_in_seconds: int = 900,
        download_filename: Optional[str] = None,
    ) -> str:
        clean_key = storage_key.lstrip("/\\").replace("\\", "/")
        url = f"{self.supabase_url}/storage/v1/object/sign/{self.bucket_name}/{clean_key}"
        headers = self._get_headers("application/json")

        import httpx

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                payload: Dict[str, Any] = {"expiresIn": expires_in_seconds}
                res = await client.post(url, headers=headers, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    signed_path = data.get("signedURL")
                    if signed_path:
                        full_url = f"{self.supabase_url}/storage/v1{signed_path}"
                        if download_filename:
                            full_url += f"&download={download_filename}"
                        return full_url
                raise StorageError(f"Supabase sign failed ({res.status_code}): {res.text}")
        except Exception as exc:
            logger.error(f"Supabase signed URL error for {storage_key}: {exc}")
            raise StorageError(f"Failed to generate Supabase signed URL: {exc}") from exc


class LocalStorageProvider(StorageProviderInterface):
    """
    Local filesystem storage with cryptographically signed HMAC download URLs.
    Used for local development, offline environments, and seamless test executions.
    """

    def __init__(self, base_dir: Optional[Path] = None, secret_key: Optional[str] = None) -> None:
        self.base_dir = Path(base_dir or (BACKEND_ROOT / settings.UPLOAD_DIR)).resolve()
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.secret_key = (secret_key or settings.STORAGE_SIGNING_SECRET).encode("utf-8")

    @property
    def provider_name(self) -> str:
        return "local"

    def _resolve_safe_path(self, storage_key: str) -> Path:
        clean_key = storage_key.lstrip("/\\").replace("\\", "/")
        target = (self.base_dir / clean_key).resolve()
        if target.exists():
            return target
        # Check without duplicate folder prefix (e.g. if base_dir ends with "resumes" and clean_key starts with "resumes/")
        if clean_key.startswith("resumes/"):
            alt = (self.base_dir / clean_key[8:]).resolve()
            if alt.exists():
                return alt
        # Check relative to backend/uploads
        alt2 = (BACKEND_ROOT / "uploads" / clean_key).resolve()
        if alt2.exists():
            return alt2
        # Check relative to backend root
        alt3 = (BACKEND_ROOT / clean_key).resolve()
        if alt3.exists():
            return alt3
        return target

    async def upload_bytes(
        self,
        storage_key: str,
        data: bytes,
        content_type: str,
        metadata: Optional[Dict[str, str]] = None,
    ) -> StorageObjectMetadata:
        target = self._resolve_safe_path(storage_key)
        target.parent.mkdir(parents=True, exist_ok=True)
        sha256 = hashlib.sha256(data).hexdigest()

        def _do_write():
            with open(target, "wb") as f:
                f.write(data)

        await asyncio.to_thread(_do_write)
        return StorageObjectMetadata(
            storage_key=storage_key,
            storage_provider="local",
            file_size=len(data),
            content_type=content_type,
            document_hash=sha256,
            last_modified=datetime.now(timezone.utc),
            custom_metadata=metadata or {},
        )

    async def download_bytes(self, storage_key: str) -> bytes:
        target = self._resolve_safe_path(storage_key)
        if not target.exists():
            raise StorageNotFoundError(f"File not found on disk: {storage_key}")

        def _do_read():
            with open(target, "rb") as f:
                return f.read()

        return await asyncio.to_thread(_do_read)

    async def delete_object(self, storage_key: str) -> bool:
        try:
            target = self._resolve_safe_path(storage_key)
            if target.exists():
                await asyncio.to_thread(target.unlink)
                return True
        except Exception:
            pass
        return False

    async def object_exists(self, storage_key: str) -> bool:
        try:
            target = self._resolve_safe_path(storage_key)
            return target.is_file()
        except Exception:
            return False

    async def get_metadata(self, storage_key: str) -> Optional[StorageObjectMetadata]:
        try:
            target = self._resolve_safe_path(storage_key)
            if not target.is_file():
                return None
            stat = target.stat()
            # Compute hash
            data = await self.download_bytes(storage_key)
            sha256 = hashlib.sha256(data).hexdigest()
            ext = target.suffix.lower()
            ct = "application/pdf" if ext == ".pdf" else ("text/plain" if ext == ".txt" else "application/octet-stream")
            return StorageObjectMetadata(
                storage_key=storage_key,
                storage_provider="local",
                file_size=stat.st_size,
                content_type=ct,
                document_hash=sha256,
                last_modified=datetime.fromtimestamp(stat.st_mtime, timezone.utc),
            )
        except Exception:
            return None

    def sign_token(self, storage_key: str, expires_at: int, filename: Optional[str] = None) -> str:
        data = json.dumps({"k": storage_key, "exp": expires_at, "fn": filename or ""})
        raw_b64 = base64.urlsafe_b64encode(data.encode("utf-8")).decode("ascii").rstrip("=")
        sig = hmac.new(self.secret_key, raw_b64.encode("ascii"), hashlib.sha256).hexdigest()
        return f"{raw_b64}.{sig}"

    def verify_token(self, token_str: str) -> Optional[Dict[str, Any]]:
        parts = token_str.split(".", 1)
        if len(parts) != 2:
            return None
        raw_b64, sig = parts
        expected = hmac.new(self.secret_key, raw_b64.encode("ascii"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None

        padding = "=" * (-len(raw_b64) % 4)
        try:
            payload = json.loads(base64.urlsafe_b64decode((raw_b64 + padding).encode("ascii")).decode("utf-8"))
        except Exception:
            return None

        exp_time = int(payload.get("exp", 0))
        if time.time() > exp_time:
            return None

        return {
            "storage_key": payload.get("k"),
            "expires_at": exp_time,
            "filename": payload.get("fn") or None,
        }

    async def generate_signed_url(
        self,
        storage_key: str,
        expires_in_seconds: int = 900,
        download_filename: Optional[str] = None,
    ) -> str:
        expires_at = int(time.time()) + expires_in_seconds
        token = self.sign_token(storage_key, expires_at, download_filename)
        params = {"token": token}
        if download_filename:
            params["filename"] = download_filename
        return f"/api/v1/resumes/download/signed?{urlencode(params)}"


class MockStorageProvider(StorageProviderInterface):
    """Hermetic in-memory storage provider for fast, deterministic unit testing."""

    def __init__(self) -> None:
        self.objects: Dict[str, Tuple[bytes, StorageObjectMetadata]] = {}
        self.signed_urls: Dict[str, Dict[str, Any]] = {}

    @property
    def provider_name(self) -> str:
        return "mock"

    async def upload_bytes(
        self,
        storage_key: str,
        data: bytes,
        content_type: str,
        metadata: Optional[Dict[str, str]] = None,
    ) -> StorageObjectMetadata:
        sha256 = hashlib.sha256(data).hexdigest()
        meta = StorageObjectMetadata(
            storage_key=storage_key,
            storage_provider="mock",
            file_size=len(data),
            content_type=content_type,
            document_hash=sha256,
            etag="mock-etag-123",
            last_modified=datetime.now(timezone.utc),
            custom_metadata=metadata or {},
        )
        self.objects[storage_key] = (data, meta)
        return meta

    async def download_bytes(self, storage_key: str) -> bytes:
        if storage_key not in self.objects:
            raise StorageNotFoundError(f"Mock key {storage_key} not found")
        return self.objects[storage_key][0]

    async def delete_object(self, storage_key: str) -> bool:
        return self.objects.pop(storage_key, None) is not None

    async def object_exists(self, storage_key: str) -> bool:
        return storage_key in self.objects

    async def get_metadata(self, storage_key: str) -> Optional[StorageObjectMetadata]:
        item = self.objects.get(storage_key)
        return item[1] if item else None

    async def generate_signed_url(
        self,
        storage_key: str,
        expires_in_seconds: int = 900,
        download_filename: Optional[str] = None,
    ) -> str:
        if storage_key not in self.objects:
            raise StorageNotFoundError(f"Cannot sign URL for non-existent key: {storage_key}")
        token = f"mock-signed-{hashlib.sha256(storage_key.encode()).hexdigest()[:12]}"
        self.signed_urls[token] = {
            "key": storage_key,
            "expires_at": time.time() + expires_in_seconds,
            "filename": download_filename,
        }
        return f"https://mock-r2.placementintelligence.dev/download/{storage_key}?token={token}&expires={expires_in_seconds}"


_active_storage_provider: Optional[StorageProviderInterface] = None


def get_storage_provider(provider_type: Optional[str] = None) -> StorageProviderInterface:
    """
    Factory to retrieve the singleton active storage provider.
    Selects Cloudflare R2 / AWS S3 if credentials and endpoint are present,
    or falls back cleanly to LocalStorageProvider with signed URLs.
    """
    global _active_storage_provider
    if _active_storage_provider is not None:
        return _active_storage_provider

    chosen = (provider_type or settings.STORAGE_PROVIDER or "mongodb").lower().strip()

    if chosen in ("supabase", "supabase_storage"):
        has_supabase = bool(settings.SUPABASE_URL and settings.SUPABASE_KEY)
        if has_supabase:
            _active_storage_provider = SupabaseStorageProvider()
            logger.info(f"Initialized Supabase Cloud Storage Provider (Bucket: {_active_storage_provider.bucket_name})")
            return _active_storage_provider
        else:
            logger.info("Supabase credentials not yet configured in .env. Falling back seamlessly to MongoDB Atlas Cloud Storage.")
            _active_storage_provider = MongoStorageProvider()
            return _active_storage_provider

    elif chosen in ("mongodb", "mongo", "atlas"):
        _active_storage_provider = MongoStorageProvider()
        logger.info("Initialized Native MongoDB Atlas Cloud Resume Storage Provider (db.resume_files)")
        return _active_storage_provider

    elif chosen in ("firebase", "firebase_storage", "gcs", "google_cloud_storage", "google"):
        try:
            from app.core.firebase import _firebase_live_cert_loaded
            cert_exists = bool(
                _firebase_live_cert_loaded
                or (settings.FIREBASE_CREDENTIALS_JSON and settings.FIREBASE_CREDENTIALS_JSON.strip())
                or (settings.FIREBASE_CREDENTIALS_PATH and Path(settings.FIREBASE_CREDENTIALS_PATH).exists())
            )
            if cert_exists:
                _active_storage_provider = FirebaseCloudStorageProvider()
                logger.info(f"Initialized Firebase Cloud Storage Provider (Bucket: {_active_storage_provider.bucket_name})")
                return _active_storage_provider
            else:
                logger.info("Firebase live service account certificate not present on host. Using MongoDB Atlas Cloud Storage.")
                _active_storage_provider = MongoStorageProvider()
                return _active_storage_provider
        except Exception as e:
            logger.warning(f"Could not initialize Firebase Storage provider ({e}). Falling back to MongoStorageProvider.")
            _active_storage_provider = MongoStorageProvider()
            return _active_storage_provider

    elif chosen in ("cloudflare_r2", "r2", "aws_s3", "s3"):
        # Verify credentials presence
        has_keys = bool(settings.STORAGE_ACCESS_KEY_ID and settings.STORAGE_SECRET_ACCESS_KEY)
        if has_keys:
            try:
                _active_storage_provider = S3CompatibleStorageProvider(
                    bucket_name=settings.STORAGE_BUCKET_NAME,
                    provider_name="cloudflare_r2" if "r2" in chosen else "aws_s3",
                    endpoint_url=settings.STORAGE_ENDPOINT_URL,
                    access_key_id=settings.STORAGE_ACCESS_KEY_ID,
                    secret_access_key=settings.STORAGE_SECRET_ACCESS_KEY,
                    region_name=settings.STORAGE_REGION,
                )
                logger.info(f"Initialized Cloud Storage Provider: {_active_storage_provider.provider_name} (Bucket: {settings.STORAGE_BUCKET_NAME})")
                return _active_storage_provider
            except Exception as e:
                logger.warning(f"Could not initialize S3/R2 provider ({e}). Falling back to LocalStorageProvider.")
        else:
            logger.info("Storage credentials not configured in environment. Using LocalStorageProvider with HMAC signed URLs.")

    _active_storage_provider = LocalStorageProvider()
    return _active_storage_provider


def set_storage_provider_override(provider: Optional[StorageProviderInterface]) -> None:
    """Testing hook to inject mock storage providers."""
    global _active_storage_provider
    _active_storage_provider = provider

