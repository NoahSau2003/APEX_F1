"""Starting grid, qualifying order, and sprint data for an event."""

from __future__ import annotations

from app.core.errors import DataUnavailable
from app.providers import openf1_provider
from app.services import catalog_service, season_service

from .calendar import STAGE_EARLY, STAGE_POST_Q, STAGE_PRE_RACE
from . import penalties, quali_times


def _session(meeting: dict, code: str) -> dict | None:
    return next((s for s in meeting.get("sessions") or [] if s.get("code") == code), None)


def _openf1_results(session_key: int) -> list[dict]:
    return openf1_provider.get("session_result", {"session_key": session_key}, max_age_s=600)


def _map_by_number(drivers: list[dict], rows: list[dict]) -> tuple[dict[str, int], dict[str, int]]:
    by_num = {str(d.get("number")): d["driver_id"] for d in drivers if d.get("number")}
    grid: dict[str, int] = {}
    quali: dict[str, int] = {}
    for r in rows:
        num = r.get("driver_number")
        pos = r.get("position")
        if num is None or pos is None:
            continue
        did = by_num.get(str(int(num)))
        if not did:
            continue
        quali[did] = int(pos)
        grid[did] = int(pos)
    return grid, quali


def _jolpica_quali(year: int, rnd: int, drivers: list[dict]) -> tuple[dict[str, int], dict[str, int]]:
    ids = {d["driver_id"] for d in drivers}
    try:
        for race in season_service.qualifying(year)["races"]:
            if int(race["round"]) != rnd:
                continue
            g, q = {}, {}
            for row in race["results"]:
                if row["driver_id"] not in ids:
                    continue
                p = int(row["position"])
                g[row["driver_id"]] = p
                q[row["driver_id"]] = p
            return g, q
    except Exception:
        pass
    return {}, {}


def _openf1_drivers_for_meeting(meeting: dict) -> list[dict]:
    for code in ("R", "Q", "FP1"):
        s = _session(meeting, code)
        if s and s.get("session_key"):
            rows = openf1_provider.get("drivers", {"session_key": int(s["session_key"])}, max_age_s=3600)
            if rows:
                return rows
    return []


def enrich_entry_from_openf1(meeting: dict, drivers: list[dict]) -> list[dict]:
    rows = _openf1_drivers_for_meeting(meeting)
    if not rows:
        return drivers
    by_id = {d["driver_id"]: dict(d) for d in drivers}
    # Match by name/code from openf1 to ergast id when number missing
    for row in rows:
        num = row.get("driver_number")
        for d in drivers:
            if str(d.get("number")) == str(num):
                break
        else:
            # try last name match
            last = (row.get("last_name") or "").lower()
            for d in drivers:
                if d["family_name"].lower() == last:
                    if num is not None:
                        by_id[d["driver_id"]]["number"] = str(int(num))
                    break
    return list(by_id.values())


def _jolpica_quali_rows(year: int, rnd: int) -> list[dict]:
    try:
        for race in season_service.qualifying(year)["races"]:
            if int(race["round"]) == rnd:
                return race["results"]
    except Exception:
        pass
    return []


def grid_bundle(meeting: dict, stage: str, drivers: list[dict], news_items: list[dict]) -> tuple[
    dict[str, int | None],
    dict[str, int | None],
    dict[str, int | None],
    dict[str, int | None],
    dict[str, float],
    str,
    list[str],
]:
    """Returns grid, quali, sprint_grid, sprint_finish, quali_gap_norm, source, warnings."""
    warnings: list[str] = []
    empty = {d["driver_id"]: None for d in drivers}
    gap_norm: dict[str, float] = {d["driver_id"]: 0.0 for d in drivers}
    if stage == STAGE_EARLY:
        return empty, empty, empty, empty, gap_norm, "not_used", warnings

    qual = _session(meeting, "Q")
    grid, quali = {}, {}
    source = "projected"

    if qual and qual.get("status") == "completed":
        if qual.get("session_key"):
            g, q = _map_by_number(drivers, _openf1_results(int(qual["session_key"])))
            if g:
                grid, quali, source = g, q, "openf1_qualifying"
        if not grid:
            g, q = _jolpica_quali(meeting["year"], meeting["round"], drivers)
            if g:
                grid, quali, source = g, q, "jolpica_qualifying"

    if stage in (STAGE_POST_Q, STAGE_PRE_RACE) and not grid:
        raise DataUnavailable("Qualifying results are not available yet for this stage")

    pen, pen_notes = penalties.from_news_items(news_items, drivers)
    warnings.extend(pen_notes)
    if grid:
        grid = penalties.apply_grid_penalties({k: v for k, v in grid.items()}, pen)

    sprint_grid, sprint_finish = {}, {}
    sprint = _session(meeting, "S")
    if sprint and sprint.get("status") == "completed" and sprint.get("session_key"):
        rows = _openf1_results(int(sprint["session_key"]))
        sg, sf = {}, {}
        by_num = {str(d.get("number")): d["driver_id"] for d in drivers if d.get("number")}
        for r in rows:
            num = r.get("driver_number")
            pos = r.get("position")
            if num is None or pos is None:
                continue
            did = by_num.get(str(int(num)))
            if did:
                sf[did] = int(pos)
        # sprint starting grid from jolpica sprint result grid field
        try:
            for race in season_service.results(meeting["year"])["races"]:
                if int(race["round"]) != meeting["round"]:
                    continue
                for row in race.get("sprint") or []:
                    if row.get("grid") is not None:
                        sg[row["driver_id"]] = int(row["grid"])
        except Exception:
            pass
        sprint_grid, sprint_finish = sg, sf
        if sf and stage == STAGE_PRE_RACE:
            source = f"{source}+sprint"

    quali_rows = _jolpica_quali_rows(meeting["year"], meeting["round"])
    gaps = quali_times.gaps_to_pole(quali_rows)
    pole_times = [t for r in quali_rows if (t := quali_times.best_quali_time(r)) is not None]
    pole_t = min(pole_times) if pole_times else None
    field_size = float(max(len(drivers), 1))
    for d in drivers:
        did = d["driver_id"]
        grid.setdefault(did, None)
        quali.setdefault(did, grid.get(did))
        sprint_grid.setdefault(did, None)
        sprint_finish.setdefault(did, None)
        if did in gaps and pole_t:
            gap_norm[did] = quali_times.gap_norm(gaps[did], pole_t)
        elif grid.get(did) is not None:
            gap_norm[did] = (float(grid[did]) - 1.0) / field_size

    return grid, quali, sprint_grid, sprint_finish, gap_norm, source, warnings
