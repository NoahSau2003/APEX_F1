"""Parse Jolpica qualifying times and compute gaps to pole."""

from __future__ import annotations

import re

_TIME = re.compile(r"^(?:(\d+):)?(\d+(?:\.\d+)?)$")


def parse_time(s: str | None) -> float | None:
    if not s or not isinstance(s, str):
        return None
    s = s.strip()
    m = _TIME.match(s)
    if not m:
        return None
    mins = int(m.group(1) or 0)
    secs = float(m.group(2))
    return mins * 60.0 + secs


def best_quali_time(row: dict) -> float | None:
    for key in ("q3", "q2", "q1"):
        t = parse_time(row.get(key))
        if t is not None:
            return t
    return None


def gaps_to_pole(quali_rows: list[dict]) -> dict[str, float]:
    """driver_id -> seconds behind pole (0 for pole)."""
    times: dict[str, float] = {}
    for row in quali_rows:
        t = best_quali_time(row)
        if t is not None:
            times[row["driver_id"]] = t
    if not times:
        return {}
    pole = min(times.values())
    return {did: max(0.0, t - pole) for did, t in times.items()}


def gap_norm(gap_s: float, pole_s: float) -> float:
    if pole_s <= 0:
        return 0.0
    return gap_s / pole_s
