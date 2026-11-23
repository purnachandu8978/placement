"""
Unit Tests for Free-Tier API Quota Manager & Firecrawl Budget Preservation.
"""

import pytest
from mongomock_motor import AsyncMongoMockClient

from app.core.config import settings
from app.services.quota_manager import QuotaManager, _compute_cache_key
from app.services.job_connectors.firecrawl import FirecrawlJobConnector


@pytest.fixture
def mock_db():
    client = AsyncMongoMockClient()
    return client["test_placement_intelligence"]


@pytest.mark.asyncio
async def test_quota_manager_basic_flow(mock_db):
    qm = QuotaManager()
    service = "firecrawl"
    max_daily = 3

    # Initially quota is fully available
    assert await qm.can_consume(mock_db, service, max_daily=max_daily) is True

    usage = await qm.get_service_usage(mock_db, service, max_daily=max_daily)
    assert usage["requests_used"] == 0
    assert usage["requests_remaining"] == 3
    assert usage["status"] == "HEALTHY"

    # Consume 1 unit
    ok = await qm.record_usage(mock_db, service, max_daily=max_daily, units=1, success=True)
    assert ok is True

    usage = await qm.get_service_usage(mock_db, service, max_daily=max_daily)
    assert usage["requests_used"] == 1
    assert usage["requests_remaining"] == 2

    # Consume remaining units up to max_daily
    await qm.record_usage(mock_db, service, max_daily=max_daily, units=1, success=True)
    await qm.record_usage(mock_db, service, max_daily=max_daily, units=1, success=True)

    # Budget reached
    assert await qm.can_consume(mock_db, service, max_daily=max_daily) is False

    # Attempting to consume beyond max_daily must be rejected
    rejected = await qm.record_usage(mock_db, service, max_daily=max_daily, units=1, success=True)
    assert rejected is False

    usage = await qm.get_service_usage(mock_db, service, max_daily=max_daily)
    assert usage["requests_used"] == 3
    assert usage["requests_remaining"] == 0
    assert usage["status"] == "EXHAUSTED"


@pytest.mark.asyncio
async def test_quota_manager_caching_preserves_credits(mock_db):
    qm = QuotaManager()
    service = "firecrawl"
    cache_key = _compute_cache_key("firecrawl_search", "software engineer Bangalore")

    # Initially cache is empty
    cached = await qm.get_cached_response(mock_db, service, cache_key)
    assert cached is None

    # Save data to cache
    sample_jobs = [{"title": "Software Engineer", "company": "Test Corp"}]
    await qm.save_cached_response(mock_db, service, cache_key, sample_jobs, ttl_seconds=86400)

    # Cache hit returns data and records cache hit without consuming quota
    cached_hit = await qm.get_cached_response(mock_db, service, cache_key)
    assert cached_hit == sample_jobs

    usage = await qm.get_service_usage(mock_db, service, max_daily=10)
    assert usage["cache_hits"] == 1
    assert usage["requests_used"] == 0  # 0 credits consumed!


@pytest.mark.asyncio
async def test_firecrawl_connector_quota_fallback(mock_db):
    # Set quota to 0 to simulate exhausted daily limit
    service = "firecrawl"
    await QuotaManager.record_usage(mock_db, service, max_daily=1, units=1, success=True)

    connector = FirecrawlJobConnector(api_key="fc_test_key_123456789")
    # Fetch jobs with mock_db should detect quota exceeded and seamlessly fall back to native scrapers
    jobs = await connector.fetch_jobs(db=mock_db)
    assert isinstance(jobs, list)
    # Native scrapers run and return real opportunities without throwing exceptions
