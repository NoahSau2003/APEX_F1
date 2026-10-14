"""Shared HTTP client: timeouts, limited retries, exponential backoff on 429/5xx."""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.errors import UpstreamError

log = logging.getLogger("apex.http")
_client: httpx.Client | None = None


def client() -> httpx.Client:
    global _client
    if _client is None:
        s = get_settings()
        _client = httpx.Client(timeout=s.http_timeout_s, headers={"User-Agent": "apex-f1-local/0.2 (personal, non-commercial)"}, follow_redirects=True)
    return _client


def get(url: str, params: dict[str, Any] | None = None, *, allow_404: bool = False) -> httpx.Response | None:
    retries = get_settings().http_retries
    last: Exception | None = None
    for attempt in range(retries + 1):
        try:
            r = client().get(url, params=params)
        except httpx.HTTPError as e:
            last = e
        else:
            if r.status_code == 404 and allow_404:
                return None
            if r.status_code in (429, 500, 502, 503, 504):
                retry_after = r.headers.get("Retry-After")
                wait = float(retry_after) if retry_after and retry_after.isdigit() else 1.5 * 2**attempt
                log.warning("%s -> %s, retrying in %.1fs", url, r.status_code, wait)
                last = UpstreamError(f"{url} returned {r.status_code}")
                time.sleep(min(wait, 20))
                continue
            if r.status_code >= 400:
                if allow_404 and r.status_code in (403, 404):
                    return None
                raise UpstreamError(f"{url} returned {r.status_code}")
            return r
        time.sleep(1.5 * 2**attempt)
    raise UpstreamError(f"Could not reach {url}: {last}")
