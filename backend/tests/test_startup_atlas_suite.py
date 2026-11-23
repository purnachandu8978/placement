"""
Test Suite for India Startup & Tech Opportunity Atlas.
Validates:
1. Authentic Survey of India boundary GeoJSON (all 36 States & UTs).
2. Multi-source startup directory coverage (DPIIT & non-DPIIT, bootstrapped, funded, GenAI, deeptech).
3. State opportunity intelligence & district breakdowns.
4. Student career watchlists and expressed interest tracking.
5. Administrative campus outreach & MoU engagement logging.
"""

from __future__ import annotations

import os
import sys

if sys.platform == "win32":
    import asyncio
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

os.environ["ENVIRONMENT"] = "testing"
os.environ["USE_MOCK_MONGODB_FOR_TESTS"] = "true"

import pytest
from mongomock_motor import AsyncMongoMockClient

from app.schemas.startup import (
    CompanyClassification,
    CompanyVerificationStatus,
    DpiitStatus,
    HiringStatus,
    LocationPrecision,
)
from app.services.startup_discovery_service import (
    DEFAULT_INDIAN_STARTUPS,
    admin_create_startup,
    create_outreach_record,
    get_india_states_geojson,
    get_state_detail,
    get_student_saved_watchlist,
    list_outreach_records,
    seed_default_startups,
    toggle_student_watchlist,
)


@pytest.fixture
def mock_db():
    client = AsyncMongoMockClient()
    return client.test_placement_intelligence


def test_india_states_geojson_36_territories():
    """Verify that the official Survey of India GeoJSON covers all 36 States & Union Territories."""
    geojson = get_india_states_geojson()
    assert geojson is not None
    assert geojson.get("type") == "FeatureCollection"
    features = geojson.get("features", [])
    assert len(features) == 36, f"Expected 36 features (28 states + 8 UTs), got {len(features)}"

    state_names = [f["properties"]["state_name"] for f in features]
    assert "Karnataka" in state_names
    assert "Maharashtra" in state_names
    assert "Tamil Nadu" in state_names
    assert "Telangana" in state_names
    assert "NCT of Delhi" in state_names or "Delhi" in state_names
    assert "Gujarat" in state_names
    assert "Kerala" in state_names
    assert "Uttar Pradesh" in state_names

    # Check geometry types
    for f in features:
        geom_type = f.get("geometry", {}).get("type")
        assert geom_type in ("Polygon", "MultiPolygon")
        assert len(f["geometry"]["coordinates"]) > 0


def test_seed_startups_coverage_and_classifications():
    """Ensure multi-source startup directory covers bootstrapped, funded, product, and deep-tech companies."""
    names = [s["name"] for s in DEFAULT_INDIAN_STARTUPS]

    # Required companies from prompt
    assert "Sarvam AI" in names
    assert "Krutrim" in names
    assert "Zerodha" in names
    assert "Zoho Corporation" in names
    assert "Freshworks" in names
    assert "BrowserStack" in names
    assert "MapmyIndia" in names
    assert "Agnikul Cosmos" in names
    assert "Skyroot Aerospace" in names
    assert "Kuku FM" in names

    # Verify classification decoupling from DPIIT
    zerodha = next(s for s in DEFAULT_INDIAN_STARTUPS if s["name"] == "Zerodha")
    assert zerodha["company_classification"] == CompanyClassification.PRODUCT_COMPANY.value
    assert zerodha["dpiit_status"] == DpiitStatus.NOT_RECOGNISED.value
    assert zerodha["verification_status"] == CompanyVerificationStatus.GOVERNMENT_VERIFIED.value

    sarvam = next(s for s in DEFAULT_INDIAN_STARTUPS if s["name"] == "Sarvam AI")
    assert sarvam["company_classification"] == CompanyClassification.STARTUP.value
    assert sarvam["dpiit_status"] == DpiitStatus.RECOGNISED.value
    assert "CUDA" in sarvam["tech_stack"] or "Python" in sarvam["tech_stack"]


@pytest.mark.asyncio
async def test_seed_and_state_detail(mock_db):
    """Seed startups into mock DB and verify state-level intelligence calculation."""
    seeded = await seed_default_startups(mock_db)
    assert seeded >= 18

    # Query Karnataka state detail
    karnataka = await get_state_detail("Karnataka", mock_db)
    assert karnataka["state_name"] == "Karnataka"
    assert karnataka["total_companies"] >= 4
    assert karnataka["actively_hiring"] >= 2
    assert len(karnataka["companies"]) >= 4

    # Check district breakdown
    districts = [d["district"] for d in karnataka["districts"]]
    assert any("Bengaluru" in d for d in districts)

    # Check tech stack breakdown
    techs = [t["tech"] for t in karnataka["tech_stack_distribution"]]
    assert "Python" in techs or "PostgreSQL" in techs or "React" in techs


@pytest.mark.asyncio
async def test_student_watchlist_workflow(mock_db):
    """Test student saving startups, updating recruitment interest, and retrieving watchlist."""
    await seed_default_startups(mock_db)
    uid = "test_student_user_123"

    # 1. Save startup to watchlist
    res1 = await toggle_student_watchlist(
        user_id=uid,
        startup_id="startup_sarvam_ai",
        express_interest=True,
        preferred_role="ML Research Intern",
        db=mock_db,
    )
    assert res1["is_saved"] is True
    assert res1["express_interest"] is True

    # 2. Retrieve student watchlist
    my_list = await get_student_saved_watchlist(user_id=uid, db=mock_db)
    assert len(my_list) == 1
    assert my_list[0]["startup_id"] == "startup_sarvam_ai"
    assert my_list[0]["name"] == "Sarvam AI"
    assert my_list[0]["preferred_role"] == "ML Research Intern"

    # 3. Toggle off / remove
    res2 = await toggle_student_watchlist(
        user_id=uid,
        startup_id="startup_sarvam_ai",
        express_interest=True,
        preferred_role="ML Research Intern",
        db=mock_db,
    )
    assert res2["is_saved"] is False

    my_list_after = await get_student_saved_watchlist(user_id=uid, db=mock_db)
    assert len(my_list_after) == 0


@pytest.mark.asyncio
async def test_admin_outreach_logging(mock_db):
    """Test administrative university-to-company campus outreach recording."""
    admin_uid = "placement_officer_admin_1"

    outreach_payload = {
        "startup_id": "startup_sarvam_ai",
        "company_name": "Sarvam AI",
        "contact_person": "Aditi Roy",
        "contact_email": "careers@sarvam.ai",
        "contact_role": "Head of University Relations",
        "partnership_stage": "DISCUSSING_MOU",
        "notes": "Discussed campus pool drive for AI/ML graduating batch.",
        "target_branches": ["CSE", "AIML", "Data Science"],
        "expected_hires_count": 8,
    }

    created = await create_outreach_record(outreach_payload, admin_uid, mock_db)
    assert created["startup_id"] == "startup_sarvam_ai"
    assert created["partnership_stage"] == "DISCUSSING_MOU"
    assert created["created_by"] == admin_uid

    # List outreach records
    records = await list_outreach_records(mock_db)
    assert len(records) == 1
    assert records[0]["contact_person"] == "Aditi Roy"


@pytest.mark.asyncio
async def test_admin_manual_startup_creation(mock_db):
    """Test administrator manual registration and verification of an Indian tech company."""
    admin_uid = "placement_admin_007"
    new_startup_data = {
        "name": "Indus Microelectronics",
        "legal_name": "Indus Microelectronics Private Limited",
        "description": "Indigenous RISC-V semiconductor design and fabless chip development company.",
        "industry": "Semiconductors & VLSI",
        "sector": "DeepTech",
        "company_classification": CompanyClassification.STARTUP.value,
        "verification_status": CompanyVerificationStatus.INCUBATOR_VERIFIED.value,
        "dpiit_status": DpiitStatus.RECOGNISED.value,
        "location_precision": LocationPrecision.VERIFIED_CITY.value,
        "hq_city": "Noida",
        "hq_state": "Uttar Pradesh",
        "lat": 28.5355,
        "lng": 77.3910,
        "website": "https://indusmicro.in",
        "careers_url": "https://indusmicro.in/careers",
        "tech_stack": ["Verilog", "VHDL", "RISC-V", "C++", "SystemVerilog"],
        "founding_year": 2022,
        "dpiit_recognized": True,
        "funding_stage": "Seed ($3M)",
        "company_size": "20-50",
    }

    created = await admin_create_startup(new_startup_data, admin_uid, mock_db)
    assert created["name"] == "Indus Microelectronics"
    assert created["hq_state"] == "Uttar Pradesh"
    assert created["company_classification"] == "STARTUP"
    assert "RISC-V" in created["tech_stack"]


if __name__ == "__main__":
    import asyncio
    print("Running India Startup & Tech Opportunity Atlas Tests...", flush=True)
    test_india_states_geojson_36_territories()
    print("  [PASS] Survey of India GeoJSON: All 36 States & UTs verified", flush=True)

    test_seed_startups_coverage_and_classifications()
    print("  [PASS] Multi-source startup coverage & classification decoupling verified", flush=True)

    db = AsyncMongoMockClient().test_placement_intelligence
    asyncio.run(test_seed_and_state_detail(db))
    print("  [PASS] Seeding & state intelligence calculation verified", flush=True)

    db2 = AsyncMongoMockClient().test_placement_intelligence
    asyncio.run(test_student_watchlist_workflow(db2))
    print("  [PASS] Student watchlist & expressed interest workflow verified", flush=True)

    db3 = AsyncMongoMockClient().test_placement_intelligence
    asyncio.run(test_admin_outreach_logging(db3))
    print("  [PASS] Admin campus outreach & MoU logging verified", flush=True)

    db4 = AsyncMongoMockClient().test_placement_intelligence
    asyncio.run(test_admin_manual_startup_creation(db4))
    print("  [PASS] Admin manual startup registration verified", flush=True)

    print("\nALL 6 INDIA STARTUP & TECH ATLAS TESTS PASSED SUCCESSFULLY! (100% SUCCESS)", flush=True)

