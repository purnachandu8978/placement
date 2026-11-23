"""
Placement Intelligence - Standalone Autonomous Job Discovery & Alert Worker.

Executes continuous job synchronization and notification dispatch independently
of web request lifecycles. Can be deployed as a background daemon, Docker container,
or Render Background Worker.
"""

import asyncio
import logging
import signal
import sys
from app.core.config import settings
from app.core.firebase import init_firebase_admin
from app.db.mongodb import mongo_manager
from app.services.job_sync_service import JobSyncScheduler, seed_default_job_sources

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("placement_intelligence.worker")


async def run_worker():
    logger.info("Starting Placement Intelligence Background Discovery Worker...")
    init_firebase_admin()
    await mongo_manager.connect()

    if mongo_manager.db is None:
        logger.error("Failed to connect to MongoDB. Worker shutting down.")
        sys.exit(1)

    # Seed job sources if missing
    await seed_default_job_sources(mongo_manager.db)

    # Initialize distributed scheduler
    scheduler = JobSyncScheduler(mongo_manager.db, check_interval_seconds=30)
    scheduler.start()
    logger.info(f"Discovery Worker is running with ID: {scheduler.worker_id}")

    stop_event = asyncio.Event()

    def _signal_handler():
        logger.info("Shutdown signal received. Stopping worker...")
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _signal_handler)
        except NotImplementedError:
            # Signal handlers not implemented on Windows event loop
            pass

    try:
        while not stop_event.is_set():
            await asyncio.sleep(1)
    except (asyncio.CancelledError, KeyboardInterrupt):
        pass
    finally:
        logger.info("Cleaning up background discovery worker resources...")
        scheduler.stop()
        await mongo_manager.close()
        logger.info("Discovery Worker terminated cleanly.")


if __name__ == "__main__":
    asyncio.run(run_worker())
