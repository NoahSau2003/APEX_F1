"""Apex F1 historical data API. Run: uvicorn app.main:app --reload"""

import logging

import fastf1
from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.routes import catalog, sessions
from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.schemas.models import Health

VERSION = "0.2.0"
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

settings = get_settings()
app = FastAPI(
    title="Apex F1 Historical API",
    version=VERSION,
    description="Historical Formula 1 data from FastF1, OpenF1 (historical) and Jolpica-F1, cached locally. "
    "Unofficial; not associated with Formula 1 companies. No live data.",
)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=1024)
install_error_handlers(app)

api = APIRouter(prefix="/api/v1")


@api.get("/health", response_model=Health, tags=["health"])
async def health():
    return {"status": "ok", "version": VERSION, "fastf1_version": fastf1.__version__, "cache_dir": str(settings.data_dir)}


api.include_router(catalog.router)
api.include_router(sessions.router)
app.include_router(api)
