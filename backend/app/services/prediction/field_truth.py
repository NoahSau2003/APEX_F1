"""Official-style entry list and substitution handling."""

from __future__ import annotations

import re

from app.providers import openf1_provider
from app.services import season_service

from . import penalties


def _session(meeting: dict, code: str):
    return next((s for s in meeting.get("sessions") or [] if s.get("code") == code), None)


def entry_from_openf1(meeting: dict) -> list[dict] | None:
    mk = meeting.get("meeting_key")
    if not mk:
        return None
    rows = openf1_provider.get("drivers", {"meeting_key": int(mk)}, max_age_s=3600)
    if not rows:
        for code in ("R", "Q", "FP1"):
            s = _session(meeting, code)
            if s and s.get("session_key"):
                rows = openf1_provider.get("drivers", {"session_key": int(s["session_key"])}, max_age_s=3600)
                if rows:
                    break
    if not rows:
        return None
    # Match OpenF1 names to Ergast ids via standings + prior results
    ergast, meta_by_id = _ergast_lookup(meeting["year"])
    by_id: dict[str, dict] = {}
    for row in rows:
        last = (row.get("last_name") or "").lower()
        first = (row.get("first_name") or "").lower()
        did = ergast.get(last) or ergast.get(f"{first} {last}")
        if not did:
            continue
        meta = meta_by_id[did]
        entry = {
            "driver_id": did,
            "code": row.get("name_acronym") or meta.get("code"),
            "given_name": meta.get("given_name", row.get("first_name")),
            "family_name": meta.get("family_name", row.get("last_name")),
            "constructor_id": meta.get("constructor_id"),
            "constructor": meta.get("constructor"),
            "number": str(int(row["driver_number"])) if row.get("driver_number") is not None else None,
            "source": "openf1_entry",
        }
        prev = by_id.get(did)
        if prev is None:
            by_id[did] = entry
        elif not prev.get("number") and entry.get("number"):
            prev["number"] = entry["number"]
    return list(by_id.values()) if by_id else None


def _ergast_lookup(year: int) -> tuple[dict[str, str], dict[str, dict]]:
    lookup: dict[str, str] = {}
    meta: dict[str, dict] = {}
    try:
        st = season_service.standings(year)
        for d in st["drivers"]:
            did = d["driver_id"]
            lookup[d["family_name"].lower()] = did
            lookup[f"{d['given_name']} {d['family_name']}".lower()] = did
            meta[did] = {
                "code": d.get("code"),
                "given_name": d["given_name"],
                "family_name": d["family_name"],
                "constructor_id": d["constructor_ids"][0] if d["constructor_ids"] else "unknown",
                "constructor": d["constructors"][0] if d["constructors"] else "Unknown",
            }
    except Exception:
        pass
    try:
        for race in season_service.results(year)["races"]:
            for row in race["results"]:
                did = row["driver_id"]
                lookup[row["family_name"].lower()] = did
                meta[did] = {
                    "code": row.get("code"),
                    "given_name": row["given_name"],
                    "family_name": row["family_name"],
                    "constructor_id": row["constructor_id"],
                    "constructor": row["constructor"],
                }
    except Exception:
        pass
    return lookup, meta


_SUB_OUT = re.compile(r"\b(out|withdraw|substitut|replace|stand-in|dns)\b", re.I)


def apply_substitutions(drivers: list[dict], news_items: list[dict]) -> tuple[list[dict], list[str]]:
    """Remove drivers with confirmed substitution-out headlines; never invent replacements."""
    warnings: list[str] = []
    remove: set[str] = set()
    by_name = {}
    for d in drivers:
        by_name[d["family_name"].lower()] = d["driver_id"]
        if d.get("code"):
            by_name[d["code"].lower()] = d["driver_id"]
    for item in news_items:
        if item.get("status") != "confirmed" and "confirmed" not in (item.get("title") or "").lower():
            continue
        text = f"{item.get('title', '')} {item.get('summary', '')}".lower()
        if not _SUB_OUT.search(text):
            continue
        for name, did in by_name.items():
            if len(name) > 3 and name in text:
                remove.add(did)
                warnings.append(f"Driver removed from predicted field (news): {name} — {item.get('title', '')[:70]}")
    if not remove:
        return drivers, warnings
    return [d for d in drivers if d["driver_id"] not in remove], warnings
