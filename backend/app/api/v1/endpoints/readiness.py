"""
Placement Readiness Index calculation routes backed by MongoDB Atlas.
"""

from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_user
from app.db.mongodb import get_database
from app.services.resume_intelligence import compute_and_store_readiness

router = APIRouter()


@router.get("")
async def get_placement_readiness(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db=Depends(get_database),
):
    """Calculate and return authentic 0-100 Placement Readiness Index from MongoDB telemetry."""
    return await compute_and_store_readiness(current_user["firebase_uid"], db)
