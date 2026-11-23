"""
Certificate Template Management Service.
Handles template authoring, placeholder resolution, versioning,
multi-stage approval lifecycle, and active published template resolution.
"""

from __future__ import annotations

from datetime import datetime, timezone
import logging
import uuid
from typing import Any, Dict, List, Optional
from app.schemas.certificate_template import (
    APPROVED_PLACEHOLDERS,
    CertificateTemplateCreate,
    CertificateTemplateUpdate,
    TemplateStatus,
)

logger = logging.getLogger("placement_intelligence.templates")

DEFAULT_INSTITUTIONAL_TEMPLATE: Dict[str, Any] = {
    "template_id": "tmpl_institutional_standard_v1",
    "name": "Official Institutional Placement Authority Standard Template",
    "description": "Primary landscape certificate template for 5-minute Blue and 10-minute Green college verified credentials.",
    "version": 1,
    "status": TemplateStatus.PUBLISHED.value,
    "is_published": True,
    "orientation": "LANDSCAPE",
    "width_mm": 297.0,
    "height_mm": 210.0,
    "background_color": "#FFFFFF",
    "border_color": "#2563EB",
    "primary_color": "#0F172A",
    "accent_color": "#2563EB",
    "font_family": "Helvetica",
    "logo_url": "https://images.unsplash.com/photo-1592280771190-3e2e4d571952?auto=format&fit=crop&w=256&q=80",
    "institution_name": "Placement Intelligence Digital Credential Authority",
    "signatory_name": "Dr. Rajesh V. Ramanathan",
    "signatory_title": "Dean of Academic Affairs & Placement Authority",
    "signatory_department": "Division of Career & Placement Intelligence",
    "custom_headline": "OFFICIAL CERTIFICATE OF COLLEGE VERIFIED COMPETENCY",
    "subtext_template": "This is to certify that {{student_name}} (Student Reg ID: {{student_registration_id}}) has successfully passed the official proctored competency evaluation in {{skills_assessed}} with a score of {{assessment_score}}%.",
    "show_qr_code": True,
    "show_serial_number": True,
    "qr_position_x_mm": 240.0,
    "qr_position_y_mm": 35.0,
    "created_by": "system_bootstrap",
    "approved_by": "system_authority",
    "published_at": datetime.now(timezone.utc),
    "created_at": datetime.now(timezone.utc),
    "updated_at": datetime.now(timezone.utc),
}


async def seed_default_templates(db: Any) -> None:
    """Ensure baseline published template exists in MongoDB."""
    existing = await db.certificate_templates.find_one({"is_published": True})
    if not existing:
        await db.certificate_templates.update_one(
            {"template_id": DEFAULT_INSTITUTIONAL_TEMPLATE["template_id"]},
            {"$setOnInsert": DEFAULT_INSTITUTIONAL_TEMPLATE},
            upsert=True,
        )
        logger.info("Seeded default published certificate template v1.")


async def list_templates(db: Any, status: Optional[str] = None) -> List[Dict[str, Any]]:
    """List all certificate templates ordered by created_at desc."""
    query = {}
    if status and status != "all":
        query["status"] = status
    cursor = db.certificate_templates.find(query).sort("created_at", -1)
    results = []
    async for doc in cursor:
        doc["id"] = str(doc.get("_id", doc.get("template_id")))
        doc["created_at"] = doc.get("created_at", datetime.now(timezone.utc)).isoformat()
        doc["updated_at"] = doc.get("updated_at", datetime.now(timezone.utc)).isoformat()
        if doc.get("published_at"):
            doc["published_at"] = doc["published_at"].isoformat() if isinstance(doc["published_at"], datetime) else str(doc["published_at"])
        results.append(doc)
    return results


async def get_template(db: Any, template_id: str) -> Optional[Dict[str, Any]]:
    """Get single certificate template by template_id."""
    doc = await db.certificate_templates.find_one({
        "$or": [{"template_id": template_id}, {"id": template_id}]
    })
    if doc:
        doc["id"] = str(doc.get("_id", doc.get("template_id")))
        doc["created_at"] = doc.get("created_at", datetime.now(timezone.utc)).isoformat()
        doc["updated_at"] = doc.get("updated_at", datetime.now(timezone.utc)).isoformat()
        if doc.get("published_at"):
            doc["published_at"] = doc["published_at"].isoformat() if isinstance(doc["published_at"], datetime) else str(doc["published_at"])
    return doc


async def get_active_published_template(db: Any) -> Dict[str, Any]:
    """Retrieves currently active published template, falling back to default."""
    tmpl = await db.certificate_templates.find_one({"is_published": True, "status": TemplateStatus.PUBLISHED.value})
    if not tmpl:
        await seed_default_templates(db)
        tmpl = await db.certificate_templates.find_one({"is_published": True}) or DEFAULT_INSTITUTIONAL_TEMPLATE
    doc = dict(tmpl)
    doc["id"] = str(doc.get("_id", doc.get("template_id")))
    if isinstance(doc.get("created_at"), datetime):
        doc["created_at"] = doc["created_at"].isoformat()
    if isinstance(doc.get("updated_at"), datetime):
        doc["updated_at"] = doc["updated_at"].isoformat()
    if isinstance(doc.get("published_at"), datetime):
        doc["published_at"] = doc["published_at"].isoformat()
    return doc


async def create_template(db: Any, payload: CertificateTemplateCreate, admin_uid: str) -> Dict[str, Any]:
    """Create a new certificate template in DRAFT state."""
    now = datetime.now(timezone.utc)
    template_id = f"tmpl_{uuid.uuid4().hex[:12]}"

    doc = {
        **payload.model_dump(),
        "template_id": template_id,
        "version": 1,
        "status": TemplateStatus.DRAFT.value,
        "is_published": False,
        "created_by": admin_uid,
        "approved_by": None,
        "published_at": None,
        "created_at": now,
        "updated_at": now,
        "approval_notes": None,
    }

    await db.certificate_templates.insert_one(doc)
    doc["id"] = str(doc.get("_id", template_id))
    doc["created_at"] = now.isoformat()
    doc["updated_at"] = now.isoformat()
    return doc


async def update_template(
    db: Any, template_id: str, payload: CertificateTemplateUpdate, admin_uid: str
) -> Dict[str, Any]:
    """Updates an existing draft template. Published templates cannot be silently overwritten."""
    tmpl = await get_template(db, template_id)
    if not tmpl:
        raise ValueError("Certificate template not found.")
    if tmpl.get("status") in (TemplateStatus.PUBLISHED.value, TemplateStatus.ARCHIVED.value):
        raise ValueError("Published or archived templates cannot be modified directly. Create a new draft version.")

    update_fields = {k: v for k, v in payload.model_dump().items() if v is not None}
    update_fields["updated_at"] = datetime.now(timezone.utc)

    await db.certificate_templates.update_one(
        {"template_id": template_id},
        {"$set": update_fields}
    )
    return await get_template(db, template_id) or {}


async def submit_for_approval(db: Any, template_id: str, admin_uid: str) -> Dict[str, Any]:
    """Transition DRAFT -> PENDING_APPROVAL."""
    tmpl = await get_template(db, template_id)
    if not tmpl:
        raise ValueError("Certificate template not found.")
    if tmpl.get("status") != TemplateStatus.DRAFT.value:
        raise ValueError(f"Only DRAFT templates can be submitted for approval (current status: {tmpl.get('status')}).")

    now = datetime.now(timezone.utc)
    await db.certificate_templates.update_one(
        {"template_id": template_id},
        {
            "$set": {
                "status": TemplateStatus.PENDING_APPROVAL.value,
                "updated_at": now,
            }
        }
    )
    return await get_template(db, template_id) or {}


async def approve_template(db: Any, template_id: str, approver_uid: str, notes: str = "") -> Dict[str, Any]:
    """Transition PENDING_APPROVAL -> APPROVED."""
    tmpl = await get_template(db, template_id)
    if not tmpl:
        raise ValueError("Certificate template not found.")
    if tmpl.get("status") not in (TemplateStatus.PENDING_APPROVAL.value, TemplateStatus.DRAFT.value):
        raise ValueError(f"Template status {tmpl.get('status')} cannot be approved.")

    now = datetime.now(timezone.utc)
    await db.certificate_templates.update_one(
        {"template_id": template_id},
        {
            "$set": {
                "status": TemplateStatus.APPROVED.value,
                "approved_by": approver_uid,
                "approval_notes": notes,
                "updated_at": now,
            }
        }
    )
    return await get_template(db, template_id) or {}


async def publish_template(db: Any, template_id: str, admin_uid: str) -> Dict[str, Any]:
    """
    Transition APPROVED -> PUBLISHED.
    Archives previously published template to guarantee historical audit integrity.
    """
    tmpl = await get_template(db, template_id)
    if not tmpl:
        raise ValueError("Certificate template not found.")
    if tmpl.get("status") not in (TemplateStatus.APPROVED.value, TemplateStatus.DRAFT.value):
        raise ValueError(f"Template must be approved before publication (current status: {tmpl.get('status')}).")

    now = datetime.now(timezone.utc)

    # 1. Archive previous published template
    await db.certificate_templates.update_many(
        {"is_published": True},
        {"$set": {"is_published": False, "status": TemplateStatus.ARCHIVED.value, "updated_at": now}}
    )

    # 2. Publish new template
    await db.certificate_templates.update_one(
        {"template_id": template_id},
        {
            "$set": {
                "status": TemplateStatus.PUBLISHED.value,
                "is_published": True,
                "published_at": now,
                "approved_by": tmpl.get("approved_by") or admin_uid,
                "updated_at": now,
            }
        }
    )
    return await get_template(db, template_id) or {}


async def archive_template(db: Any, template_id: str, admin_uid: str) -> Dict[str, Any]:
    """Archive an old template."""
    now = datetime.now(timezone.utc)
    await db.certificate_templates.update_one(
        {"template_id": template_id},
        {"$set": {"status": TemplateStatus.ARCHIVED.value, "is_published": False, "updated_at": now}}
    )
    return await get_template(db, template_id) or {}


def resolve_certificate_text(subtext_template: str, context: Dict[str, Any]) -> str:
    """
    Replaces approved placeholders with sanitized evaluation context data.
    """
    resolved = subtext_template or ""
    for placeholder in APPROVED_PLACEHOLDERS:
        key = placeholder.strip("{}")
        val = str(context.get(key, ""))
        resolved = resolved.replace(placeholder, val)
    return resolved
