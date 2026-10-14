"""Seasons, meetings and sessions.

The FastF1 event schedule is the source of each season's events and session
names/times. Each event and session is joined to its official F1 live-timing key
(identical to OpenF1's meeting_key / session_key) by session start time and name.
Sessions without a resolvable key are listed but marked as not replayable.
"""

from __future__ import annotations

import threading
import time
from datetime import datetime, timezone

import pandas as pd

from app.core.config import get_settings
from app.core.errors import NotFound
from app.providers import fastf1_provider, livetiming, openf1_provider
from app.repositories.file_cache import FileCache

SESSION_CODES = {
    "Practice 1": "FP1",
    "Practice 2": "FP2",
    "Practice 3": "FP3",
    "Qualifying": "Q",
    "Sprint Qualifying": "SQ",
    "Sprint Shootout": "SQ",
    "Sprint": "S",
    "Race": "R",
}
SESSION_KIND = {"FP1": "practice", "FP2": "practice", "FP3": "practice", "Q": "qualifying", "SQ": "qualifying", "S": "race", "R": "race"}

_lock = threading.Lock()
_mem: dict[int, tuple[float, list[dict]]] = {}


def _fc() -> FileCache:
    return FileCache(get_settings().processed_dir / "catalog")


def seasons() -> list[int]:
    now = datetime.now(timezone.utc).year
    return list(range(now, get_settings().first_season - 1, -1))


def _iso(v) -> str | None:
    if v is None or pd.isna(v):
        return None
    ts = pd.Timestamp(v)
    if ts.tzinfo is None:
        ts = ts.tz_localize("UTC")
    return ts.tz_convert("UTC").isoformat().replace("+00:00", "Z")


def _key_lookup(year: int, current: bool) -> tuple[dict[tuple[str, str], tuple[int, int]], dict[tuple[str, str], tuple[int, int]]]:
    """Official keys by (UTC start minute, name) from OpenF1 and by (local start minute, name) from Index.json."""
    ttl = 6 * 3600 if current else None
    by_utc: dict[tuple[str, str], tuple[int, int]] = {}
    if year >= openf1_provider.FIRST_YEAR:
        for s in openf1_provider.get("sessions", {"year": year}, max_age_s=ttl):
            by_utc[(s["date_start"][:16], s["session_name"])] = (s["meeting_key"], s["session_key"])
    by_local: dict[tuple[str, str], tuple[int, int]] = {}
    idx = livetiming.year_index(year, max_age_s=ttl)
    for m in (idx or {}).get("Meetings", []):
        for s in m.get("Sessions", []):
            if "Name" in s and "StartDate" in s:
                by_local[(s["StartDate"][:16], s["Name"])] = (m["Key"], s["Key"])
    return by_utc, by_local


def session_id(year: int, round_number: int, code: str) -> str:
    """FastF1 addressing (season, round, session) used when no official key is known."""
    return f"{year}-{round_number:02d}-{code}"


def _build(year: int) -> list[dict]:
    from fastf1 import _api  # path helper used only for the SessionInfo fallback

    current = year >= datetime.now(timezone.utc).year
    sch = fastf1_provider.schedule(year)
    by_utc, by_local = _key_lookup(year, current)
    now = datetime.now(timezone.utc)
    meetings: list[dict] = []
    for _, e in sch.iterrows():
        if int(e["RoundNumber"]) == 0:
            continue
        sessions = []
        meeting_key = None
        for i in range(1, 6):
            name = e.get(f"Session{i}")
            if not isinstance(name, str) or not name or name == "None":
                continue
            local = e.get(f"Session{i}Date")
            utc = e.get(f"Session{i}DateUtc")
            code = SESSION_CODES.get(name)
            start = pd.Timestamp(utc).tz_localize("UTC") if utc is not None and not pd.isna(utc) else None
            completed = start is not None and start + pd.Timedelta(hours=3) < now
            keys = by_utc.get((start.strftime("%Y-%m-%dT%H:%M"), name)) if start is not None else None
            if keys is None and local is not None and not pd.isna(local):
                keys = by_local.get((pd.Timestamp(local).strftime("%Y-%m-%dT%H:%M"), name))
            if keys is None and completed and year < openf1_provider.FIRST_YEAR and local is not None and not pd.isna(local):
                path = _api.make_path(e["EventName"], e["EventDate"].strftime("%Y-%m-%d"), name, pd.Timestamp(local).strftime("%Y-%m-%d"))
                info = livetiming.session_info(path)
                if info:
                    keys = (info["Meeting"]["Key"], info["Key"])
            rnd = int(e["RoundNumber"])
            if keys:
                meeting_key = meeting_key or keys[0]
            sessions.append(
                {
                    "id": str(keys[1]) if keys else session_id(year, rnd, code or name.replace(" ", "")),
                    "session_key": keys[1] if keys else None,
                    "name": name,
                    "code": code,
                    "kind": SESSION_KIND.get(code or "", "other"),
                    "date_utc": _iso(start),
                    "status": "completed" if completed else "scheduled",
                    "replay_available": bool(completed and code and e.get("F1ApiSupport", True)),
                    "unavailable_reason": None
                    if completed and code and e.get("F1ApiSupport", True)
                    else ("Session has not taken place" if not completed else "FastF1 has no timing support for this session"),
                }
            )
        meetings.append(
            {
                "id": str(meeting_key) if meeting_key else f"{year}-{int(e['RoundNumber']):02d}",
                "meeting_key": meeting_key,
                "year": year,
                "round": int(e["RoundNumber"]),
                "name": e["EventName"],
                "official_name": e["OfficialEventName"],
                "country": e["Country"],
                "location": e["Location"],
                "date": _iso(e["EventDate"]),
                "format": e["EventFormat"],
                "sessions": sessions,
            }
        )
    return meetings


def meetings(year: int) -> list[dict]:
    if year not in seasons():
        raise NotFound(f"Season {year} is not supported (supported: {seasons()[-1]}–{seasons()[0]})")
    current = year >= datetime.now(timezone.utc).year
    ttl = 6 * 3600 if current else None
    with _lock:
        hit = _mem.get(year)
        if hit and (ttl is None or time.time() - hit[0] < ttl):
            return hit[1]
        cached = _fc().get(str(year))
        if cached and (ttl is None or time.time() - cached["fetched_at"] < ttl):
            _mem[year] = (cached["fetched_at"], cached["data"])
            return cached["data"]
        data = _build(year)
        _fc().put(str(year), {"fetched_at": time.time(), "data": data})
        _mem[year] = (time.time(), data)
        return data


def _years_for(ident: str) -> list[int]:
    """Composite ids carry their season; official keys need a search (recent seasons first)."""
    head = ident.split("-")[0]
    if "-" in ident and head.isdigit():
        return [int(head)]
    return seasons()


def meeting(meeting_id: str) -> dict:
    for year in _years_for(meeting_id):
        for m in meetings(year):
            if m["id"] == meeting_id:
                return m
    raise NotFound(f"Unknown meeting {meeting_id}")


def resolve_session(session_id_or_key: str) -> tuple[dict, dict]:
    """(meeting, session) for an official session key or a FastF1 composite id."""
    for year in _years_for(session_id_or_key):
        for m in meetings(year):
            for s in m["sessions"]:
                if s["id"] == session_id_or_key:
                    return m, s
    raise NotFound(f"Unknown session {session_id_or_key}")
