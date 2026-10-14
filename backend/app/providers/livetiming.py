"""F1 live-timing static archive: official meeting and session keys.

These are the same keys OpenF1 uses (`meeting_key`, `session_key`). The yearly
Index.json lists them; for seasons where it is missing (2022), each session's own
SessionInfo.json is read instead. Responses for past seasons are cached on disk.
"""

from __future__ import annotations

import json
import time

from app.core.config import get_settings
from app.repositories.file_cache import FileCache

from . import http

_cache: FileCache | None = None


def _fc() -> FileCache:
    global _cache
    if _cache is None:
        _cache = FileCache(get_settings().http_cache_dir / "livetiming")
    return _cache


def _fetch_json(path: str) -> dict | None:
    r = http.get(f"{get_settings().livetiming_base_url}/{path.lstrip('/')}", allow_404=True)
    if r is None:
        return None
    return json.loads(r.content.decode("utf-8-sig"))


def year_index(year: int, max_age_s: float | None) -> dict | None:
    """Index.json for a season, or None if F1 does not publish one for that year."""
    key = f"index/{year}"
    hit = _fc().get(key)
    if hit and (max_age_s is None or time.time() - hit["fetched_at"] < max_age_s):
        return hit["data"]
    data = _fetch_json(f"{year}/Index.json")
    _fc().put(key, {"fetched_at": time.time(), "data": data})
    return data


def session_info(path: str) -> dict | None:
    """SessionInfo.json for one session archive path (immutable once published)."""
    key = "session-info/" + path.strip("/").replace("/", "__")
    hit = _fc().get(key)
    if hit is not None:
        return hit["data"]
    data = _fetch_json(f"{path.lstrip('/').removeprefix('static/')}SessionInfo.json")
    if data is not None:
        _fc().put(key, {"fetched_at": time.time(), "data": data})
    return data
