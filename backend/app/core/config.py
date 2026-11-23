from pathlib import Path
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
WORKSPACE_ROOT = BACKEND_ROOT.parent


class Settings(BaseSettings):
    PROJECT_NAME: str = "Placement Intelligence API"
    VERSION: str = "2.0.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    MAINTENANCE_MODE: bool = False
    RATE_LIMIT_ENABLED: bool = True

    # JWT & Session Signing Configuration (used for Admin Email/Password sessions)
    SECRET_KEY: str = "dev-local-session-secret-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Optional Bootstrap Admin Account (from environment variables, never hardcoded)
    INITIAL_ADMIN_EMAIL: str = "admin@placement.edu"
    INITIAL_ADMIN_PASSWORD: str = "Admin@Placement2026!"
    INITIAL_ADMIN_NAME: str = "Placement Director"

    # Admin Two-Factor Authentication (Email Verification Code)
    ADMIN_MFA_ENABLED: bool = False
    ADMIN_OTP_EXPIRY_MINUTES: int = 10

    # SMTP Email Configuration for Dispatching OTP Codes
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_TLS: bool = True
    SMTP_SSL: bool = False
    EMAILS_FROM_EMAIL: str = "no-reply@placementintelligence.com"
    EMAILS_FROM_NAME: str = "Placement Intelligence Security"

    # MongoDB Atlas Configuration (official Motor async driver)
    MONGODB_URI: str = ""
    MONGODB_DB_NAME: str = "placement"
    MONGODB_MAX_POOL_SIZE: int = 50
    MONGODB_MIN_POOL_SIZE: int = 5
    MONGODB_MAX_IDLE_TIME_MS: int = 45000
    MONGODB_WAIT_QUEUE_TIMEOUT_MS: int = 5000

    # Set True during automated test runs to use in-memory mongomock
    USE_MOCK_MONGODB_FOR_TESTS: bool = False

    # Firebase Authentication (Admin SDK + Optional Web Client Mirror)
    FIREBASE_PROJECT_ID: str = ""
    FIREBASE_CREDENTIALS_PATH: Optional[str] = None
    FIREBASE_CREDENTIALS_JSON: Optional[str] = None
    # Allows managed development token verification when service account key is not configured locally
    FIREBASE_MOCK_AUTH_IN_DEV: bool = True

    # Optional Firebase Web SDK public config (mirrored for runtime frontend discovery)
    FIREBASE_WEB_API_KEY: str = ""
    FIREBASE_WEB_AUTH_DOMAIN: str = ""
    FIREBASE_WEB_STORAGE_BUCKET: str = ""
    FIREBASE_WEB_MESSAGING_SENDER_ID: str = ""
    FIREBASE_WEB_APP_ID: str = ""

    # CORS Configuration
    BACKEND_CORS_ORIGINS: List[str] = [
        "https://placement-intelligence-two.vercel.app",
        "https://placement-intelligence.vercel.app",
        "https://purnachandu8978.github.io",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:8000",
    ]

    # File Storage Configuration
    UPLOAD_DIR: str = "uploads/resumes"
    MAX_FILE_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB

    # Cloud Object Storage Configuration (Supabase, MongoDB Atlas, Firebase Storage, Cloudflare R2, AWS S3, Local)
    STORAGE_PROVIDER: str = "mongodb"  # "supabase", "mongodb", "gcs" (Google Cloud Storage), "firebase", "cloudflare_r2", "aws_s3", or "local"
    STORAGE_BUCKET_NAME: str = "placement-management-e89c7.firebasestorage.app"
    STORAGE_REGION: str = "auto"
    STORAGE_ENDPOINT_URL: Optional[str] = None
    STORAGE_ACCESS_KEY_ID: Optional[str] = None
    STORAGE_SECRET_ACCESS_KEY: Optional[str] = None
    STORAGE_SIGNED_URL_EXPIRATION_SECONDS: int = 900  # 15 minutes
    STORAGE_SIGNING_SECRET: str = "dev-storage-signing-secret-key-32b"

    # Supabase Cloud Storage Configuration (Free 1GB Permanent Cloud Storage)
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_STORAGE_BUCKET: str = "resumes"

    # Gemini AI API Configuration (Phase 3: Advanced AI-Powered Resume Intelligence)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.5-flash-lite"
    GEMINI_TIMEOUT_SECONDS: float = 30.0
    GEMINI_MAX_RETRIES: int = 3
    GEMINI_RATE_LIMIT_PER_MINUTE: int = 60
    GEMINI_TEMPERATURE: float = 0.2
    GEMINI_FALLBACK_ON_ERROR: bool = True

    # Firecrawl & Autonomous Job Discovery Configuration
    FIRECRAWL_API_KEY: Optional[str] = None
    FIRECRAWL_API_URL: str = "https://api.firecrawl.dev/v1"
    FIRECRAWL_MAX_DAILY_REQUESTS: int = 10  # Enforce free tier budget (max 10 requests / day)
    GEMINI_MAX_DAILY_REQUESTS: int = 50     # Free tier Gemini AI daily cap
    JUDGE0_MAX_DAILY_REQUESTS: int = 50     # Free tier code execution daily cap
    JOB_SYNC_INTERVAL_MINUTES: int = 30
    ENABLE_CONTINUOUS_NOTIFICATIONS: bool = True

    # Sandboxed Code Execution Engine Settings
    CODE_EXECUTION_MODE: str = "sandbox_service"  # "sandbox_service" or "judge0"
    SANDBOX_SERVICE_URL: str = "http://localhost:8088"
    SANDBOX_SHARED_SECRET: str = ""
    JUDGE0_API_URL: str = ""
    JUDGE0_AUTH_TOKEN: str = ""
    JUDGE0_RAPIDAPI_KEY: str = ""
    JUDGE0_RAPIDAPI_HOST: str = ""
    MAX_CODE_SIZE_BYTES: int = 65536
    MAX_STDIN_SIZE_BYTES: int = 16384
    SUBMISSION_RATE_LIMIT_PER_MIN: int = 15
    MAX_CONCURRENT_EXECUTIONS: int = 8
    EXECUTION_QUEUE_TIMEOUT_SECONDS: float = 10.0
    ALLOWED_EXTENSIONS: List[str] = [".pdf", ".docx", ".txt"]
    ALLOWED_MIME_TYPES: List[str] = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
    ]

    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
