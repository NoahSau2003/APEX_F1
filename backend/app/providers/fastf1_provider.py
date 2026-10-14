"""FastF1: event schedules and full session loads (timing, position, car data,
weather, race control). FastF1's own HTTP cache lives in data/fastf1-cache."""

from __future__ import annotations

import logging
import threading
from collections import OrderedDict

import fastf1
import pandas as pd

from app.core.config import get_settings
from app.core.errors import DataUnavailable, UpstreamError

log = logging.getLogger("apex.fastf1")
_enabled = False
_loaded: OrderedDict[tuple, fastf1.core.Session] = OrderedDict()
_locks: dict[tuple, threading.Lock] = {}
_guard = threading.Lock()


def _ensure_cache() -> None:
    global _enabled
    if not _enabled:
        d = get_settings().fastf1_cache_dir
        d.mkdir(parents=True, exist_ok=True)
        fastf1.Cache.enable_cache(str(d))
        logging.getLogger("fastf1").setLevel(logging.WARNING)
        _enabled = True


def schedule(year: int) -> pd.DataFrame:
    _ensure_cache()
    try:
        return fastf1.get_event_schedule(year, include_testing=False)
    except Exception as e:  # FastF1 raises a variety of errors for unreachable backends
        raise UpstreamError(f"FastF1 could not load the {year} schedule: {e}") from e


def _lock(key: tuple) -> threading.Lock:
    with _guard:
        return _locks.setdefault(key, threading.Lock())


def load_session(year: int, round_number: int, session_name: str, *, laps_only: bool = False) -> fastf1.core.Session:
    """Fully load one session. Concurrent callers for the same session share one load."""
    _ensure_cache()
    key: tuple = (year, round_number, session_name, laps_only)
    with _lock(key):
        if key in _loaded:
            _loaded.move_to_end(key)
            return _loaded[key]
        log.info("Loading %s from FastF1", key)
        try:
            s = fastf1.get_session(year, round_number, session_name)
            if laps_only:
                s.load(laps=True, telemetry=False, weather=False, messages=False)
            else:
                s.load(laps=True, telemetry=True, weather=True, messages=True)
        except Exception as e:
            raise UpstreamError(f"FastF1 could not load {year} round {round_number} {session_name}: {e}") from e
        if s.laps is None or len(s.results) == 0:
            raise DataUnavailable(f"FastF1 returned no timing data for {year} round {round_number} {session_name}")
        _loaded[key] = s
        while len(_loaded) > get_settings().max_loaded_sessions:
            _loaded.popitem(last=False)
        return s


def circuit_info(session: fastf1.core.Session):
    """Corner markers and display rotation (FastF1 sources these from MultiViewer)."""
    try:
        return session.get_circuit_info()
    except Exception as e:
        log.warning("circuit info unavailable: %s", e)
        return None
