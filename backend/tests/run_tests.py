import os
import sys
from pathlib import Path
import asyncio

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# Set test environment flags immediately before any module imports
os.environ["ENVIRONMENT"] = "testing"
os.environ["USE_MOCK_MONGODB_FOR_TESTS"] = "true"
os.environ["FIREBASE_MOCK_AUTH_IN_DEV"] = "true"

# Add backend root to sys.path
backend_root = str(Path(__file__).resolve().parent.parent)
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

import tests.test_autonomous_job_engine as t

print("Executing Autonomous Job Engine Test Suite...", flush=True)
t.test_connector_interface_contracts()
print("  [PASS] Connector interface contracts (Internshala, LinkedIn, Indeed, Firecrawl, Greenhouse, Lever, Remotive, RSS)", flush=True)

t.test_url_validation_security()
print("  [PASS] URL validation security (rejection of javascript:, data:, file:)", flush=True)

t.test_match_separation_verified_vs_unverified()
print("  [PASS] 5-factor matching: strict separation of verified (40%) vs unverified resume mentions (25%)", flush=True)

t.test_excluded_companies_hard_filter()
print("  [PASS] Student preferences: excluded companies hard-filtered to 0.0 match", flush=True)

t.test_preferred_companies_bonus()
print("  [PASS] Student preferences: preferred companies receive explainable bonus", flush=True)

t.test_beginner_internship_weighting()
print("  [PASS] Beginner profile: adaptive weighting for internships and fresher roles", flush=True)

print("  >> Step 7: Starting distributed worker leases test...", flush=True)
asyncio.run(t.test_distributed_worker_lease_mutual_exclusion())
print("  [PASS] Distributed worker leases: atomic acquisition, lease expiry, and multi-worker mutual exclusion", flush=True)

print("\nAll 7 Autonomous Job Discovery Engine unit tests passed with 100% success rate!\n", flush=True)

print(">> Starting Phase 5 Test Suite...", flush=True)
import tests.test_phase5_runner as p5
asyncio.run(p5.run_phase5_tests())

print(">> Starting Phase 6 Test Suite...", flush=True)
import tests.test_phase6_runner as p6
asyncio.run(p6.run_phase6_tests())

print(">> Starting Master Prompt 1 Assignment Test Suite...", flush=True)
import tests.test_assignment_system_runner as asg_tests
asyncio.run(asg_tests.run_assignment_and_question_tests())

print(">> Starting Master Prompt 2 Admin Portal Test Suite...", flush=True)
import tests.test_admin_portal_runner as admin_tests
asyncio.run(admin_tests.run_admin_portal_tests())

print(">> Starting Phase 20-22 College Verification & India Startup Discovery Suite...", flush=True)
import pytest
res_code = pytest.main(["-q", "backend/tests/test_college_verification.py", "backend/tests/test_startup_discovery.py"])
assert res_code == 0, f"Verification & Startup Discovery tests failed with exit code {res_code}"

print(">> Starting Ultimate Master Test Suite (Identity, Templates, Serial Numbers, Signatures, Passport)...", flush=True)
res_code_master = pytest.main(["-q", "backend/tests/test_ultimate_master_suite.py"])
assert res_code_master == 0, f"Ultimate Master tests failed with exit code {res_code_master}"

print(">> Starting India Startup & Tech Opportunity Atlas Test Suite (GeoJSON, Multi-Source Tech Directory, Watchlist, Outreach)...", flush=True)
res_code_atlas = pytest.main(["-q", "backend/tests/test_startup_atlas_suite.py"])
assert res_code_atlas == 0, f"Startup Atlas tests failed with exit code {res_code_atlas}"

print(">> Starting Free-Tier API Quota Manager & Firecrawl Budget Preservation Suite...", flush=True)
res_code_quota = pytest.main(["-q", "backend/tests/test_quota_manager.py"])
assert res_code_quota == 0, f"Quota Manager tests failed with exit code {res_code_quota}"

print(">> Starting Unified Secure Examination System Suite...", flush=True)
import tests.test_examination_system as exam_tests
asyncio.run(exam_tests.test_examination_suite())

print("\n" + "=" * 70, flush=True)
print("ALL COMPREHENSIVE SUITE TESTS (ALL MODULES, PHASES & ATLAS) PASSED WITH 100% SUCCESS!", flush=True)
print("=" * 70, flush=True)

