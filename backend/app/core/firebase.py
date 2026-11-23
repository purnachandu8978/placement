import asyncio
import base64
import json
import logging
import os
import re
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional
import firebase_admin
from firebase_admin import auth, credentials
from fastapi import HTTPException, status
from google.auth import jwt as google_jwt
import requests
from app.core.config import BACKEND_ROOT, settings

logger = logging.getLogger("placement_intelligence.firebase")

_GOOGLE_FIREBASE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"

_firebase_initialized = False
_firebase_live_cert_loaded = False
_firebase_last_notice: str = ""

_certs_lock = threading.Lock()
_certs_cache: Dict[str, Any] = {
    "certs": {},
    "expires_at": 0.0,
    "last_fetch_at": 0.0,
}


def _resolve_credentials_path(raw_path: str | None) -> Path | None:
    if not raw_path or not raw_path.strip():
        return None
    p = Path(raw_path.strip())
    if not p.is_absolute():
        p = BACKEND_ROOT / p
    return p if p.exists() and p.is_file() else None


def init_firebase_admin(force_reinit: bool = False):
    """Initializes Firebase Admin SDK using inline JSON, service account file, or ADC."""
    global _firebase_initialized, _firebase_live_cert_loaded, _firebase_last_notice
    if _firebase_initialized and not force_reinit:
        return

    if force_reinit:
        try:
            existing_app = firebase_admin.get_app()
            firebase_admin.delete_app(existing_app)
        except ValueError:
            pass
        _firebase_initialized = False
        _firebase_live_cert_loaded = False
        _firebase_last_notice = ""

    try:
        # 1. Check inline service account JSON string
        if settings.FIREBASE_CREDENTIALS_JSON and settings.FIREBASE_CREDENTIALS_JSON.strip():
            cert_dict = json.loads(settings.FIREBASE_CREDENTIALS_JSON.strip())
            cred = credentials.Certificate(cert_dict)
            firebase_admin.initialize_app(cred)
            if not settings.FIREBASE_PROJECT_ID and cert_dict.get("project_id"):
                settings.FIREBASE_PROJECT_ID = cert_dict["project_id"]
            logger.info("Firebase Admin initialized with inline FIREBASE_CREDENTIALS_JSON.")
            _firebase_initialized = True
            _firebase_live_cert_loaded = True
            _firebase_last_notice = "Initialized via inline service account JSON"
            return

        # 2. Check certificate file path (relative to backend/ or absolute)
        cert_path = _resolve_credentials_path(settings.FIREBASE_CREDENTIALS_PATH)
        if cert_path is not None:
            cred = credentials.Certificate(str(cert_path))
            firebase_admin.initialize_app(cred)
            logger.info(f"Firebase Admin initialized with service account certificate: {cert_path.name}")
            _firebase_initialized = True
            _firebase_live_cert_loaded = True
            _firebase_last_notice = f"Initialized via {cert_path.name}"
            return

        # 3. Check GOOGLE_APPLICATION_CREDENTIALS
        if os.getenv("GOOGLE_APPLICATION_CREDENTIALS") and os.path.exists(os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")):
            cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin initialized with Application Default Credentials.")
            _firebase_initialized = True
            _firebase_live_cert_loaded = True
            _firebase_last_notice = "Initialized via Application Default Credentials"
            return

        # 4. Initialize with Project ID (Google Public Certs verify live Firebase JWTs)
        project_id = (settings.FIREBASE_PROJECT_ID or "").strip()
        if project_id:
            try:
                firebase_admin.initialize_app(options={"projectId": project_id})
            except ValueError:
                pass
            _firebase_initialized = True
            _firebase_live_cert_loaded = False
            _firebase_last_notice = (
                f"Public-key Firebase JWT verification active for '{project_id}'. "
                "Add serviceAccountKey.json for revocation & custom claims."
            )
            logger.info(_firebase_last_notice)
            return

        _firebase_initialized = True
        _firebase_live_cert_loaded = False
        _firebase_last_notice = "Running in managed dev verification mode (no FIREBASE_PROJECT_ID set)."
        logger.info(_firebase_last_notice)
    except Exception as e:
        _firebase_last_notice = f"Firebase configuration error: {e}"
        logger.warning(f"Firebase initialization notice: {e}")
        _firebase_initialized = True


def reinit_firebase_admin():
    """Force re-initializes Firebase Admin SDK after credentials configuration update."""
    init_firebase_admin(force_reinit=True)


def get_firebase_status() -> Dict[str, Any]:
    """Returns diagnostic telemetry about Firebase configuration without exposing secret keys."""
    cert_path = _resolve_credentials_path(settings.FIREBASE_CREDENTIALS_PATH)
    return {
        "project_id": (settings.FIREBASE_PROJECT_ID or "").strip(),
        "live_credentials_loaded": _firebase_live_cert_loaded,
        "credentials_path": settings.FIREBASE_CREDENTIALS_PATH or "",
        "credentials_file_exists": cert_path is not None,
        "credentials_json_configured": bool(settings.FIREBASE_CREDENTIALS_JSON and settings.FIREBASE_CREDENTIALS_JSON.strip()),
        "mock_auth_in_dev": settings.FIREBASE_MOCK_AUTH_IN_DEV,
        "notice": _firebase_last_notice,
    }


def _parse_max_age(cache_control: str) -> int:
    match = re.search(r"max-age=(\d+)", cache_control or "", re.IGNORECASE)
    if not match:
        return 3600
    try:
        return max(60, min(86400, int(match.group(1))))
    except ValueError:
        return 3600


def _fetch_google_firebase_certs() -> tuple[Dict[str, str], int]:
    """Fetches Firebase public x509 certificates from Google with strict timeout and fallback."""
    try:
        resp = requests.get(_GOOGLE_FIREBASE_CERTS_URL, timeout=(2, 3))
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, dict) or not data:
            raise ValueError("Google public certificate response was empty or invalid JSON.")
        max_age = _parse_max_age(resp.headers.get("Cache-Control", ""))
        return {str(k): str(v) for k, v in data.items()}, max_age
    except Exception as exc:
        logger.warning(f"Unable to reach Google Firebase certificate servers (offline/sandboxed): {exc}")
        return {}, 60


def _get_google_firebase_certs(force_refresh: bool = False) -> Dict[str, str]:
    """Returns cached Google Firebase x509 public certs, refreshing on expiry or unknown kid."""
    now = time.time()
    with _certs_lock:
        cached_certs = _certs_cache.get("certs") or {}
        expires_at = float(_certs_cache.get("expires_at") or 0.0)
        last_fetch_at = float(_certs_cache.get("last_fetch_at") or 0.0)
        if cached_certs and now < expires_at and (not force_refresh or (now - last_fetch_at) < 10.0):
            return dict(cached_certs)

    certs, max_age = _fetch_google_firebase_certs()
    with _certs_lock:
        fetched_at = time.time()
        _certs_cache["certs"] = dict(certs)
        _certs_cache["expires_at"] = fetched_at + max_age
        _certs_cache["last_fetch_at"] = fetched_at
    return dict(certs)


def warm_firebase_certs() -> bool:
    """Pre-fetches Google Firebase public certificates so initial logins have low latency."""
    if os.getenv("TESTING") == "true" or settings.ENVIRONMENT == "testing":
        return True
    project_id = (settings.FIREBASE_PROJECT_ID or "").strip().strip('"').strip("'")
    if not project_id or _firebase_live_cert_loaded:
        return False
    try:
        certs = _get_google_firebase_certs(force_refresh=False)
        logger.info(f"Pre-warmed {len(certs)} Google Firebase public certificate(s) for '{project_id}'.")
        return True
    except Exception as exc:
        logger.warning(f"Background warm of Google Firebase public certificates failed: {exc}")
        return False


def _decode_jwt_segment_unverified(segment: str) -> Dict[str, Any]:
    padded = segment + "=" * (-len(segment) % 4)
    raw = base64.urlsafe_b64decode(padded.encode("ascii"))
    parsed = json.loads(raw.decode("utf-8"))
    return parsed if isinstance(parsed, dict) else {}


def _extract_safe_token_diagnostics(token_str: str) -> Dict[str, Any]:
    """Extracts non-secret structural metadata from a JWT for server-side 401 diagnostics."""
    diag: Dict[str, Any] = {"now_epoch": int(time.time())}
    parts = token_str.split(".")
    if len(parts) != 3:
        diag["token_parts"] = len(parts)
        return diag
    try:
        header = _decode_jwt_segment_unverified(parts[0])
        diag["kid"] = header.get("kid")
        diag["alg"] = header.get("alg")
    except Exception:
        diag["header_error"] = True
    try:
        payload = _decode_jwt_segment_unverified(parts[1])
        diag["iss"] = payload.get("iss")
        diag["aud"] = payload.get("aud")
        diag["iat"] = payload.get("iat")
        diag["exp"] = payload.get("exp")
        diag["auth_time"] = payload.get("auth_time")
        diag["has_sub"] = bool(payload.get("sub"))
    except Exception:
        diag["payload_error"] = True
    return diag


def _verify_via_google_public_certs(
    token_str: str,
    project_id: str,
    clock_skew_seconds: int = 180,
) -> Dict[str, Any]:
    """Verifies real Firebase ID tokens using Google's official public x509 certificates."""
    clean_project_id = project_id.strip().strip('"').strip("'")
    header = google_jwt.decode_header(token_str)
    kid = header.get("kid") if isinstance(header, dict) else None

    certs = _get_google_firebase_certs(force_refresh=False)
    if kid and kid not in certs:
        certs = _get_google_firebase_certs(force_refresh=True)

    claims = google_jwt.decode(
        token_str,
        certs=certs,
        audience=clean_project_id,
        clock_skew_in_seconds=clock_skew_seconds,
    )
    expected_issuer = f"https://securetoken.google.com/{clean_project_id}"
    if claims.get("iss") != expected_issuer:
        raise ValueError(f"Unexpected Firebase token issuer: {claims.get('iss')}")
    uid = claims.get("user_id") or claims.get("sub")
    if not isinstance(uid, str) or not uid.strip():
        raise ValueError("Firebase token missing uid/sub claim.")
    normalized = dict(claims)
    normalized["uid"] = uid.strip()
    return normalized


async def verify_firebase_id_token(id_token: str) -> Dict[str, Any]:
    """Verifies a Firebase ID token.
    Uses Firebase Admin SDK when a service account certificate is loaded,
    or verifies Google-signed Firebase JWTs against Google public x509 certificates
    for the configured FIREBASE_PROJECT_ID.
    """
    if not id_token or not id_token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Firebase ID token not provided.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    token_str = id_token.strip()
    project_id = (settings.FIREBASE_PROJECT_ID or "").strip().strip('"').strip("'")
    last_err = ""

    is_jwt = token_str.count(".") == 2 and token_str.startswith("eyJ")

    # Fast-path for managed test / dev mock tokens (zero network overhead in testing/development)
    if (settings.ENVIRONMENT in ("testing", "development") or os.getenv("TESTING") == "true") and not is_jwt:
        if token_str.startswith("mock_token_") or "google" in token_str.lower() or "test" in token_str.lower() or "mock" in token_str.lower():
            uid = token_str.replace("Bearer ", "").replace("mock_token_", "")
            if not uid:
                uid = "usr_google_default_01"

            role = "STUDENT"
            if "super" in token_str.lower():
                role = "SUPER_ADMIN"
            elif "admin" in token_str.lower() or "dean" in token_str.lower():
                role = "ADMIN"

            clean_email = uid if "@" in uid else f"{uid}@campus.edu"
            name = uid.split("@")[0].replace("_", " ").replace(".", " ").title()

            return {
                "uid": uid,
                "email": clean_email,
                "name": name,
                "picture": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
                "role": role,
                "firebase": {"sign_in_provider": "google.com"}
            }

    init_firebase_admin()

    # 1. Full Firebase Admin SDK verification (when service account credentials are present)
    if _firebase_live_cert_loaded:
        try:
            return auth.verify_id_token(token_str, check_revoked=True)
        except Exception as live_err:
            last_err = str(live_err)

    # 2. Cryptographic JWT verification via Google Firebase public certificates
    elif project_id and token_str.count(".") == 2:
        try:
            return await asyncio.to_thread(_verify_via_google_public_certs, token_str, project_id)
        except Exception as cert_err:
            last_err = str(cert_err)
    else:
        last_err = "Token is not a valid Firebase JWT or service account not configured."

    diag = _extract_safe_token_diagnostics(token_str) if "." in token_str else {"token_format": "non-jwt"}
    diag["configured_project_id"] = project_id or None
    msg = f"[FirebaseAuth] 401 verification failed: {last_err} | diagnostics={json.dumps(diag)}"
    logger.warning(msg)
    print(msg, flush=True)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=f"Invalid, expired, or revoked Firebase ID token: {last_err}",
        headers={"WWW-Authenticate": "Bearer"}
    )


async def set_firebase_user_role(uid: str, role: str) -> None:
    """Assigns custom claims (role) to a user in Firebase Auth.
    Only privileged backend operations may execute this.
    """
    valid_roles = ["STUDENT", "ADMIN", "SUPER_ADMIN"]
    if role not in valid_roles:
        raise ValueError(f"Invalid role '{role}'. Must be one of {valid_roles}")

    init_firebase_admin()
    if not _firebase_live_cert_loaded:
        logger.debug(f"Skipping Firebase custom claim update for UID {uid}: no service account loaded.")
        return

    try:
        auth.set_custom_user_claims(uid, {"role": role})
        logger.info(f"Firebase custom claim set for UID {uid}: role={role}")
    except Exception as e:
        logger.warning(f"Could not set Firebase custom claims on live server: {e}")


async def revoke_firebase_user_sessions(uid: str) -> None:
    """Revokes all active refresh tokens for a user in Firebase."""
    init_firebase_admin()
    if not _firebase_live_cert_loaded:
        logger.debug(f"Skipping server-side Firebase session revocation for UID {uid}: no service account loaded.")
        return

    try:
        auth.revoke_refresh_tokens(uid)
        logger.info(f"Firebase sessions revoked for UID {uid}")
    except Exception as e:
        logger.warning(f"Could not revoke live Firebase session: {e}")
