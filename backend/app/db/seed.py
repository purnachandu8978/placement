"""
MongoDB Atlas idempotent seed script for Placement Intelligence.

Seeds platform reference data ONLY (job sources, realistic job listings, multi-skill assessment
templates from question_bank, and assignment templates). Never seeds fake student profiles or
default/hardcoded admin credentials. Optional INITIAL_ADMIN_EMAIL + INITIAL_ADMIN_PASSWORD
from environment variables will provision an institutional admin safely with Argon2id hashing.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from app.core.config import settings
from app.core.security import get_password_hash
from app.services.question_bank import build_assessment_for_skill

logger = logging.getLogger(__name__)


SEED_ASSESSMENT_SKILLS: List[tuple[str, str]] = [
    ("React", "Frontend"),
    ("TypeScript", "Frontend"),
    ("JavaScript", "Frontend"),
    ("Python", "Backend & APIs"),
    ("FastAPI", "Backend & APIs"),
    ("Node.js", "Backend & APIs"),
    ("MongoDB", "Databases"),
    ("PostgreSQL", "Databases"),
    ("Docker", "Cloud & DevOps"),
    ("System Design", "AI & Data Science"),
    ("Data Structures", "AI & Data Science"),
]


async def _bootstrap_env_admin(db: Any) -> None:
    """Provision initial admin ONLY if explicitly configured via environment variables."""
    email = (settings.INITIAL_ADMIN_EMAIL or "").strip().lower()
    password = (settings.INITIAL_ADMIN_PASSWORD or "").strip()
    if not email or not password:
        return

    existing = await db.users.find_one({"email": email})
    now = datetime.now(timezone.utc)
    if existing:
        await db.users.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "role": "SUPER_ADMIN",
                "auth_provider": "password",
                "password_hash": get_password_hash(password),
                "account_status": "active",
            }},
        )
        logger.info("Synchronized configured INITIAL_ADMIN_EMAIL %s as active SUPER_ADMIN", email)
        return

    digest = hashlib.sha256(email.encode("utf-8")).hexdigest()[:16]
    admin_uid = f"admin_{digest}"
    await db.users.insert_one({
        "firebase_uid": admin_uid,
        "email": email,
        "display_name": settings.INITIAL_ADMIN_NAME or "Placement Administrator",
        "photo_url": None,
        "role": "SUPER_ADMIN",
        "account_status": "active",
        "auth_provider": "password",
        "password_hash": get_password_hash(password),
        "has_seen_tour": True,
        "created_at": now,
        "last_login": None,
    })
    logger.info("Provisioned initial SUPER_ADMIN from environment: %s", email)


async def seed_mongodb_data(db: Any) -> None:
    """Seed reference collections idempotently into MongoDB Atlas."""
    now = datetime.now(timezone.utc)

    # 1. Optional environment-configured Super Admin bootstrap
    await _bootstrap_env_admin(db)

    # 2. Job Sources (idempotent by source_name)
    sources = [
        {"source_name": "Campus Placement Cell", "source_type": "internal", "base_url": "https://placements.edu", "sync_interval_minutes": 60, "is_active": True},
        {"source_name": "Greenhouse ATS Sync", "source_type": "ats", "base_url": "https://boards.greenhouse.io", "sync_interval_minutes": 180, "is_active": True},
        {"source_name": "Lever Jobs Sync", "source_type": "ats", "base_url": "https://jobs.lever.co", "sync_interval_minutes": 180, "is_active": True},
    ]
    for src in sources:
        await db.job_sources.update_one(
            {"source_name": src["source_name"]},
            {"$setOnInsert": {**src, "created_at": now}},
            upsert=True,
        )

    # 3. Multi-Skill Assessments (5Q and 10Q per core skill)
    for skill_name, category in SEED_ASSESSMENT_SKILLS:
        for size in (5, 10):
            assessment_doc = build_assessment_for_skill(skill_name=skill_name, category=category, size=size)
            await db.assessments.replace_one(
                {"id": assessment_doc["id"]},
                {**assessment_doc, "created_at": now, "updated_at": now},
                upsert=True,
            )

    # 4. Curated Jobs (idempotent by external_job_id)
    seed_jobs: List[Dict[str, Any]] = [
        {
            "external_job_id": "seed-swe-fullstack-01",
            "title": "Software Engineer - Full Stack (React & FastAPI)",
            "company": "FinEdge Systems",
            "location": "Bengaluru",
            "work_mode": "Hybrid",
            "salary": "14 - 20 LPA",
            "package_lpa": 17.0,
            "description": "Build resilient low-latency financial web dashboards and FastAPI microservices backed by MongoDB Atlas and Redis.",
            "required_skills": ["React", "TypeScript", "Python", "FastAPI", "MongoDB"],
            "eligibility": "2025/2026 Graduates, B.Tech/M.Tech CS/IT, CGPA >= 7.0",
            "original_apply_url": "https://boards.greenhouse.io/finedge/jobs/fullstack-01",
            "source_url": "https://placements.edu/jobs/finedge-01",
            "status": "active",
            "posted_at": now - timedelta(days=2),
        },
        {
            "external_job_id": "seed-backend-cloud-02",
            "title": "Backend Cloud Engineer (Python / Docker)",
            "company": "ScaleGrid Infrastructure",
            "location": "Hyderabad",
            "work_mode": "Remote",
            "salary": "16 - 24 LPA",
            "package_lpa": 20.0,
            "description": "Design distributed REST APIs, database indexing layers, and Dockerized CI/CD deployment pipelines.",
            "required_skills": ["Python", "PostgreSQL", "Docker", "REST APIs", "System Design"],
            "eligibility": "B.Tech/B.E. CS/ECE/IT, Strong DSA & Backend fundamentals",
            "original_apply_url": "https://jobs.lever.co/scalegrid/backend-cloud",
            "source_url": "https://placements.edu/jobs/scalegrid-02",
            "status": "active",
            "posted_at": now - timedelta(days=3),
        },
        {
            "external_job_id": "seed-frontend-ui-03",
            "title": "Frontend Platform Engineer (React / TypeScript)",
            "company": "Lumina AI Studio",
            "location": "Pune / Remote",
            "work_mode": "Remote",
            "salary": "12 - 18 LPA",
            "package_lpa": 15.0,
            "description": "Craft accessible, high-FPS React + TypeScript interfaces, Tailwind design systems, and state-driven analytics.",
            "required_skills": ["React", "TypeScript", "JavaScript", "Tailwind CSS", "Git"],
            "eligibility": "All CS/IT Branches, Portfolio & Verified Frontend Skills preferred",
            "original_apply_url": "https://boards.greenhouse.io/lumina/jobs/frontend-03",
            "source_url": "https://placements.edu/jobs/lumina-03",
            "status": "active",
            "posted_at": now - timedelta(days=1),
        },
        {
            "external_job_id": "seed-ai-engineer-04",
            "title": "Applied AI & Data Engineer",
            "company": "CortexLabs Analytics",
            "location": "Bengaluru",
            "work_mode": "Onsite",
            "salary": "18 - 26 LPA",
            "package_lpa": 22.0,
            "description": "Develop LLM evaluation pipelines, FastAPI inference APIs, and scalable Python data workflows.",
            "required_skills": ["Python", "Machine Learning", "LLM / GenAI", "FastAPI", "SQL"],
            "eligibility": "B.Tech/M.Tech with ML or GenAI project evidence",
            "original_apply_url": "https://jobs.lever.co/cortexlabs/ai-engineer",
            "source_url": "https://placements.edu/jobs/cortex-04",
            "status": "active",
            "posted_at": now - timedelta(days=4),
        },
        {
            "external_job_id": "seed-nodejs-sde-05",
            "title": "SDE-1 (Node.js & MongoDB)",
            "company": "NovaPay Commerce",
            "location": "Gurugram",
            "work_mode": "Hybrid",
            "salary": "13 - 19 LPA",
            "package_lpa": 16.0,
            "description": "Architect event-driven checkout APIs in Node.js, TypeScript, MongoDB, and Redis with automated integration tests.",
            "required_skills": ["Node.js", "TypeScript", "MongoDB", "Docker", "Data Structures"],
            "eligibility": "2025/2026 Batches, Zero active backlogs",
            "original_apply_url": "https://boards.greenhouse.io/novapay/jobs/sde1-node",
            "source_url": "https://placements.edu/jobs/novapay-05",
            "status": "active",
            "posted_at": now - timedelta(days=2),
        },
    ]

    for job in seed_jobs:
        await db.jobs.update_one(
            {"external_job_id": job["external_job_id"]},
            {
                "$set": {
                    **job,
                    "last_seen_at": now,
                    "expires_at": now + timedelta(days=60),
                    "content_hash": hashlib.sha256(job["external_job_id"].encode()).hexdigest()[:16],
                },
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )

    # 5. Global Assignment Templates (student-scoped = None so every student can submit individually)
    seed_assignments: List[Dict[str, Any]] = [
        {
            "template_key": "asg-react-state-dashboard",
            "title": "Build a Reactive Analytics Dashboard with Filtering & Optimistic State",
            "skill": "React",
            "difficulty": "Intermediate",
            "description": "Implement a modular React + TypeScript dashboard supporting search, debounced filtering, and clean error boundaries.",
            "deliverables": ["GitHub Repository URL", "Architecture Notes", "Screenshots / Live Link"],
            "estimated_hours": 5,
            "due_in_days": 10,
            "week_number": 1,
            "max_score": 100,
        },
        {
            "template_key": "asg-fastapi-mongo-crud",
            "title": "Design an Authenticated FastAPI + MongoDB REST Service with Rate Limiting",
            "skill": "Python",
            "difficulty": "Intermediate",
            "description": "Create an asynchronous FastAPI microservice with Pydantic validation, MongoDB Motor indexes, and pytest coverage.",
            "deliverables": ["GitHub Repository URL", "OpenAPI Spec / Test Output"],
            "estimated_hours": 6,
            "due_in_days": 14,
            "week_number": 2,
            "max_score": 100,
        },
        {
            "template_key": "asg-docker-cicd-pipeline",
            "title": "Containerize Full-Stack App with Multi-Stage Dockerfiles & Health Checks",
            "skill": "Docker",
            "difficulty": "Intermediate",
            "description": "Write optimized multi-stage Docker builds, docker-compose networking, and automated health check endpoints.",
            "deliverables": ["Dockerfile & Compose Link", "Build Size Benchmark"],
            "estimated_hours": 4,
            "due_in_days": 12,
            "week_number": 3,
            "max_score": 100,
        },
        {
            "template_key": "asg-system-design-url-shortener",
            "title": "Architect a High-Throughput URL Shortener & Analytics Engine",
            "skill": "System Design",
            "difficulty": "Advanced",
            "description": "Produce capacity calculations, sharding keys, Redis caching strategy, and collision-free base62 encoding design.",
            "deliverables": ["Architecture Document / Diagram URL", "Trade-off Analysis"],
            "estimated_hours": 5,
            "due_in_days": 14,
            "week_number": 4,
            "max_score": 100,
        },
        {
            "template_key": "asg-mongodb-aggregation-tuning",
            "title": "Optimize MongoDB Aggregation Pipelines & Compound Indexing Strategy",
            "skill": "MongoDB",
            "difficulty": "Intermediate",
            "description": "Design ESR-compliant compound indexes and explain-plan benchmarks for a multi-tenant student telemetry workload.",
            "deliverables": ["Pipeline Scripts / Repo Link", "Query Latency Notes"],
            "estimated_hours": 4,
            "due_in_days": 10,
            "week_number": 1,
            "max_score": 100,
        },
    ]

    # Clean legacy placeholders if present
    await db.assignments.delete_many({"user_id": "system"})

    for asg in seed_assignments:
        await db.assignments.update_one(
            {"template_key": asg["template_key"], "user_id": None},
            {
                "$set": {
                    **asg,
                    "user_id": None,
                    "deadline": (now + timedelta(days=asg["due_in_days"])).isoformat(),
                    "status": "open",
                    "updated_at": now,
                },
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )

    logger.info("MongoDB Atlas reference collections seeded cleanly.")


async def _run_cli() -> None:
    from app.db.mongodb import mongo_manager

    await mongo_manager.connect()
    try:
        if mongo_manager.db is not None:
            await seed_mongodb_data(mongo_manager.db)
    finally:
        await mongo_manager.close()


if __name__ == "__main__":
    asyncio.run(_run_cli())
