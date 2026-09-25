"""Deployment-only same-origin shell for the unchanged Sentinel application."""

from fastapi.staticfiles import StaticFiles

from app.main import app


app.mount("/", StaticFiles(directory="/app/frontend/dist", html=True), name="frontend")
