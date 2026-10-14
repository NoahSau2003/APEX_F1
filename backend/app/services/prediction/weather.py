"""Race-time weather forecast via Open-Meteo (free, no API key)."""

from __future__ import annotations

import time
from datetime import datetime, timezone

from app.core.config import get_settings
from app.providers import http
from app.repositories.file_cache import FileCache
from app.services import catalog_service

from . import circuits

MAX_HORIZON_DAYS = 16


def _fc() -> FileCache:
    return FileCache(get_settings().processed_dir / "prediction" / "weather")


def forecast_for_event(event_id: str) -> dict:
    meeting = catalog_service.meeting(event_id)
    race = next((s for s in meeting["sessions"] if s.get("code") == "R"), None)
    if not race or not race.get("date_utc"):
        return {"available": False, "reason": "Race start time is not on the calendar", "event_id": event_id}
    start = datetime.fromisoformat(race["date_utc"].replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    days_ahead = (start - now).total_seconds() / 86400
    latlon = circuits.coords(meeting.get("location"), meeting.get("country"), meeting.get("name"))
    if latlon is None:
        return {"available": False, "reason": "Could not resolve circuit coordinates for a forecast", "event_id": event_id}
    cache_key = f"{event_id}:{race['date_utc'][:13]}"
    hit = _fc().get(cache_key)
    if hit and time.time() - hit["fetched_at"] < 3600:
        return hit["data"]
    if days_ahead > MAX_HORIZON_DAYS:
        out = {
            "available": False,
            "reason": f"Forecast horizon exceeds {MAX_HORIZON_DAYS} days; check closer to the event",
            "event_id": event_id,
            "race_start_utc": race["date_utc"],
            "retrieved_at": now.isoformat().replace("+00:00", "Z"),
            "kind": "forecast",
        }
        _fc().put(cache_key, {"fetched_at": time.time(), "data": out})
        return out
    lat, lon = latlon
    try:
        r = http.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "hourly": "temperature_2m,precipitation_probability,windspeed_10m,weathercode",
                "timezone": "UTC",
                "forecast_days": min(16, max(2, int(days_ahead) + 2)),
            },
        )
        payload = r.json()
    except Exception as e:
        return {"available": False, "reason": str(e), "event_id": event_id, "kind": "forecast"}
    hourly = payload.get("hourly") or {}
    times = hourly.get("time") or []
    target = start.strftime("%Y-%m-%dT%H:00")
    idx = next((i for i, t in enumerate(times) if t == target), None)
    if idx is None and times:
        idx = min(range(len(times)), key=lambda i: abs(datetime.fromisoformat(times[i]).replace(tzinfo=timezone.utc) - start))
    row = None
    if idx is not None:
        row = {
            "time_utc": times[idx],
            "temperature_c": hourly.get("temperature_2m", [None])[idx],
            "precipitation_probability_pct": hourly.get("precipitation_probability", [None])[idx],
            "windspeed_kmh": hourly.get("windspeed_10m", [None])[idx],
            "weather_code": hourly.get("weathercode", [None])[idx],
        }
    out = {
        "available": bool(row),
        "reason": None if row else "No hourly forecast slot matched the scheduled race start",
        "event_id": event_id,
        "race_start_utc": race["date_utc"],
        "retrieved_at": now.isoformat().replace("+00:00", "Z"),
        "valid_for_utc": row["time_utc"] if row else None,
        "coordinates": {"latitude": lat, "longitude": lon},
        "hourly_at_race_start": row,
        "kind": "forecast",
        "source": {"provider": "Open-Meteo", "note": "Forecast, not observed conditions."},
    }
    _fc().put(cache_key, {"fetched_at": time.time(), "data": out})
    return out
