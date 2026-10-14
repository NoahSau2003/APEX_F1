"""Historical wet-race flags from OpenF1 session weather (2023+)."""

from __future__ import annotations

import time

from app.core.config import get_settings
from app.providers import openf1_provider
from app.repositories.file_cache import FileCache
from app.services import catalog_service


def _fc() -> FileCache:
    return FileCache(get_settings().processed_dir / "prediction" / "wet_races")


def _session_wet(session_key: int) -> bool:
    rows = openf1_provider.get("weather", {"session_key": session_key}, max_age_s=None)
    for row in rows:
        if row.get("rainfall") not in (None, 0, 0.0):
            return True
        if row.get("is_raining") in (True, 1):
            return True
    return False


def wet_race_keys() -> set[tuple[int, int]]:
    """(year, round) tuples where the race had measurable rain in OpenF1 weather."""
    hit = _fc().get("index")
    if hit and time.time() - hit["fetched_at"] < 86400 * 7:
        return {tuple(x) for x in hit["data"]}
    wet: set[tuple[int, int]] = set()
    for year in catalog_service.seasons():
        if year < openf1_provider.FIRST_YEAR:
            continue
        try:
            for m in catalog_service.meetings(year):
                race = next((s for s in m["sessions"] if s.get("code") == "R" and s.get("status") == "completed"), None)
                if not race or not race.get("session_key"):
                    continue
                if _session_wet(int(race["session_key"])):
                    wet.add((year, int(m["round"])))
        except Exception:
            continue
    _fc().put("index", {"fetched_at": time.time(), "data": [list(x) for x in sorted(wet)]})
    return wet


def is_wet_race(year: int, round_number: int) -> bool:
    return (year, round_number) in wet_race_keys()
