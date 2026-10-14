"""Upcoming Grand Prix eligibility from the FastF1 event schedule (via catalog)."""

from __future__ import annotations

from datetime import datetime, timezone

from app.core.errors import NotFound, UpstreamError
from app.services import catalog_service

STAGE_EARLY = "pre-qualifying"
STAGE_POST_Q = "post-qualifying"
STAGE_PRE_RACE = "pre-race"


def _parse_utc(iso: str | None) -> datetime | None:
    if not iso:
        return None
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def _race_session(meeting: dict) -> dict | None:
    for s in meeting.get("sessions") or []:
        if s.get("code") == "R":
            return s
    return None


def _qual_session(meeting: dict) -> dict | None:
    for s in meeting.get("sessions") or []:
        if s.get("code") == "Q":
            return s
    return None


def available_stages(meeting: dict, now: datetime) -> dict[str, bool]:
    race = _race_session(meeting)
    qual = _qual_session(meeting)
    race_start = _parse_utc(race["date_utc"]) if race else None
    qual_end = _parse_utc(qual["date_utc"]) if qual else None
    if race_start and now >= race_start:
        return {STAGE_EARLY: False, STAGE_POST_Q: False, STAGE_PRE_RACE: False}
    q_done = qual is not None and qual.get("status") == "completed"
    if qual and qual.get("status") == "scheduled" and qual_end and now >= qual_end:
        q_done = False
    return {
        STAGE_EARLY: True,
        STAGE_POST_Q: bool(q_done),
        STAGE_PRE_RACE: bool(q_done),
    }


def upcoming_races(*, now: datetime | None = None, refresh: bool = False) -> dict:
    """Races whose main event has not started. Excludes completed weekends for new forecasts."""
    now = now or datetime.now(timezone.utc)
    years = catalog_service.seasons()
    candidates: list[dict] = []
    fetched_at = now.isoformat().replace("+00:00", "Z")
    for year in sorted({now.year, now.year + 1}):
        if year not in years:
            continue
        try:
            ms = catalog_service.meetings(year)
        except NotFound:
            continue
        for m in ms:
            race = _race_session(m)
            if not race:
                continue
            race_start = _parse_utc(race.get("date_utc"))
            if race_start is None:
                continue
            if now >= race_start:
                continue
            stages = available_stages(m, now)
            if not any(stages.values()):
                continue
            candidates.append(
                {
                    "event_id": m["id"],
                    "meeting_key": m.get("meeting_key"),
                    "year": m["year"],
                    "round": m["round"],
                    "name": m["name"],
                    "official_name": m.get("official_name"),
                    "country": m.get("country"),
                    "location": m.get("location"),
                    "circuit": m.get("location"),
                    "race_start_utc": race["date_utc"],
                    "format": m.get("format"),
                    "stages": stages,
                    "calendar_source": "FastF1 event schedule",
                }
            )
    candidates.sort(key=lambda x: x["race_start_utc"] or "")
    return {"fetched_at": fetched_at, "server_time_utc": fetched_at, "races": candidates}


def get_upcoming_event(event_id: str, *, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    for r in upcoming_races(now=now)["races"]:
        if r["event_id"] == event_id:
            return r
    raise NotFound(f"Event {event_id} is not an eligible upcoming Grand Prix for a new forecast")


def assert_can_predict(event_id: str, stage: str, *, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    ev = get_upcoming_event(event_id, now=now)
    stages = available_stages(catalog_service.meeting(event_id), now)
    if stage not in stages:
        raise UpstreamError(f"Unknown prediction stage {stage}")
    if not stages[stage]:
        raise UpstreamError(f"Stage {stage} is not available for this event at the current time")
    race = _race_session(catalog_service.meeting(event_id))
    race_start = _parse_utc(race["date_utc"]) if race else None
    if race_start and now >= race_start:
        raise UpstreamError("The race has started; new pre-race forecasts are disabled")
    return ev
