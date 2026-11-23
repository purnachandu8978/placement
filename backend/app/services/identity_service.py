"""
Student Registration Identity System.
Generates and guarantees permanent, unique, collision-resistant Student Registration IDs.
Format: PI-STU-YYYY-XXXXXXXX (e.g. PI-STU-2027-E8F1A29D)
"""

from __future__ import annotations

from datetime import datetime, timezone
import logging
import secrets
from typing import Any, Dict, Optional

logger = logging.getLogger("placement_intelligence.identity")


def generate_student_registration_id(year: Optional[int] = None) -> str:
    """
    Generate a cryptographically secure, permanent Student Registration ID.
    Format: PI-STU-YYYY-XXXXXXXX
    - YYYY: Target graduating / academic cycle year (defaults to current or upcoming batch)
    - XXXXXXXX: 8-character cryptographically secure uppercase alphanumeric string
    """
    if year is None:
        now = datetime.now(timezone.utc)
        # Default to current or upcoming academic year (e.g. 2027)
        year = now.year if now.month < 6 else now.year + 1
        if year < 2026:
            year = 2027

    random_component = secrets.token_hex(4).upper()
    return f"PI-STU-{year}-{random_component}"


def generate_certificate_serial_number(level: str = "LEVEL_1_BLUE", year: Optional[int] = None) -> str:
    """
    Generate unique certificate serial number:
    - LEVEL_1_BLUE -> PI-CV5-YYYY-XXXXXXXX
    - LEVEL_2_GREEN -> PI-CV10-YYYY-XXXXXXXX
    """
    if year is None:
        year = datetime.now(timezone.utc).year
    prefix = "PI-CV10" if "LEVEL_2" in str(level).upper() or "GREEN" in str(level).upper() else "PI-CV5"
    token = secrets.token_hex(4).upper()
    return f"{prefix}-{year}-{token}"


def mask_registration_id(registration_id: Optional[str]) -> str:
    """
    Mask student registration ID for privacy in public verification views.
    Example: PI-STU-2027-E8F1A29D -> PI-STU-2027-****A29D
    """
    if not registration_id:
        return "PI-STU-****-XXXX"
    parts = registration_id.split("-")
    if len(parts) >= 4:
        code = parts[-1]
        return f"{'-'.join(parts[:-1])}-****{code[-4:]}"
    return registration_id[:4] + "****" + registration_id[-2:] if len(registration_id) > 6 else "PI-STU-****-XXXX"



async def allocate_student_registration_id(db: Any, user_id: str, year: Optional[int] = None) -> str:
    """
    Atomically allocates a globally unique Student Registration ID for a student user.
    Collision-resistant with retry loop and database unique index protection.
    """
    # 1. Check if student already has a permanent registration ID in student_profiles
    profile = await db.student_profiles.find_one({"user_id": user_id})
    if profile and profile.get("registration_id"):
        return profile["registration_id"]

    # 2. Check if student has it in users collection
    user = await db.users.find_one({"firebase_uid": user_id})
    if user and user.get("registration_id"):
        reg_id = user["registration_id"]
        # Sync back to profile
        await db.student_profiles.update_one(
            {"user_id": user_id},
            {"$set": {"registration_id": reg_id}},
            upsert=True
        )
        return reg_id

    # 3. Collision-resistant atomic allocation loop (max 5 retries for extreme safety)
    now = datetime.now(timezone.utc)
    for attempt in range(5):
        candidate_id = generate_student_registration_id(year=year)

        # Check in dedicated registration ID ledger
        existing_reg = await db.student_registration_ids.find_one({"registration_id": candidate_id})
        if existing_reg:
            logger.warning(f"Registration ID collision detected ({candidate_id}), retrying ({attempt + 1}/5)...")
            continue

        try:
            # Insert into identity ledger with unique index
            await db.student_registration_ids.insert_one({
                "registration_id": candidate_id,
                "user_id": user_id,
                "allocated_at": now,
                "status": "ACTIVE",
            })

            # Bind permanently to student_profiles and users
            await db.student_profiles.update_one(
                {"user_id": user_id},
                {
                    "$set": {
                        "registration_id": candidate_id,
                        "registration_id_allocated_at": now,
                    }
                },
                upsert=True,
            )

            await db.users.update_one(
                {"firebase_uid": user_id},
                {
                    "$set": {
                        "registration_id": candidate_id,
                        "registration_id_allocated_at": now,
                    }
                },
            )

            logger.info(f"Successfully allocated permanent Student Registration ID: {candidate_id} for user {user_id}")
            return candidate_id

        except Exception as e:
            # Handle rare duplicate key race condition
            logger.warning(f"Registration ID insert conflict for {candidate_id}: {e}")
            continue

    # Fallback to high-entropy 12-char identifier if 5 collisions occurred
    high_entropy_id = f"PI-STU-{year or 2027}-{secrets.token_hex(6).upper()}"
    await db.student_registration_ids.insert_one({
        "registration_id": high_entropy_id,
        "user_id": user_id,
        "allocated_at": now,
        "status": "ACTIVE",
    })
    await db.student_profiles.update_one(
        {"user_id": user_id},
        {"$set": {"registration_id": high_entropy_id, "registration_id_allocated_at": now}},
        upsert=True,
    )
    return high_entropy_id


async def get_or_ensure_student_registration_id(db: Any, user_id: str) -> str:
    """Helper to retrieve existing registration ID or allocate one if missing."""
    profile = await db.student_profiles.find_one({"user_id": user_id})
    if profile and profile.get("registration_id"):
        return profile["registration_id"]
    return await allocate_student_registration_id(db, user_id)

