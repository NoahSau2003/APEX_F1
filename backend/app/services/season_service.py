"""Season-level results and standings from Jolpica-F1 (the community-run,
Ergast-compatible API that FastF1 uses for historical results).

Team colours are not part of Jolpica's data; they are taken from the F1 driver list
of the season's latest completed race (FastF1) and matched by Ergast constructor id.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

from app.core.config import get_settings
from app.core.errors import NotFound
from app.providers import fastf1_provider, http
from app.repositories.file_cache import FileCache

from . import catalog_service

JOLPICA_SOURCE = {"provider": "Jolpica-F1", "origin": "api.jolpi.ca (Ergast-compatible historical results)"}


def _fc() -> FileCache:
    return FileCache(get_settings().processed_dir / "seasons")


def _ttl(year: int) -> float | None:
    return 6 * 3600 if year >= datetime.now(timezone.utc).year else None


def _paged(path: str, table: str, list_key: str) -> list[dict]:
    base = get_settings().jolpica_base_url
    out: list[dict] = []
    offset = 0
    while True:
        r = http.get(f"{base}/{path}.json", params={"limit": 100, "offset": offset})
        mr = r.json()["MRData"]
        races = mr[table][list_key]
        out.extend(races)
        total = int(mr["total"])
        offset += int(mr["limit"])
        time.sleep(0.3)  # Jolpica asks clients to stay well below 4 requests/s
        if offset >= total:
            break
    return out


def _cached(key: str, year: int, build):
    hit = _fc().get(key)
    ttl = _ttl(year)
    if hit and (ttl is None or time.time() - hit["fetched_at"] < ttl):
        return hit["data"]
    data = build()
    _fc().put(key, {"fetched_at": time.time(), "data": data})
    return data


def _merge_races(rows: list[dict], key: str) -> dict[int, dict]:
    """Jolpica pages split a race's results across pages; merge them by round."""
    by_round: dict[int, dict] = {}
    for race in rows:
        rnd = int(race["round"])
        dst = by_round.setdefault(rnd, {k: v for k, v in race.items() if k != key} | {key: []})
        dst[key].extend(race.get(key, []))
    return by_round


def results(year: int) -> dict:
    if year not in catalog_service.seasons():
        raise NotFound(f"Season {year} is not supported")

    def build():
        races = _merge_races(_paged(f"{year}/results", "RaceTable", "Races"), "Results")
        sprints = _merge_races(_paged(f"{year}/sprint", "RaceTable", "Races"), "SprintResults")
        out = []
        for rnd in sorted(races):
            race = races[rnd]
            out.append(
                {
                    "round": rnd,
                    "name": race["raceName"],
                    "date": race["date"],
                    "circuit": race["Circuit"]["circuitName"],
                    "locality": race["Circuit"]["Location"]["locality"],
                    "country": race["Circuit"]["Location"]["country"],
                    "results": [_row(x) for x in race["Results"]],
                    "sprint": [_row(x) for x in sprints.get(rnd, {}).get("SprintResults", [])],
                }
            )
        return out

    return {"year": year, "races": _cached(f"{year}/results", year, build), "source": JOLPICA_SOURCE}


def _row(x: dict) -> dict:
    d = x["Driver"]
    c = x["Constructor"]
    fl = x.get("FastestLap", {})
    return {
        "position": int(x["position"]),
        "position_text": x["positionText"],
        "driver_id": d["driverId"],
        "code": d.get("code"),
        "number": x.get("number"),
        "given_name": d["givenName"],
        "family_name": d["familyName"],
        "constructor_id": c["constructorId"],
        "constructor": c["name"],
        "grid": int(x["grid"]) if x.get("grid") not in (None, "") else None,
        "laps": int(x["laps"]),
        "status": x["status"],
        "points": float(x["points"]),
        "time": x.get("Time", {}).get("time"),
        "fastest_lap_rank": int(fl["rank"]) if fl.get("rank") else None,
        "fastest_lap_time": fl.get("Time", {}).get("time"),
    }


def standings(year: int) -> dict:
    if year not in catalog_service.seasons():
        raise NotFound(f"Season {year} is not supported")

    def build():
        base = get_settings().jolpica_base_url
        ds = http.get(f"{base}/{year}/driverstandings.json", params={"limit": 100}).json()["MRData"]["StandingsTable"]["StandingsLists"]
        cs = http.get(f"{base}/{year}/constructorstandings.json", params={"limit": 100}).json()["MRData"]["StandingsTable"]["StandingsLists"]
        drivers = [
            {
                "position": int(s.get("position", 0) or 0) or None,
                "points": float(s["points"]),
                "wins": int(s["wins"]),
                "driver_id": s["Driver"]["driverId"],
                "code": s["Driver"].get("code"),
                "given_name": s["Driver"]["givenName"],
                "family_name": s["Driver"]["familyName"],
                "constructor_ids": [c["constructorId"] for c in s["Constructors"]],
                "constructors": [c["name"] for c in s["Constructors"]],
            }
            for s in (ds[0]["DriverStandings"] if ds else [])
        ]
        constructors = [
            {
                "position": int(s.get("position", 0) or 0) or None,
                "points": float(s["points"]),
                "wins": int(s["wins"]),
                "constructor_id": s["Constructor"]["constructorId"],
                "name": s["Constructor"]["name"],
            }
            for s in (cs[0]["ConstructorStandings"] if cs else [])
        ]
        return {"round": int(ds[0]["round"]) if ds else None, "drivers": drivers, "constructors": constructors}

    return {"year": year, **_cached(f"{year}/standings", year, build), "source": JOLPICA_SOURCE}


def team_colors(year: int) -> dict:
    """Constructor id -> official colour from the latest completed race's F1 driver list."""

    def build():
        races = [(m, s) for m in catalog_service.meetings(year) for s in m["sessions"] if s["code"] == "R" and s["status"] == "completed"]
        if not races:
            return {"colors": {}, "from": None}
        m, s = races[-1]
        import fastf1

        fastf1_provider._ensure_cache()
        ses = fastf1.get_session(year, m["round"], "R")
        ses.load(laps=False, telemetry=False, weather=False, messages=False)
        colors = {}
        for _, r in ses.results.iterrows():
            tid, col = r.get("TeamId"), r.get("TeamColor")
            if isinstance(tid, str) and isinstance(col, str) and len(col.strip("#")) == 6:
                colors[tid] = "#" + col.strip("#").lower()
        return {"colors": colors, "from": f"{m['name']} race driver list"}

    data = _cached(f"{year}/team-colors", year, build)
    return {"year": year, **data, "source": {"provider": "FastF1", "origin": "Formula 1 live-timing driver list via FastF1"}}
