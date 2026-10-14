"""Apply confirmed grid penalties from classified news headlines."""

from __future__ import annotations

import re
from typing import Any

PLACE_RE = re.compile(r"(\d+)\.?-?\s*place", re.I)
GRID_RE = re.compile(r"grid penalty.*?(\d+)", re.I)


def _places(text: str) -> int | None:
    m = PLACE_RE.search(text) or GRID_RE.search(text)
    return int(m.group(1)) if m else None


def from_news_items(items: list[dict], drivers: list[dict]) -> tuple[dict[str, int], list[str]]:
    """driver_id -> grid places to add. Only confirmed-style items."""
    penalties: dict[str, int] = {}
    notes: list[str] = []
    by_name = {}
    for d in drivers:
        by_name[d["family_name"].lower()] = d["driver_id"]
        if d.get("code"):
            by_name[d["code"].lower()] = d["driver_id"]
        by_name[f"{d['given_name']} {d['family_name']}".lower()] = d["driver_id"]
    for item in items:
        if not item.get("used_in_model"):
            continue
        text = f"{item.get('title', '')} {item.get('summary', '')}".lower()
        if "grid penalty" not in text and "grid drop" not in text and "places on the grid" not in text:
            continue
        places = _places(text)
        if not places:
            continue
        did = None
        for name, driver_id in by_name.items():
            if name in text:
                did = driver_id
                break
        if not did:
            continue
        penalties[did] = max(penalties.get(did, 0), places)
        notes.append(f"Grid penalty +{places} for {did} from news: {item.get('title', '')[:80]}")
    return penalties, notes


def apply_grid_penalties(grid: dict[str, int | None], penalties: dict[str, int]) -> dict[str, int | None]:
    if not penalties:
        return grid
    out = dict(grid)
    for did, add in penalties.items():
        if out.get(did) is not None:
            out[did] = int(out[did]) + add
    return out
