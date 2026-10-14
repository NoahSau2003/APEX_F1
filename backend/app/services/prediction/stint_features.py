"""Tyre stint degradation proxy from OpenF1 (2023+), cached per driver."""

from __future__ import annotations

import time

from app.core.config import get_settings
from app.providers import openf1_provider
from app.repositories.file_cache import FileCache
from app.services import catalog_service


def _fc() -> FileCache:
    return FileCache(get_settings().processed_dir / "prediction" / "stints")


def _driver_stint_deg(session_key: int) -> dict[str, float]:
    """Higher = longer stints on average (less deg / better tyre management proxy)."""
    stints = openf1_provider.get("stints", {"session_key": session_key}, max_age_s=None)
    by_driver: dict[str, list[float]] = {}
    for s in stints:
        num = s.get("driver_number")
        lap_start = s.get("lap_start")
        lap_end = s.get("lap_end")
        if num is None or lap_start is None or lap_end is None:
            continue
        length = float(int(lap_end) - int(lap_start) + 1)
        by_driver.setdefault(str(int(num)), []).append(length)
    return {k: sum(v) / len(v) for k, v in by_driver.items() if v}


def driver_deg_index() -> dict[str, float]:
    """Ergast driver_id -> normalised stint length index (rolling recent races)."""
    hit = _fc().get("driver_index")
    if hit and time.time() - hit["fetched_at"] < 86400 * 14:
        return hit["data"]
    # Map driver_number -> ergast id via latest result rows is hard; store by driver_number then resolve at feature time
    by_number: dict[str, list[float]] = {}
    for year in catalog_service.seasons():
        if year < openf1_provider.FIRST_YEAR:
            continue
        try:
            for m in catalog_service.meetings(year):
                race = next((s for s in m["sessions"] if s.get("code") == "R" and s.get("status") == "completed"), None)
                if not race or not race.get("session_key"):
                    continue
                deg = _driver_stint_deg(int(race["session_key"]))
                for num, avg_len in deg.items():
                    by_number.setdefault(num, []).append(avg_len)
        except Exception:
            continue
    out = {num: sum(v) / len(v) for num, v in by_number.items() if len(v) >= 2}
    _fc().put("driver_index", {"fetched_at": time.time(), "data": out})
    return out


def stint_deg_for_driver(driver_number: str | None, driver_id: str, fallback: float = 0.5) -> float:
    idx = driver_deg_index()
    if driver_number and driver_number in idx:
        # normalise ~5-35 lap stints to 0-1
        return min(1.0, max(0.0, (idx[driver_number] - 8.0) / 24.0))
    return fallback
