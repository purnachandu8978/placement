"""
Certificate Template Management API Endpoints.
Administrative control over dynamic certificate templates, placeholder validation,
and multi-stage approval lifecycle.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.dependencies import get_current_user, require_role
from app.db.mongodb import get_database
from app.schemas.certificate_template import (
    ApproveTemplateRequest,
    CertificateTemplateCreate,
    CertificateTemplateResponse,
    CertificateTemplateUpdate,
    PublishTemplateResponse,
)
from app.services.certificate_template_service import (
    approve_template,
    archive_template,
    create_template,
    get_active_published_template,
    get_template,
    list_templates,
    publish_template,
    submit_for_approval,
    update_template,
)

router = APIRouter()


@router.get("", response_model=List[CertificateTemplateResponse])
async def get_templates(
    status: Optional[str] = Query(None, description="Filter by status: DRAFT, APPROVED, PUBLISHED, ARCHIVED"),
    current_user: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "DEAN", "FACULTY"])),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """List all certificate design templates in the institutional repository."""
    return await list_templates(db, status=status)


@router.get("/active", response_model=CertificateTemplateResponse)
async def get_active_template(
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Retrieve the currently active published template used for new certificate issuance."""
    tmpl = await get_active_published_template(db)
    tmpl["id"] = str(tmpl.get("_id", tmpl.get("template_id")))
    return tmpl


@router.post("", response_model=CertificateTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_new_template(
    payload: CertificateTemplateCreate,
    current_user: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Create a new certificate template in DRAFT state."""
    admin_uid = current_user.get("firebase_uid", "admin")
    return await create_template(db, payload, admin_uid=admin_uid)


@router.get("/{template_id}", response_model=CertificateTemplateResponse)
async def get_template_details(
    template_id: str,
    current_user: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN", "DEAN", "FACULTY"])),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Get single certificate template by ID."""
    tmpl = await get_template(db, template_id)
    if not tmpl:
        raise HTTPException(status_code=404, detail="Certificate template not found.")
    return tmpl


@router.put("/{template_id}", response_model=CertificateTemplateResponse)
async def update_template_details(
    template_id: str,
    payload: CertificateTemplateUpdate,
    current_user: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Update a draft template before approval."""
    admin_uid = current_user.get("firebase_uid", "admin")
    try:
        return await update_template(db, template_id, payload, admin_uid=admin_uid)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{template_id}/submit-approval", response_model=CertificateTemplateResponse)
async def submit_template_for_approval(
    template_id: str,
    current_user: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Transition DRAFT -> PENDING_APPROVAL."""
    admin_uid = current_user.get("firebase_uid", "admin")
    try:
        return await submit_for_approval(db, template_id, admin_uid=admin_uid)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{template_id}/approve", response_model=CertificateTemplateResponse)
async def approve_certificate_template(
    template_id: str,
    payload: ApproveTemplateRequest,
    current_user: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Authorized administrator approves template for publication."""
    admin_uid = current_user.get("firebase_uid", "admin")
    try:
        return await approve_template(db, template_id, approver_uid=admin_uid, notes=payload.notes or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{template_id}/publish", response_model=PublishTemplateResponse)
async def publish_certificate_template(
    template_id: str,
    current_user: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Publish an approved template.
    Sets as active template for new certificate issuances.
    Archives previously published template to guarantee historical audit integrity.
    """
    admin_uid = current_user.get("firebase_uid", "admin")
    try:
        tmpl = await publish_template(db, template_id, admin_uid=admin_uid)
        return PublishTemplateResponse(
            success=True,
            template_id=tmpl["template_id"],
            version=tmpl.get("version", 1),
            status=tmpl["status"],
            published_at=tmpl.get("published_at", ""),
            message="Template published successfully and activated for institutional credentials."
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{template_id}/archive", response_model=CertificateTemplateResponse)
async def archive_certificate_template(
    template_id: str,
    current_user: Dict[str, Any] = Depends(require_role(["ADMIN", "SUPER_ADMIN"])),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Archive an outdated template."""
    admin_uid = current_user.get("firebase_uid", "admin")
    return await archive_template(db, template_id, admin_uid=admin_uid)
