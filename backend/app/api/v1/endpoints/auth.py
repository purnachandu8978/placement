from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from typing import Any, Dict, Optional, Union
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

from app.core.config import settings
from app.core.dependencies import build_blank_student_profile, get_current_user
from app.core.firebase import revoke_firebase_user_sessions, verify_firebase_id_token
from app.core.rate_limit import get_client_identifier, rate_limiter
from app.core.security import create_access_token, get_password_hash, verify_password
from app.db.mongodb import get_database
from app.services.email_service import send_admin_login_otp, send_password_reset_code
from app.services.identity_service import allocate_student_registration_id, get_or_ensure_student_registration_id

router = APIRouter()


class GoogleLoginRequest(BaseModel):
    id_token: str


class StudentRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., min_length=2, max_length=100)


class StudentLoginRequest(BaseModel):
    email: EmailStr
    password: str


class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str
    code: Optional[str] = None


class AdminVerifyOtpRequest(BaseModel):
    temp_token: str
    code: str


class AdminResendOtpRequest(BaseModel):
    temp_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordWithCodeRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=8)


class ChangePasswordRequest(BaseModel):
    current_password: Optional[str] = None
    new_password: str = Field(..., min_length=8)


class AdminMfaResponse(BaseModel):
    mfa_required: bool = True
    temp_token: str
    email_masked: str
    message: str
    otp_preview: Optional[str] = None


class AuthUserResponse(BaseModel):
    firebase_uid: str
    email: str
    display_name: str
    photo_url: Optional[str] = None
    role: str
    account_status: str
    token: str
    registration_id: Optional[str] = None
    is_new_user: bool = False
    has_seen_tour: bool = False
    auth_provider: str = "google_firebase"


def _mask_email(email: str) -> str:
    """Mask email for student/admin privacy: a***n@domain.com."""
    parts = email.split("@")
    if len(parts) != 2:
        return email
    username, domain = parts
    if len(username) <= 2:
        masked = username[0] + "*"
    else:
        masked = username[0] + "*" * (len(username) - 2) + username[-1]
    return f"{masked}@{domain}"


async def _record_login_event(
    db: AsyncIOMotorDatabase,
    request: Request,
    *,
    user_id: Optional[str],
    email: str,
    role: str,
    auth_method: str,
    status_str: str,
    failure_reason: Optional[str] = None,
) -> None:
    """Persists authentication audit trail in the dedicated user_logins MongoDB collection."""
    client_host = request.client.host if request.client else "unknown"
    user_agent = (request.headers.get("user-agent") or "")[:300]
    await db.user_logins.insert_one({
        "user_id": user_id,
        "email": email.lower().strip(),
        "role": role,
        "auth_method": auth_method,
        "status": status_str,
        "failure_reason": failure_reason,
        "ip_address": client_host,
        "user_agent": user_agent,
        "logged_in_at": datetime.now(timezone.utc),
        "logged_out_at": None,
    })


@router.post("/google", response_model=AuthUserResponse)
@router.post("/firebase-login", response_model=AuthUserResponse)
async def google_firebase_login(
    payload: GoogleLoginRequest,
    request: Request,
    response: Response,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Student Google Login flow:
    1. Verifies Firebase ID token (Google Sign-In exclusively for Students).
    2. Creates fresh zero-state user + empty student_profile on first sign-in.
    3. Records login event in user_logins collection and issues session cookie.
    """
    decoded = await verify_firebase_id_token(payload.id_token)
    firebase_uid = decoded.get("uid")
    email = (decoded.get("email") or f"{firebase_uid}@campus.edu").lower().strip()
    display_name = decoded.get("name") or decoded.get("display_name") or email.split("@")[0]
    photo_url = decoded.get("picture") or decoded.get("photo_url")
    claim_role = decoded.get("role") if settings.ENVIRONMENT == "testing" else "STUDENT"
    role = claim_role if claim_role in ("STUDENT", "ADMIN", "SUPER_ADMIN") else "STUDENT"

    now = datetime.now(timezone.utc)

    user = await db.users.find_one({"firebase_uid": firebase_uid})
    if not user:
        user = await db.users.find_one({"email": email})

    is_new_user = user is None

    if not user:
        if settings.ENVIRONMENT != "testing":
            role = "STUDENT"

        user_doc = {
            "firebase_uid": firebase_uid,
            "email": email,
            "display_name": display_name,
            "photo_url": photo_url,
            "role": role,
            "auth_provider": "google_firebase",
            "has_seen_tour": False if role == "STUDENT" else True,
            "account_status": "active",
            "created_at": now,
            "last_login": now
        }
        await db.users.insert_one(user_doc)

        if role == "STUDENT":
            await db.student_profiles.update_one(
                {"user_id": firebase_uid},
                {"$setOnInsert": build_blank_student_profile(firebase_uid, display_name, email)},
                upsert=True
            )
            await db.notifications.insert_one({
                "user_id": firebase_uid,
                "notification_type": "info",
                "title": "Welcome to Placement Intelligence",
                "message": "Your workspace starts fresh at 0%. Upload your resume in Resume Intelligence to extract skills, generate your 4-week roadmap, and unlock job matching.",
                "job_id": None,
                "read_status": False,
                "created_at": now
            })
        user = user_doc
    else:
        existing_role = user.get("role", "STUDENT")
        if existing_role in ("ADMIN", "SUPER_ADMIN") and settings.ENVIRONMENT != "testing":
            await _record_login_event(
                db,
                request,
                user_id=user.get("firebase_uid"),
                email=email,
                role=existing_role,
                auth_method="google_firebase",
                status_str="failed",
                failure_reason="Admin attempted Google sign-in; email/password required.",
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Administrators must sign in using institutional email and password."
            )

        effective_role = (
            claim_role
            if settings.ENVIRONMENT == "testing" and claim_role in ("STUDENT", "ADMIN", "SUPER_ADMIN")
            else existing_role
        )
        old_uid = user.get("firebase_uid")
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {
                "firebase_uid": firebase_uid,
                "last_login": now,
                "role": effective_role,
                "display_name": display_name or user.get("display_name"),
                "photo_url": photo_url or user.get("photo_url")
            }}
        )
        if old_uid and old_uid != firebase_uid:
            await db.student_profiles.update_many(
                {"user_id": old_uid},
                {"$set": {"user_id": firebase_uid}}
            )
        user["role"] = effective_role

    if user.get("account_status", "active") != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled or suspended.")

    has_seen_tour = bool(user.get("has_seen_tour", False))

    await _record_login_event(
        db,
        request,
        user_id=firebase_uid,
        email=user["email"],
        role=user.get("role", role),
        auth_method="google_firebase",
        status_str="success",
    )

    response.set_cookie(
        key="access_token",
        value=payload.id_token,
        httponly=True,
        max_age=86400,
        samesite="lax",
        secure=settings.ENVIRONMENT == "production"
    )

    registration_id: Optional[str] = None
    if user.get("role", role) == "STUDENT":
        registration_id = await get_or_ensure_student_registration_id(db, firebase_uid)

    return AuthUserResponse(
        firebase_uid=firebase_uid,
        email=user["email"],
        display_name=user.get("display_name", display_name),
        photo_url=user.get("photo_url", photo_url),
        role=user.get("role", role),
        account_status=user.get("account_status", "active"),
        token=payload.id_token,
        registration_id=registration_id,
        is_new_user=is_new_user,
        has_seen_tour=has_seen_tour,
        auth_provider="google_firebase",
    )


@router.post("/register", response_model=AuthUserResponse)
async def student_register(
    payload: StudentRegisterRequest,
    request: Request,
    response: Response,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Candidate Account Registration with username (email) and password:
    1. Enforces unique email check.
    2. Hashes password securely via Argon2id.
    3. Strictly enforces role="STUDENT" (cannot register as an admin).
    4. Initializes clean zero-state student profile.
    5. Issues authenticated session JWT token.
    """
    email = payload.email.lower().strip()
    full_name = payload.full_name.strip()

    # Rate limiting on registration: 10 registrations per 10 mins per IP
    client_ip = get_client_identifier(request)
    allowed, retry_after = await rate_limiter.check_rate_limit(f"reg:ip:{client_ip}", max_requests=10, window_seconds=600)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Registration rate limit reached. Please wait {retry_after} seconds before trying again.",
            headers={"Retry-After": str(retry_after)},
        )

    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists. Please sign in.",
        )

    now = datetime.now(timezone.utc)
    uid = f"usr_{uuid.uuid4().hex[:16]}"
    password_hash = get_password_hash(payload.password)

    user_doc = {
        "firebase_uid": uid,
        "email": email,
        "display_name": full_name,
        "photo_url": None,
        "role": "STUDENT",
        "auth_provider": "password",
        "password_hash": password_hash,
        "has_seen_tour": False,
        "account_status": "active",
        "created_at": now,
        "last_login": now,
    }
    await db.users.insert_one(user_doc)

    await db.student_profiles.update_one(
        {"user_id": uid},
        {"$setOnInsert": build_blank_student_profile(uid, full_name, email)},
        upsert=True,
    )
    await db.notifications.insert_one({
        "user_id": uid,
        "notification_type": "info",
        "title": "Welcome to Placement Intelligence",
        "message": "Your workspace starts fresh at 0%. Upload your resume in Resume Intelligence to extract skills, generate your 4-week roadmap, and unlock job matching.",
        "job_id": None,
        "read_status": False,
        "created_at": now,
    })

    access_token = create_access_token(
        subject=uid,
        role="STUDENT",
        extra_claims={"email": email, "auth_method": "student_email_password"},
    )

    await _record_login_event(
        db,
        request,
        user_id=uid,
        email=email,
        role="STUDENT",
        auth_method="student_email_password",
        status_str="success",
    )

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=86400,
        samesite="lax",
        secure=settings.ENVIRONMENT == "production",
    )

    registration_id = await allocate_student_registration_id(db, uid)

    return AuthUserResponse(
        firebase_uid=uid,
        email=email,
        display_name=full_name,
        photo_url=None,
        role="STUDENT",
        account_status="active",
        token=access_token,
        registration_id=registration_id,
        is_new_user=True,
        has_seen_tour=False,
        auth_provider="password",
    )


@router.post("/login", response_model=AuthUserResponse)
async def student_login(
    payload: StudentLoginRequest,
    request: Request,
    response: Response,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Candidate email and password authentication."""
    email = payload.email.lower().strip()
    client_ip = get_client_identifier(request)

    # Brute-force defense: check if IP or candidate email is locked
    locked_ip, retry_after_ip = await rate_limiter.is_locked(f"login:ip:{client_ip}")
    if locked_ip:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts from this network. Temporarily locked for {retry_after_ip} seconds.",
            headers={"Retry-After": str(retry_after_ip)},
        )

    locked_email, retry_after_email = await rate_limiter.is_locked(f"login:email:{email}")
    if locked_email:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Account temporarily locked due to multiple failed login attempts. Please wait {retry_after_email} seconds or reset your password.",
            headers={"Retry-After": str(retry_after_email)},
        )

    user = await db.users.find_one({"email": email})

    if not user or not user.get("password_hash"):
        await rate_limiter.record_failure(f"login:ip:{client_ip}", max_failures=5, lockout_seconds=900)
        await rate_limiter.record_failure(f"login:email:{email}", max_failures=5, lockout_seconds=900)
        await _record_login_event(
            db,
            request,
            user_id=user.get("firebase_uid") if user else None,
            email=email,
            role="STUDENT",
            auth_method="student_email_password",
            status_str="failed",
            failure_reason="User not found or password not configured.",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if user.get("role") in ("ADMIN", "SUPER_ADMIN"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator accounts must sign in via the Admin Portal (/admin/login).",
        )

    if not verify_password(payload.password, user["password_hash"]):
        await rate_limiter.record_failure(f"login:ip:{client_ip}", max_failures=5, lockout_seconds=900)
        await rate_limiter.record_failure(f"login:email:{email}", max_failures=5, lockout_seconds=900)
        await _record_login_event(
            db,
            request,
            user_id=user.get("firebase_uid"),
            email=email,
            role="STUDENT",
            auth_method="student_email_password",
            status_str="failed",
            failure_reason="Password mismatch.",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    # Authentication succeeded: reset failure counters
    await rate_limiter.reset_failures(f"login:ip:{client_ip}")
    await rate_limiter.reset_failures(f"login:email:{email}")

    if user.get("account_status", "active") != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled or suspended.")

    uid = user.get("firebase_uid") or f"student_{uuid.uuid4().hex[:20]}"
    now = datetime.now(timezone.utc)
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"last_login": now, "firebase_uid": uid}})

    access_token = create_access_token(
        subject=uid,
        role="STUDENT",
        extra_claims={"email": email, "auth_method": "student_email_password"},
    )

    await _record_login_event(
        db,
        request,
        user_id=uid,
        email=email,
        role="STUDENT",
        auth_method="student_email_password",
        status_str="success",
    )

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=86400,
        samesite="lax",
        secure=settings.ENVIRONMENT == "production",
    )

    registration_id = await get_or_ensure_student_registration_id(db, uid)

    return AuthUserResponse(
        firebase_uid=uid,
        email=email,
        display_name=user.get("display_name", email.split("@")[0]),
        photo_url=user.get("photo_url"),
        role="STUDENT",
        account_status=user.get("account_status", "active"),
        token=access_token,
        registration_id=registration_id,
        is_new_user=False,
        has_seen_tour=bool(user.get("has_seen_tour", False)),
        auth_provider="password",
    )


@router.post("/admin/login")
async def admin_email_password_login(
    payload: AdminLoginRequest,
    request: Request,
    response: Response,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Administrator Email & Password login with brute-force defense.
    Strictly verifies credentials and enforces RBAC isolation.
    """
    email = payload.email.lower().strip()
    client_ip = get_client_identifier(request)

    # Brute-force defense: verify lockout status for IP and admin account
    locked_ip, retry_after_ip = await rate_limiter.is_locked(f"admin_login:ip:{client_ip}")
    if locked_ip:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed administrator login attempts. Network locked for {retry_after_ip} seconds.",
            headers={"Retry-After": str(retry_after_ip)},
        )

    locked_email, retry_after_email = await rate_limiter.is_locked(f"admin_login:email:{email}")
    if locked_email:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Administrator account temporarily locked due to repeated failed logins. Please try again in {retry_after_email} seconds.",
            headers={"Retry-After": str(retry_after_email)},
        )

    user = await db.users.find_one({"email": email})

    if not user:
        await rate_limiter.record_failure(f"admin_login:ip:{client_ip}", max_failures=5, lockout_seconds=900)
        await rate_limiter.record_failure(f"admin_login:email:{email}", max_failures=5, lockout_seconds=900)
        await _record_login_event(
            db,
            request,
            user_id=None,
            email=email,
            role="UNKNOWN",
            auth_method="admin_email_password",
            status_str="failed",
            failure_reason="Administrator account not found.",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid administrator email or password."
        )

    if user.get("role") not in ("ADMIN", "SUPER_ADMIN"):
        await _record_login_event(
            db,
            request,
            user_id=user.get("firebase_uid"),
            email=email,
            role=user.get("role", "STUDENT"),
            auth_method="admin_email_password",
            status_str="failed",
            failure_reason="Non-admin attempted admin login.",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized. This portal is strictly restricted to authorized institutional administrators."
        )

    if not user.get("password_hash") or not verify_password(payload.password, user["password_hash"]):
        await rate_limiter.record_failure(f"admin_login:ip:{client_ip}", max_failures=5, lockout_seconds=900)
        await rate_limiter.record_failure(f"admin_login:email:{email}", max_failures=5, lockout_seconds=900)
        await _record_login_event(
            db,
            request,
            user_id=user.get("firebase_uid"),
            email=email,
            role=user.get("role", "ADMIN"),
            auth_method="admin_email_password",
            status_str="failed",
            failure_reason="Password mismatch.",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid administrator email or password."
        )

    if user.get("account_status", "active") != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator account is suspended.")

    # Reset lockout failures upon successful authentication
    await rate_limiter.reset_failures(f"admin_login:ip:{client_ip}")
    await rate_limiter.reset_failures(f"admin_login:email:{email}")

    # Direct Administrator Authentication (2FA removed; verification codes reserved for password reset)
    uid = user.get("firebase_uid") or f"admin_{uuid.uuid4().hex[:20]}"
    now = datetime.now(timezone.utc)
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"firebase_uid": uid, "last_login": now, "auth_provider": "password"}}
    )

    access_token = create_access_token(
        subject=uid,
        role=user["role"],
        extra_claims={"email": email, "auth_method": "admin_email_password"}
    )

    await _record_login_event(
        db,
        request,
        user_id=uid,
        email=email,
        role=user["role"],
        auth_method="admin_email_password",
        status_str="success",
    )

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=86400,
        samesite="lax",
        secure=settings.ENVIRONMENT == "production"
    )

    return AuthUserResponse(
        firebase_uid=uid,
        email=email,
        display_name=user.get("display_name", "Placement Administrator"),
        photo_url=user.get("photo_url"),
        role=user["role"],
        account_status=user.get("account_status", "active"),
        token=access_token,
        is_new_user=False,
        has_seen_tour=True,
        auth_provider="password",
    )


@router.post("/admin/verify-otp", response_model=AuthUserResponse)
async def admin_verify_otp(
    payload: AdminVerifyOtpRequest,
    request: Request,
    response: Response,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Verifies the 6-digit OTP code sent to admin's email and unlocks the Admin Console.
    Strictly denies login if the code does not match or has expired.
    """
    code = payload.code.strip()
    if len(code) != 6 or not code.isdigit():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code must be exactly 6 digits.",
        )

    otp_record = await db.admin_otps.find_one({"temp_token": payload.temp_token, "used": False})
    if not otp_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification session. Please sign in again.",
        )

    now = datetime.now(timezone.utc)
    expires_at = otp_record["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if now > expires_at:
        await db.admin_otps.delete_one({"_id": otp_record["_id"]})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has expired. Please sign in again.",
        )

    if otp_record.get("attempts", 0) >= 5:
        await db.admin_otps.delete_one({"_id": otp_record["_id"]})
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Maximum verification attempts exceeded. Please restart admin login.",
        )

    submitted_hash = hashlib.sha256(code.encode("utf-8")).hexdigest()
    if submitted_hash != otp_record["code_hash"]:
        await db.admin_otps.update_one(
            {"_id": otp_record["_id"]},
            {"$inc": {"attempts": 1}},
        )
        remaining = 5 - (otp_record.get("attempts", 0) + 1)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid verification code. {remaining} attempt(s) remaining.",
        )

    await db.admin_otps.update_one(
        {"_id": otp_record["_id"]},
        {"$set": {"used": True, "verified_at": now}},
    )

    email = otp_record["email"]
    user = await db.users.find_one({"email": email})
    if not user or user.get("role") not in ("ADMIN", "SUPER_ADMIN"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized administrator account.",
        )

    uid = user.get("firebase_uid") or f"admin_{uuid.uuid4().hex[:20]}"
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login": now, "firebase_uid": uid}},
    )

    access_token = create_access_token(
        subject=uid,
        role=user["role"],
        extra_claims={"email": email, "auth_method": "admin_mfa_email"},
    )

    await _record_login_event(
        db,
        request,
        user_id=uid,
        email=email,
        role=user["role"],
        auth_method="admin_mfa_email",
        status_str="success",
    )

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=86400,
        samesite="lax",
        secure=settings.ENVIRONMENT == "production",
    )

    return AuthUserResponse(
        firebase_uid=uid,
        email=email,
        display_name=user.get("display_name", "Placement Administrator"),
        photo_url=user.get("photo_url"),
        role=user["role"],
        account_status=user.get("account_status", "active"),
        token=access_token,
        is_new_user=False,
        has_seen_tour=True,
        auth_provider="password",
    )


@router.post("/admin/resend-otp")
async def admin_resend_otp(
    payload: AdminResendOtpRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Generates and re-dispatches a fresh 6-digit OTP code to the administrator."""
    otp_record = await db.admin_otps.find_one({"temp_token": payload.temp_token, "used": False})
    if not otp_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session has expired. Please log in again.",
        )

    now = datetime.now(timezone.utc)
    new_code = f"{secrets.randbelow(900000) + 100000}"
    expires_at = now + timedelta(minutes=settings.ADMIN_OTP_EXPIRY_MINUTES)

    await db.admin_otps.update_one(
        {"_id": otp_record["_id"]},
        {
            "$set": {
                "code_hash": hashlib.sha256(new_code.encode("utf-8")).hexdigest(),
                "expires_at": expires_at,
                "attempts": 0,
            }
        },
    )

    await send_admin_login_otp(otp_record["email"], new_code, settings.ADMIN_OTP_EXPIRY_MINUTES)

    return {
        "success": True,
        "message": f"A new verification code has been dispatched to {_mask_email(otp_record['email'])}.",
        "otp_preview": new_code if settings.ENVIRONMENT != "production" else None,
    }


@router.post("/forgot-password/send-code")
async def forgot_password_send_code(
    payload: ForgotPasswordRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Initiates the Forgot Password recovery flow.
    Generates a cryptographically random 6-digit numeric verification code
    and dispatches it via SMTP to the user's registered email address.
    """
    client_ip = get_client_identifier(request)
    allowed, retry_after = await rate_limiter.check_rate_limit(f"pwd_send:ip:{client_ip}", max_requests=5, window_seconds=600)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Password reset request limit reached. Please wait {retry_after} seconds before trying again.",
            headers={"Retry-After": str(retry_after)},
        )

    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})

    if not user:
        if settings.ENVIRONMENT == "production":
            return {
                "success": True,
                "message": f"If an account with this email address exists, a verification code has been dispatched.",
                "email_masked": _mask_email(email),
                "code_preview": None,
            }
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account associated with this email address was found. Please check your spelling or register.",
        )

    if user.get("account_status", "active") == "suspended":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been suspended. Please contact institutional placement administration.",
        )

    now = datetime.now(timezone.utc)
    code = f"{secrets.randbelow(900000) + 100000}"
    expires_at = now + timedelta(minutes=15)

    # Invalidate any existing unused reset codes for this email
    await db.password_resets.delete_many({"email": email, "used": False})

    # Store hashed reset verification record
    await db.password_resets.insert_one({
        "email": email,
        "user_id": user.get("firebase_uid"),
        "role": user.get("role", "STUDENT"),
        "code_hash": hashlib.sha256(code.encode("utf-8")).hexdigest(),
        "expires_at": expires_at,
        "attempts": 0,
        "used": False,
        "created_at": now,
    })

    # Dispatch code to user's dedicated email
    user_name = user.get("display_name") or user.get("full_name") or email.split("@")[0]
    await send_password_reset_code(
        to_email=email,
        code=code,
        user_name=user_name,
        expires_in_minutes=15,
    )

    masked = _mask_email(email)
    return {
        "success": True,
        "message": f"A 6-digit password reset verification code has been sent to {masked}.",
        "email_masked": masked,
        "code_preview": code if settings.ENVIRONMENT != "production" else None,
    }


@router.post("/forgot-password/verify-and-reset")
async def forgot_password_verify_and_reset(
    payload: ResetPasswordWithCodeRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Validates the 6-digit verification code sent to the user's dedicated email,
    enforces password security policies, hashes the new password with Argon2id,
    and updates the user's credentials in MongoDB.
    """
    client_ip = get_client_identifier(request)
    allowed, retry_after = await rate_limiter.check_rate_limit(f"pwd_verify:ip:{client_ip}", max_requests=10, window_seconds=600)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many verification attempts. Please wait {retry_after} seconds before trying again.",
            headers={"Retry-After": str(retry_after)},
        )

    email = payload.email.lower().strip()
    code = payload.code.strip()

    if len(code) != 6 or not code.isdigit():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code must be exactly 6 numeric digits.",
        )

    if len(payload.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters in length.",
        )

    record = await db.password_resets.find_one(
        {"email": email, "used": False},
        sort=[("created_at", -1)],
    )

    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset session. Please request a new verification code.",
        )

    now = datetime.now(timezone.utc)
    expires_at = record["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if now > expires_at:
        await db.password_resets.delete_one({"_id": record["_id"]})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The verification code has expired. Please request a fresh reset code.",
        )

    if record.get("attempts", 0) >= 5:
        await db.password_resets.delete_one({"_id": record["_id"]})
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Maximum verification attempts exceeded. For your security, please request a new code.",
        )

    submitted_hash = hashlib.sha256(code.encode("utf-8")).hexdigest()
    if submitted_hash != record["code_hash"]:
        await db.password_resets.update_one(
            {"_id": record["_id"]},
            {"$inc": {"attempts": 1}},
        )
        remaining = 5 - (record.get("attempts", 0) + 1)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Incorrect verification code. {remaining} attempt(s) remaining.",
        )

    # Verification successful: update user password hash in MongoDB Atlas
    new_hash = get_password_hash(payload.new_password)
    update_result = await db.users.update_one(
        {"email": email},
        {
            "$set": {
                "password_hash": new_hash,
                "auth_provider": "password",
                "password_updated_at": now,
            }
        },
    )

    if update_result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account not found to update password.",
        )

    # Invalidate reset code
    await db.password_resets.update_one(
        {"_id": record["_id"]},
        {"$set": {"used": True, "reset_completed_at": now}},
    )

    return {
        "success": True,
        "message": "Password successfully reset! You can now log in using your new password.",
    }


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Authenticated endpoint allowing logged-in students or administrators
    to change or set their password.
    """
    email = (current_user.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No email found in authentication credentials.",
        )

    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account not found.",
        )

    if len(payload.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters in length.",
        )

    # If the user already has a password hash, require verification of the existing password
    existing_hash = user.get("password_hash")
    if existing_hash:
        if not payload.current_password or not verify_password(payload.current_password, existing_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect. Please check and try again.",
            )

    now = datetime.now(timezone.utc)
    new_hash = get_password_hash(payload.new_password)

    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "password_hash": new_hash,
                "password_updated_at": now,
                "auth_provider": "password",
            }
        },
    )

    return {
        "success": True,
        "message": "Password successfully updated. Your new credentials are now active.",
    }


@router.post("/tour-complete")
async def mark_onboarding_tour_complete(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Marks the first-time guided onboarding tour as completed for the authenticated user."""
    uid = current_user.get("firebase_uid")
    await db.users.update_one(
        {"firebase_uid": uid},
        {"$set": {"has_seen_tour": True, "tour_completed_at": datetime.now(timezone.utc)}}
    )
    return {"success": True, "has_seen_tour": True}


@router.get("/firebase-config")
async def get_public_firebase_config():
    """Returns non-secret Firebase Web SDK client configuration for Google Sign-In."""
    api_key = (settings.FIREBASE_WEB_API_KEY or "").strip()
    project_id = (settings.FIREBASE_PROJECT_ID or "").strip()
    auth_domain = (settings.FIREBASE_WEB_AUTH_DOMAIN or "").strip() or (
        f"{project_id}.firebaseapp.com" if project_id else ""
    )
    storage_bucket = (settings.FIREBASE_WEB_STORAGE_BUCKET or "").strip() or (
        f"{project_id}.appspot.com" if project_id else ""
    )
    return {
        "live_enabled": bool(api_key and project_id),
        "apiKey": api_key,
        "authDomain": auth_domain,
        "projectId": project_id,
        "storageBucket": storage_bucket,
        "messagingSenderId": (settings.FIREBASE_WEB_MESSAGING_SENDER_ID or "").strip(),
        "appId": (settings.FIREBASE_WEB_APP_ID or "").strip(),
    }


@router.get("/me")
async def get_current_user_profile(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db = Depends(get_database),
):
    """Retrieves authenticated candidate/admin profile from MongoDB."""
    uid = current_user.get("firebase_uid")
    raw_profile = await db.student_profiles.find_one({"user_id": uid}) if uid else None
    if not raw_profile and current_user.get("email"):
        raw_profile = await db.student_profiles.find_one({"email": current_user["email"]})
    profile: Optional[Dict[str, Any]] = None
    if raw_profile:
        profile = {
            k: (v.isoformat() if hasattr(v, "isoformat") else v)
            for k, v in raw_profile.items()
            if k != "_id"
        }

    registration_id = (profile or {}).get("registration_id") or current_user.get("registration_id")
    if not registration_id and current_user.get("role") == "STUDENT" and uid:
        try:
            registration_id = await get_or_ensure_student_registration_id(db, uid)
            if profile:
                profile["registration_id"] = registration_id
        except Exception:
            pass

    return {
        "firebase_uid": uid,
        "email": current_user.get("email"),
        "display_name": current_user.get("display_name"),
        "photo_url": current_user.get("photo_url"),
        "role": current_user.get("role", "STUDENT"),
        "registration_id": registration_id,
        "account_status": current_user.get("account_status", "active"),
        "has_seen_tour": bool(current_user.get("has_seen_tour", False)),
        "auth_provider": current_user.get("auth_provider", "google_firebase"),
        "profile": profile,
    }


@router.post("/logout")
async def logout(
    response: Response,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Revokes session, updates login audit trail, and clears authentication cookies."""
    uid = current_user.get("firebase_uid")
    now = datetime.now(timezone.utc)
    if uid:
        latest_login = await db.user_logins.find_one(
            {"user_id": uid, "status": "success", "logged_out_at": None},
            sort=[("logged_in_at", -1)]
        )
        if latest_login:
            await db.user_logins.update_one(
                {"_id": latest_login["_id"]},
                {"$set": {"logged_out_at": now}}
            )
        if current_user.get("auth_provider", "google_firebase") == "google_firebase":
            await revoke_firebase_user_sessions(uid)
    response.delete_cookie("access_token")
    return {"success": True, "message": "Successfully logged out from session."}
