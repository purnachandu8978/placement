import argparse
import asyncio
import uuid
from datetime import datetime, timezone
from app.core.firebase import init_firebase_admin, set_firebase_user_role
from app.core.security import get_password_hash
from app.db.mongodb import mongo_manager
from app.db.seed import seed_mongodb_data


async def _set_role_async(email: str, role: str, uid: str | None = None):
    init_firebase_admin()
    await mongo_manager.connect()
    db = mongo_manager.db

    # Find user by email or UID
    user = None
    if email:
        user = await db.users.find_one({"email": email.lower().strip()})
    elif uid:
        user = await db.users.find_one({"firebase_uid": uid})

    firebase_uid = uid or (user.get("firebase_uid") if user else None)
    if not firebase_uid:
        firebase_uid = f"uid_{email.replace('@', '_').replace('.', '_')}"

    # 1. Assign Firebase Custom Claims
    await set_firebase_user_role(firebase_uid, role)

    # 2. Update MongoDB Atlas users collection
    now = datetime.now(timezone.utc)
    if user:
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"role": role, "last_updated": now}}
        )
    else:
        # Pre-seed user record
        await db.users.insert_one({
            "firebase_uid": firebase_uid,
            "email": email.lower().strip(),
            "display_name": email.split("@")[0].title(),
            "photo_url": None,
            "role": role,
            "account_status": "active",
            "created_at": now,
            "last_login": now
        })

    # Log action
    await db.admin_audit_logs.insert_one({
        "admin_uid": "cli-provisioner",
        "action": f"cli_provision_{role}",
        "target_id": firebase_uid,
        "timestamp": now,
        "details": {"email": email, "role": role}
    })

    await mongo_manager.close()
    print(f"\n[SUCCESS] Role '{role}' successfully assigned to '{email}' (UID: {firebase_uid}) via Firebase Custom Claims & MongoDB Atlas.")


async def _create_admin_async(email: str, password: str, name: str, role: str):
    if len(password or "") < 8:
        raise ValueError("Administrator password must be at least 8 characters long.")
    await mongo_manager.connect()
    db = mongo_manager.db
    cleaned_email = email.lower().strip()
    now = datetime.now(timezone.utc)
    existing = await db.users.find_one({"email": cleaned_email})
    uid = existing.get("firebase_uid") if existing else f"admin_{uuid.uuid4().hex[:20]}"
    password_hash = get_password_hash(password)

    if existing:
        await db.users.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "firebase_uid": uid,
                "display_name": name or existing.get("display_name") or "Placement Administrator",
                "role": role,
                "auth_provider": "admin_email_password",
                "password_hash": password_hash,
                "has_seen_tour": True,
                "account_status": "active",
                "last_updated": now,
            }}
        )
    else:
        await db.users.insert_one({
            "firebase_uid": uid,
            "email": cleaned_email,
            "display_name": name or "Placement Administrator",
            "photo_url": None,
            "role": role,
            "auth_provider": "admin_email_password",
            "password_hash": password_hash,
            "has_seen_tour": True,
            "account_status": "active",
            "created_at": now,
            "last_login": None,
        })

    await db.admin_audit_logs.insert_one({
        "admin_uid": "cli-provisioner",
        "action": f"cli_create_admin_{role}",
        "target_id": uid,
        "timestamp": now,
        "details": {"email": cleaned_email, "role": role}
    })
    await mongo_manager.close()
    print(f"\n[SUCCESS] {role} credentials provisioned for '{cleaned_email}' in MongoDB users collection.")


async def _seed_async():
    await mongo_manager.connect()
    await seed_mongodb_data(mongo_manager.db)
    await mongo_manager.close()
    print("\n[SUCCESS] MongoDB Atlas collections and strict assessments successfully seeded.")


def main():
    parser = argparse.ArgumentParser(description="Placement Intelligence Firebase & MongoDB Enterprise CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # set-role
    role_parser = subparsers.add_parser("set-role", help="Securely assigns Firebase custom claims and MongoDB user role")
    role_parser.add_argument("--email", required=True, help="Verified institutional email address")
    role_parser.add_argument("--role", default="SUPER_ADMIN", choices=["STUDENT", "ADMIN", "SUPER_ADMIN"], help="Target role")
    role_parser.add_argument("--uid", default=None, help="Optional specific Firebase UID")

    # create-admin
    admin_parser = subparsers.add_parser("create-admin", help="Creates or updates an Admin/SuperAdmin account with Argon2id password")
    admin_parser.add_argument("--email", required=True, help="Administrator email address")
    admin_parser.add_argument("--password", required=True, help="Administrator password (min 8 characters)")
    admin_parser.add_argument("--name", default="Head of Placements", help="Display name")
    admin_parser.add_argument("--role", default="SUPER_ADMIN", choices=["ADMIN", "SUPER_ADMIN"], help="Administrator role")

    # seed
    subparsers.add_parser("seed", help="Seeds MongoDB Atlas with baseline question banks and assessments")

    args = parser.parse_args()

    if args.command == "set-role":
        asyncio.run(_set_role_async(args.email, args.role, args.uid))
    elif args.command == "create-admin":
        asyncio.run(_create_admin_async(args.email, args.password, args.name, args.role))
    elif args.command == "seed":
        asyncio.run(_seed_async())


if __name__ == "__main__":
    main()
