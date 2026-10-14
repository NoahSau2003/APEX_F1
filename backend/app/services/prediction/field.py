"""Entry list for an upcoming event."""

from __future__ import annotations

from app.services import season_service

from .field_truth import apply_substitutions, entry_from_openf1


def dedupe_drivers(drivers: list[dict]) -> list[dict]:
    """OpenF1 may return one row per session; keep a single row per Ergast driver_id."""
    by_id: dict[str, dict] = {}
    for d in drivers:
        did = d["driver_id"]
        if did not in by_id:
            by_id[did] = dict(d)
            continue
        prev = by_id[did]
        if not prev.get("number") and d.get("number"):
            prev["number"] = d["number"]
        if not prev.get("code") and d.get("code"):
            prev["code"] = d["code"]
    return list(by_id.values())


def entry_list(meeting: dict, news_items: list[dict] | None = None) -> tuple[list[dict], list[str]]:
    warnings: list[str] = []
    official = entry_from_openf1(meeting)
    if official:
        drivers = dedupe_drivers(official)
        if len(drivers) < len(official):
            warnings.append(f"Entry list deduplicated from {len(official)} OpenF1 rows to {len(drivers)} drivers.")
        else:
            warnings.append("Entry list from OpenF1 driver list for this meeting.")
    else:
        drivers, warnings = _entry_from_results(meeting)
    if news_items:
        drivers, sub_warn = apply_substitutions(drivers, news_items)
        warnings.extend(sub_warn)
    return dedupe_drivers(drivers), warnings


def _entry_from_results(meeting: dict) -> tuple[list[dict], list[str]]:
    year = meeting["year"]
    rnd = meeting["round"]
    warnings: list[str] = []
    drivers: dict[str, dict] = {}
    try:
        season = season_service.results(year)
    except Exception:
        season = {"races": []}
    for race in season["races"]:
        if int(race["round"]) >= rnd:
            continue
        for row in race["results"]:
            did = row["driver_id"]
            drivers[did] = {
                "driver_id": did,
                "code": row.get("code"),
                "given_name": row["given_name"],
                "family_name": row["family_name"],
                "constructor_id": row["constructor_id"],
                "constructor": row["constructor"],
                "number": row.get("number"),
            }
    if not drivers:
        st = season_service.standings(year)
        for row in st["drivers"]:
            cid = row["constructor_ids"][0] if row["constructor_ids"] else "unknown"
            cname = row["constructors"][0] if row["constructors"] else "Unknown"
            drivers[row["driver_id"]] = {
                "driver_id": row["driver_id"],
                "code": row.get("code"),
                "given_name": row["given_name"],
                "family_name": row["family_name"],
                "constructor_id": cid,
                "constructor": cname,
                "number": None,
            }
        warnings.append("Entry list inferred from latest championship standings; not an official entry list.")
    return list(drivers.values()), warnings
