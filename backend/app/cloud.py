"""Private cloud entrypoint; explicit configuration required before startup."""
import os
from pathlib import Path

from app.main import create_app
from app.deployment_security import PrivateDemoBoundary

database = os.environ.get("SENTINEL_DB_PATH", "")
if not database or not Path(database).is_absolute():
    raise RuntimeError("SENTINEL_DB_PATH must name an absolute persistent-disk database path")

# Synthetic execution and developer fixtures are deliberately not enabled by
# the hosted observation-only entrypoint. Authentication wraps every API route.
app = PrivateDemoBoundary(
    create_app(db_path=database, fixtures_enabled=False, demo_enabled=False),
    os.environ.get("SENTINEL_DEMO_TOKEN", ""),
    [x.strip() for x in os.environ.get("SENTINEL_ALLOWED_ORIGINS", "").split(",") if x.strip()],
)
