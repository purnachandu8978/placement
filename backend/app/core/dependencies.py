from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional
from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.config import settings
from app.core.firebase import verify_firebase_id_token
from app.core.security import decode_token
from app.db.mongodb import get_database

security = HTTPBearer(auto_error=False)


def build_blank_student_profile(
    uid: str,
    full_name: str = "",
    email: str = "",
) -> Dict[str, Any]:
    """Creates a clean zero-state student profile with no fake pre-filled data."""
    return {
        "user_id": uid,
        "full_name": full_name,
        "email": email.lower().strip() if email else "",
        "phone": "",
        "college": "",
        "degree": "",
        "branch": "",
        "graduation_year": None,
        "semester": None,
        "cgpa": None,
        "backlogs": 0,
        "target_roles": [],
        "preferred_locations": [],
        "preferred_work_modes": [],
        "github_url": "",
        "linkedin_url": "",
        "portfolio_url": "",
        "updated_at": datetime.now(timezone.utc),
    }


async def get_token_from_request(
    request: Request,
    bearer: Optional[HTTPAuthorizationCredentials] = Depends(security),
    access_token_cookie: Optional[str] = Cookie(None, alias="access_token")
) -> str:
    """Extracts bearer token from Authorization header or secure HttpOnly cookie."""
    if bearer and bearer.credentials:
        return bearer.credentials
    if access_token_cookie:
        return access_token_cookie
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication credentials not provided. Please sign in.",
        headers={"WWW-Authenticate": "Bearer"}
    )


async def get_optional_user(
    request: Request,
    bearer: Optional[HTTPAuthorizationCredentials] = Depends(security),
    access_token_cookie: Optional[str] = Cookie(None, alias="access_token"),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> Optional[Dict[str, Any]]:
    """Extracts user if token is valid, otherwise returns None without raising 401."""
    token = bearer.credentials if bearer and bearer.credentials else access_token_cookie
    if not token:
        return None
    try:
        return await get_current_user(token=token, db=db)
    except Exception:
        return None


async def get_current_user(
    token: str = Depends(get_token_from_request),
    db: AsyncIOMotorDatabase = Depends(get_database)
) -> Dict[str, Any]:
    """Authenticates either:
    1. Admin Email/Password HS256 session JWTs (ADMIN / SUPER_ADMIN only).
    2. Firebase Google ID tokens (Students, plus test-mode admin tokens).
    """
    now = datetime.now(timezone.utc)

    # 1. Check backend-signed HS256 session JWT first (Admin MFA or Student Email/Password)
    session_claims = decode_token(token)
    if session_claims and session_claims.get("type") == "access":
        uid = session_claims.get("sub")
        if uid:
            session_user = await db.users.find_one({"firebase_uid": uid})
            if session_user:
                if session_user.get("account_status", "active") != "active":
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Account is disabled or suspended."
                    )
                session_user["_id"] = str(session_user["_id"])
                return session_user

    # 2. Firebase Google ID Token verification
    decoded_token = await verify_firebase_id_token(token)
    firebase_uid = decoded_token.get("uid")
    if not firebase_uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload is missing Firebase UID.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    user = await db.users.find_one({"firebase_uid": firebase_uid})

    if not user:
        role = decoded_token.get("role", "STUDENT") if settings.ENVIRONMENT == "testing" else "STUDENT"
        user_email = decoded_token.get("email", f"{firebase_uid}@campus.edu")
        display_name = decoded_token.get("name") or decoded_token.get("display_name") or user_email.split("@")[0]
        photo_url = decoded_token.get("picture") or decoded_token.get("photo_url")

        new_user = {
            "firebase_uid": firebase_uid,
            "email": user_email.lower().strip(),
            "display_name": display_name,
            "photo_url": photo_url,
            "role": role,
            "auth_provider": "google_firebase",
            "has_seen_tour": False,
            "account_status": "active",
            "created_at": now,
            "last_login": now
        }
        res = await db.users.insert_one(new_user)
        new_user["_id"] = str(res.inserted_id)

        if role == "STUDENT":
            await db.student_profiles.update_one(
                {"user_id": firebase_uid},
                {"$setOnInsert": build_blank_student_profile(firebase_uid, display_name, user_email)},
                upsert=True
            )

        user = new_user
    else:
        if user.get("role") in ("ADMIN", "SUPER_ADMIN") and settings.ENVIRONMENT != "testing":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Administrators must authenticate using email and password credentials."
            )

        await db.users.update_one({"_id": user["_id"]}, {"$set": {"last_login": now}})
        user["_id"] = str(user["_id"])

        if settings.ENVIRONMENT == "testing":
            token_role = decoded_token.get("role")
            if token_role and token_role != user.get("role"):
                user["role"] = token_role
                await db.users.update_one({"firebase_uid": firebase_uid}, {"$set": {"role": token_role}})

    if user.get("account_status") != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled or suspended."
        )

    return user


def require_role(allowed_roles: List[str]) -> Callable:
    """Enforces server-side role validation based on Firebase claims and MongoDB profile."""
    async def role_checker(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        user_role = current_user.get("role", "STUDENT")

        # SUPER_ADMIN has full permissions
        if user_role == "SUPER_ADMIN":
            return current_user

        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Requires one of roles: {', '.join(allowed_roles)}"
            )
        return current_user

    return role_checker


def verify_student_ownership(target_user_id: str, current_user: Dict[str, Any]) -> None:
    """Strict multi-user data isolation.
    Ensures that a student can only access documents belonging to their Firebase UID.
    Admins and SuperAdmins are authorized for faculty review.
    """
    user_role = current_user.get("role", "STUDENT")
    if user_role in ("ADMIN", "SUPER_ADMIN"):
        return  # Authorized administrative access

    current_uid = current_user.get("firebase_uid") or str(current_user.get("_id"))
    if str(target_user_id) != str(current_uid):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cross-user data access is strictly forbidden."
        )
