import time
import logging
import uuid
from contextlib import asynccontextmanager
import threading
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.firebase import init_firebase_admin, warm_firebase_certs
from app.db.mongodb import mongo_manager
from app.db.seed import seed_mongodb_data

logger = logging.getLogger("placement_intelligence.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize Firebase Admin SDK
    init_firebase_admin()
    if settings.ENVIRONMENT != "testing":
        threading.Thread(target=warm_firebase_certs, daemon=True).start()

    # Connect to MongoDB Atlas and ensure collections & indexes
    await mongo_manager.connect()

    # Seed baseline assessments, question banks, and jobs if needed (in non-testing environments)
    scheduler = None
    if mongo_manager.db is not None and settings.ENVIRONMENT != "testing":
        await seed_mongodb_data(mongo_manager.db)
        from app.services.job_sync_service import seed_default_job_sources, JobSyncScheduler
        await seed_default_job_sources(mongo_manager.db)
        from app.services.startup_discovery_service import seed_default_startups
        await seed_default_startups(mongo_manager.db)
        scheduler = JobSyncScheduler(mongo_manager.db)
        scheduler.start()

    yield

    if scheduler:
        scheduler.stop()

    # Clean shutdown of MongoDB connection pool
    if settings.ENVIRONMENT != "testing":
        await mongo_manager.close()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Placement Intelligence Enterprise API: Firebase Google Authentication & MongoDB Atlas Backend Engine",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

from app.core.middleware import add_security_headers, maintenance_mode_middleware

# Security Headers & Request Sanitation Middleware
app.middleware("http")(add_security_headers)
# Platform Maintenance Mode Middleware
app.middleware("http")(maintenance_mode_middleware)


# CORS Configuration
_whitelisted_origins = set(settings.BACKEND_CORS_ORIGINS)
_whitelisted_origins.update([
    "https://placement-intelligence-two.vercel.app",
    "https://placement-intelligence.vercel.app",
    "https://purnachandu8978.github.io",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
])

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(list(_whitelisted_origins)),
    allow_origin_regex=r"^https://([a-zA-Z0-9-]+\.)*vercel\.app$|^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,
)


@app.get("/", tags=["Root"])
async def root():
    """Root status endpoint directing developers and browsers to Swagger Docs or Frontend."""
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "message": "Placement Intelligence API is online and healthy.",
        "frontend_application_url": "http://localhost:5173",
        "interactive_api_docs": "http://localhost:8000/docs",
        "health_endpoint": f"{settings.API_V1_STR}/health",
    }


from app.core.observability import compute_health_status


@app.get("/health", tags=["Health"])
@app.get(f"{settings.API_V1_STR}/health", tags=["Health"])
async def health_check():
    """Health check endpoint for container orchestrators, verifying MongoDB, storage, and worker connectivity."""
    return await compute_health_status()


# Mount Versioned API Router
app.include_router(api_router, prefix=settings.API_V1_STR)

# Also mount auth router directly under /auth as root alias for clients calling /auth without /api/v1 prefix
from app.api.v1.endpoints.auth import router as auth_router
app.include_router(auth_router, prefix="/auth", tags=["Authentication (Root Alias)"])


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "detail": exc.detail},
        headers=exc.headers,
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    error_id = f"err_{uuid.uuid4().hex[:12]}"
    logger.exception(f"Unhandled server error [{error_id}] on {request.method} {request.url.path}: {exc}")
    detail = (
        "An internal server error occurred. Our engineering team has been notified."
        if settings.ENVIRONMENT == "production"
        else f"Internal server error: {str(exc)}"
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"success": False, "detail": detail, "request_id": error_id}
    )
