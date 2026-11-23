"""
Placement Intelligence - Admin Provisioning CLI (`backend/app/scripts/create_admin.py`).
Idempotently provisions or updates the dedicated Super Administrator account in MongoDB Atlas.
"""

import asyncio
import hashlib
import sys
from datetime import datetime, timezone
from pathlib import Path

# Ensure backend root is on path
backend_dir = Path(__file__).resolve().parent.parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.config import settings
from app.core.security import get_password_hash
from app.db.mongodb import mongo_manager


async def main():
    email = (settings.INITIAL_ADMIN_EMAIL or "admin@placement.edu").strip().lower()
    password = (settings.INITIAL_ADMIN_PASSWORD or "Admin@Placement2026!").strip()
    name = (settings.INITIAL_ADMIN_NAME or "Placement Director").strip()

    print(f"Connecting to MongoDB Atlas ({settings.MONGODB_DB_NAME})...")
    await mongo_manager.connect()
    db = mongo_manager.db

    now = datetime.now(timezone.utc)
    existing = await db.users.find_one({"email": email})

    password_hash = get_password_hash(password)

    if existing:
        await db.users.update_one(
            {"_id": existing["_id"]},
            {
                "$set": {
                    "role": "SUPER_ADMIN",
                    "auth_provider": "password",
                    "password_hash": password_hash,
                    "account_status": "active",
                    "display_name": name,
                    "updated_at": now,
                }
            },
        )
        print(f"SUCCESS: Updated existing user '{email}' as active SUPER_ADMIN.")
    else:
        digest = hashlib.sha256(email.encode("utf-8")).hexdigest()[:16]
        admin_uid = f"admin_{digest}"
        doc = {
            "firebase_uid": admin_uid,
            "email": email,
            "display_name": name,
            "photo_url": None,
            "role": "SUPER_ADMIN",
            "account_status": "active",
            "auth_provider": "password",
            "password_hash": password_hash,
            "has_seen_tour": True,
            "created_at": now,
            "last_login": None,
        }
        await db.users.insert_one(doc)
        print(f"SUCCESS: Provisioned new SUPER_ADMIN user '{email}'.")

    print(f"Email: {email}")
    print(f"Role: SUPER_ADMIN")
    print(f"Password: {password}")
    await mongo_manager.close()


if __name__ == "__main__":
    asyncio.run(main())
