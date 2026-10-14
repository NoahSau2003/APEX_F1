from typing import Any

from fastapi import APIRouter, Query
from starlette.concurrency import run_in_threadpool

from app.schemas.models import Meeting, SessionRef
from app.services import catalog_service, news_service, season_service

router = APIRouter(tags=["catalog"])


@router.get("/seasons", summary="Supported seasons (FastF1 timing coverage starts in 2018)")
async def seasons() -> dict[str, Any]:
    return {"seasons": catalog_service.seasons(), "source": {"provider": "FastF1", "note": "Detailed timing and position data is available from 2018."}}


@router.get("/meetings", response_model=list[Meeting])
async def meetings(year: int = Query(..., ge=1950, le=2100)):
    return await run_in_threadpool(catalog_service.meetings, year)


@router.get("/meetings/{meeting_key}/sessions", response_model=list[SessionRef])
async def meeting_sessions(meeting_key: str):
    m = await run_in_threadpool(catalog_service.meeting, meeting_key)
    return m["sessions"]


@router.get("/seasons/{year}/results", tags=["seasons"], summary="All race and sprint results of a season (Jolpica-F1)")
async def season_results(year: int) -> dict[str, Any]:
    return await run_in_threadpool(season_service.results, year)


@router.get("/seasons/{year}/standings", tags=["seasons"], summary="Latest official driver and constructor standings (Jolpica-F1)")
async def season_standings(year: int) -> dict[str, Any]:
    return await run_in_threadpool(season_service.standings, year)


@router.get("/seasons/{year}/team-colors", tags=["seasons"])
async def season_team_colors(year: int) -> dict[str, Any]:
    return await run_in_threadpool(season_service.team_colors, year)


@router.get("/news", tags=["news"], summary="Public RSS headlines with rule-based classification")
async def news() -> dict[str, Any]:
    return await run_in_threadpool(news_service.news)
