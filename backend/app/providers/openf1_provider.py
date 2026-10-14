"""OpenF1 historical REST API (free, no key; coverage from 2023). Live endpoints are
never used. Responses for completed sessions are cached on disk."""

from __future__ import annotations

import time
from typing import Any

from app.core.config import get_settings
from app.repositories.file_cache import FileCache

from . import http

FIRST_YEAR = 2023
_cache: FileCache | None = None
_last_call = 0.0


def _fc() -> FileCache:
    global _cache
    if _cache is None:
        _cache = FileCache(get_settings().http_cache_dir / "openf1")
    return _cache


def get(endpoint: str, params: dict[str, Any], *, max_age_s: float | None = None) -> list[dict]:
    """GET /v1/{endpoint}. Returns [] when OpenF1 has no rows ("No results found")."""
    global _last_call
    key = endpoint + "/" + "&".join(f"{k}={params[k]}" for k in sorted(params))
    hit = _fc().get(key)
    if hit is not None and (max_age_s is None or time.time() - hit["fetched_at"] < max_age_s):
        return hit["data"]
    # Be polite: OpenF1 rate-limits bursts on the free tier.
    wait = 0.35 - (time.time() - _last_call)
    if wait > 0:
        time.sleep(wait)
    _last_call = time.time()
    r = http.get(f"{get_settings().openf1_base_url}/{endpoint}", params=params, allow_404=True)
    data = r.json() if r is not None else []
    if isinstance(data, dict):  # {"detail": "No results found."}
        data = []
    _fc().put(key, {"fetched_at": time.time(), "data": data})
    return data
