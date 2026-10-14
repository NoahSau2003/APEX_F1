from typing import Any

from fastapi import APIRouter, Query
from starlette.concurrency import run_in_threadpool

from app.schemas.models import (
    Dataset,
    DriverRow,
    LapRow,
    Locations,
    PitRow,
    PositionRow,
    RaceControlRow,
    ResultRow,
    StintRow,
    Telemetry,
    TrackStatusRow,
    WeatherRow,
)
from app.services import session_service as ss

router = APIRouter(prefix="/sessions", tags=["sessions"])

SESSION_PATH_DOC = "Official F1 session key (same as OpenF1 `session_key`), or a FastF1 id `YYYY-RR-CODE` where no official key is published."


async def _dataset(sid: str, name: str) -> dict[str, Any]:
    data = await run_in_threadpool(ss.get, sid, name)
    return {"session_id": sid, **data, "cache": ss.cache_meta(sid)}


@router.get("/{session_key}", summary="Session metadata, timeline and data availability", description=SESSION_PATH_DOC)
async def session(session_key: str) -> dict[str, Any]:
    info = await run_in_threadpool(ss.get, session_key, "info")
    return {**info, "cache": ss.cache_meta(session_key)}


@router.get("/{session_key}/drivers", response_model=Dataset[DriverRow])
async def drivers(session_key: str):
    return await _dataset(session_key, "drivers")


@router.get("/{session_key}/results", response_model=Dataset[ResultRow])
async def results(session_key: str):
    return await _dataset(session_key, "results")


@router.get("/{session_key}/laps", response_model=Dataset[LapRow])
async def laps(session_key: str, driver: str | None = None):
    d = await _dataset(session_key, "laps")
    if driver:
        d["rows"] = [r for r in d["rows"] if r["driver_number"] == driver]
    return d


@router.get("/{session_key}/positions", response_model=Dataset[PositionRow], summary="Official running position at the end of each lap")
async def positions(session_key: str):
    d = await _dataset(session_key, "laps")
    rows = [{"driver_number": r["driver_number"], "lap": r["lap"], "position": r["position"], "time": r["end"]} for r in d["rows"] if r["position"] is not None and r["lap"] is not None]
    return {**d, "rows": rows, "source": {**d["source"], "note": "FastF1 per-lap Position (timing-line position at the end of each lap)."}}


@router.get("/{session_key}/locations", response_model=Locations, summary="Raw recorded car positions in a time window")
async def locations(
    session_key: str,
    start: float = Query(..., description="Window start, SessionTime seconds"),
    end: float = Query(..., description="Window end, SessionTime seconds (max window: 1800 s)"),
    drivers: str | None = Query(None, description="Comma-separated driver numbers"),
):
    data = await run_in_threadpool(ss.locations, session_key, start, end, drivers.split(",") if drivers else None)
    return {**data, "cache": ss.cache_meta(session_key)}


@router.get("/{session_key}/telemetry", response_model=Telemetry, summary="Raw car telemetry for one driver")
async def telemetry(session_key: str, driver: str, lap: int | None = None, start: float | None = None, end: float | None = None):
    data = await run_in_threadpool(ss.telemetry, session_key, driver, start, end, lap)
    return {**data, "cache": ss.cache_meta(session_key)}


@router.get("/{session_key}/stints", response_model=Dataset[StintRow])
async def stints(session_key: str):
    return await _dataset(session_key, "stints")


@router.get("/{session_key}/pit-stops", response_model=Dataset[PitRow])
async def pit_stops(session_key: str):
    return await _dataset(session_key, "pit-stops")


@router.get("/{session_key}/weather", response_model=Dataset[WeatherRow])
async def weather(session_key: str):
    return await _dataset(session_key, "weather")


@router.get("/{session_key}/race-control", response_model=Dataset[RaceControlRow])
async def race_control(session_key: str):
    return await _dataset(session_key, "race-control")


@router.get("/{session_key}/track-status", response_model=Dataset[TrackStatusRow])
async def track_status(session_key: str):
    return await _dataset(session_key, "track-status")


@router.get("/{session_key}/track", summary="Circuit centreline derived from this session's samples, with validation report")
async def track(session_key: str) -> dict[str, Any]:
    data = await run_in_threadpool(ss.get, session_key, "track")
    return {"session_id": session_key, **data, "cache": ss.cache_meta(session_key)}
