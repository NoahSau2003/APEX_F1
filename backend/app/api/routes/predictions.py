from typing import Any

from fastapi import APIRouter, Query
from starlette.concurrency import run_in_threadpool

from app.schemas.predictions import ForecastSnapshot, PredictRequest, UpcomingRacesResponse
from app.services.prediction import calendar, news_intel, service, snapshots, weather

router = APIRouter(prefix="/predictions", tags=["predictions"])


@router.get("/upcoming-races", response_model=UpcomingRacesResponse)
async def upcoming_races(refresh: bool = Query(False, description="Bypass in-memory schedule TTL when true")):
    # refresh flag reserved for future explicit cache bust; schedule TTL is handled in catalog_service.
    _ = refresh
    return await run_in_threadpool(calendar.upcoming_races)


@router.get("/upcoming-races/{event_id}/availability")
async def availability(event_id: str) -> dict[str, Any]:
    ev = await run_in_threadpool(calendar.get_upcoming_event, event_id)
    from app.services import catalog_service

    meeting = await run_in_threadpool(catalog_service.meeting, event_id)
    from datetime import datetime, timezone

    stages = calendar.available_stages(meeting, datetime.now(timezone.utc))
    return {"event_id": event_id, "event": ev, "stages": stages}


@router.get("/upcoming-races/{event_id}/news")
async def event_news(event_id: str):
    from app.services import catalog_service

    m = await run_in_threadpool(catalog_service.meeting, event_id)
    return await run_in_threadpool(
        news_intel.for_event,
        event_name=m["name"],
        location=m.get("location"),
        country=m.get("country"),
    )


@router.get("/upcoming-races/{event_id}/weather")
async def event_weather(event_id: str):
    return await run_in_threadpool(weather.forecast_for_event, event_id)


@router.post("/upcoming-races/{event_id}/predict", response_model=ForecastSnapshot)
async def predict(event_id: str, body: PredictRequest):
    return await run_in_threadpool(service.generate_forecast, event_id, body.stage)


@router.get("/upcoming-races/{event_id}/history")
async def history(event_id: str) -> dict[str, Any]:
    snaps = await run_in_threadpool(snapshots.list_for_event, event_id)
    return {"event_id": event_id, "snapshots": snaps}


@router.get("/model-info")
async def model_info():
    return await run_in_threadpool(service.model_info)


@router.get("/evaluation")
async def evaluation():
    from app.services.prediction import trainer

    return await run_in_threadpool(trainer.evaluation_report)


@router.get("/train-status")
async def train_status():
    from app.services.prediction import trainer

    return await run_in_threadpool(trainer.train_status)


@router.post("/train")
async def train_model(force: bool = Query(False, description="Retrain even if a current champion exists")):
    from app.services.prediction import trainer

    return await run_in_threadpool(trainer.train_champion, force)
