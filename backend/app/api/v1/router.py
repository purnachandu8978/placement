from fastapi import APIRouter
from app.api.v1.endpoints import (
    admin,
    admin_jobs,
    assessments,
    assignments,
    attempts,
    auth,
    job_matches,
    jobs,
    notifications,
    questions,
    readiness,
    resumes,
    results,
    roadmaps,
    skills,
    students,
    submissions,
    users,
    verification,
    startups,
    certificate_templates,
    passport,
    examination,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(students.router, prefix="/students", tags=["Students"])
api_router.include_router(resumes.router, prefix="/resumes", tags=["Resumes"])
api_router.include_router(skills.router, prefix="/skills", tags=["Skills"])
api_router.include_router(assessments.router, prefix="/assessments", tags=["Assessments"])
api_router.include_router(questions.router, prefix="/questions", tags=["Questions"])
api_router.include_router(attempts.router, prefix="/attempts", tags=["Attempts"])
api_router.include_router(results.router, prefix="/results", tags=["Results"])
api_router.include_router(roadmaps.router, prefix="/roadmaps", tags=["Roadmaps"])
api_router.include_router(assignments.router, prefix="/assignments", tags=["Assignments"])
api_router.include_router(submissions.router, prefix="/submissions", tags=["Submissions"])
api_router.include_router(verification.router, prefix="/verification", tags=["Verification"])
api_router.include_router(templates_router := certificate_templates.router, prefix="/templates", tags=["Certificate Templates"])
api_router.include_router(passport.router, prefix="/passport", tags=["Career Passport"])
api_router.include_router(jobs.router, prefix="/jobs", tags=["Jobs"])
api_router.include_router(job_matches.router, prefix="/job-matches", tags=["Job Matches"])
api_router.include_router(readiness.router, prefix="/readiness", tags=["Placement Readiness"])
api_router.include_router(admin.router, prefix="/admin", tags=["Administration"])
api_router.include_router(admin_jobs.router, prefix="/admin/jobs", tags=["Admin Job Discovery"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])
api_router.include_router(startups.router, prefix="/startups", tags=["India Startups"])
api_router.include_router(examination.router, prefix="/examination", tags=["Unified Examination Engine"])

