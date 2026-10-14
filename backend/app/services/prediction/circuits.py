"""Circuit coordinates for weather (Open-Meteo). Cached geocoding lookups."""

from __future__ import annotations

import time

from app.core.config import get_settings
from app.providers import http
from app.repositories.file_cache import FileCache

# Well-known venues when geocoding fails (approximate circuit reference points).
_FALLBACK: dict[str, tuple[float, float]] = {
    "bahrain": (26.0325, 50.5106),
    "jeddah": (21.6319, 39.1044),
    "melbourne": (-37.8497, 144.968),
    "suzuka": (34.8431, 136.541),
    "shanghai": (31.3389, 121.2197),
    "miami": (25.9581, -80.2389),
    "imola": (44.3439, 11.7167),
    "monaco": (43.7347, 7.4206),
    "montreal": (45.5006, -73.5228),
    "barcelona": (41.57, 2.2611),
    "spielberg": (47.2197, 14.7647),
    "silverstone": (52.0786, -1.0169),
    "budapest": (47.5789, 19.2486),
    "spa": (50.4372, 5.9714),
    "zandvoort": (52.3888, 4.5409),
    "monza": (45.6156, 9.2811),
    "baku": (40.3725, 49.8533),
    "singapore": (1.2914, 103.864),
    "austin": (30.1328, -97.6411),
    "mexico": (19.4042, -99.0907),
    "sao paulo": (-23.7036, -46.6997),
    "las vegas": (36.1147, -115.173),
    "lusail": (25.49, 51.454),
    "abu dhabi": (24.4672, 54.6031),
}


def _fc() -> FileCache:
    return FileCache(get_settings().processed_dir / "prediction" / "geocode")


def coords(locality: str | None, country: str | None, circuit_name: str | None) -> tuple[float, float] | None:
    key = "|".join(x.strip().lower() for x in (locality, country, circuit_name) if x)
    hit = _fc().get(key)
    if hit and time.time() - hit["fetched_at"] < 86400 * 30:
        return hit["data"]
    for probe in (locality, circuit_name, f"{locality} {country}" if locality and country else None):
        if not probe:
            continue
        low = probe.lower()
        for name, latlon in _FALLBACK.items():
            if name in low:
                _fc().put(key, {"fetched_at": time.time(), "data": latlon})
                return latlon
    query = locality or circuit_name
    if not query:
        return None
    try:
        r = http.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": query, "count": 1, "language": "en", "format": "json"},
        )
        results = r.json().get("results") or []
        if results:
            latlon = (float(results[0]["latitude"]), float(results[0]["longitude"]))
            _fc().put(key, {"fetched_at": time.time(), "data": latlon})
            return latlon
    except Exception:
        pass
    return None
