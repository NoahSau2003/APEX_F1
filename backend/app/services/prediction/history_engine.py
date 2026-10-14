"""Leakage-safe feature matrix from Jolpica results, qualifying, sprints, and wet flags."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.core.errors import NotFound
from app.services import catalog_service, season_service

from . import circuit_clusters, quali_times, stint_features, wet_races

FEATURE_NAMES = [
    "roll3_avg_pos",
    "roll5_avg_pos",
    "roll3_avg_grid",
    "roll5_avg_grid",
    "roll5_quali_to_race",
    "season_points_norm",
    "constructor_roll5_avg_pos",
    "constructor_tenure_norm",
    "circuit_avg_pos",
    "circuit_cluster",
    "dnf_rate5",
    "grid_position",
    "grid_gap_to_pole",
    "grid_field_norm",
    "quali_position",
    "quali_gap_to_pole_norm",
    "roll5_quali_gap_norm",
    "sector_pace_norm",
    "constructor_swap",
    "stint_deg_norm",
    "sprint_avg_pos5",
    "sprint_grid",
    "fp_pace_norm",
    "quali_pace_norm",
    "dry_avg_pos",
    "wet_avg_pos",
    "wet_skill",
    "race_wet_indicator",
    "avg_laps_norm",
]


@dataclass
class DriverState:
    positions: list[int] = field(default_factory=list)
    grids: list[int] = field(default_factory=list)
    quali_pos: list[int] = field(default_factory=list)
    quali_to_race: list[float] = field(default_factory=list)
    quali_gap_norm: list[float] = field(default_factory=list)
    last_constructor_id: str | None = None
    wet_pos: list[int] = field(default_factory=list)
    dry_pos: list[int] = field(default_factory=list)
    sprint_pos: list[int] = field(default_factory=list)
    sprint_grid: list[int] = field(default_factory=list)
    dnfs: list[int] = field(default_factory=list)
    laps_frac: list[float] = field(default_factory=list)
    season_points: float = 0.0
    circuit_pos: dict[str, list[int]] = field(default_factory=dict)
    constructor_id: str | None = None
    constructor_pos: dict[str, list[int]] = field(default_factory=dict)


@dataclass
class RaceBundle:
    year: int
    round: int
    circuit: str
    locality: str | None
    results: list[dict]
    quali: list[dict]
    sprint: list[dict]
    wet: bool


def _avg(xs: list[int | float], default: float = 15.0) -> float:
    return sum(xs) / len(xs) if xs else default


def _dnf(status: str) -> bool:
    s = (status or "").lower()
    return s not in ("finished", "+1 lap", "+2 laps", "+3 laps", "+4 laps", "+5 laps")


def _index_quali(year: int) -> dict[int, list[dict]]:
    try:
        data = season_service.qualifying(year)
    except NotFound:
        return {}
    return {int(r["round"]): r["results"] for r in data["races"]}


def load_bundles(max_year: int | None = None) -> list[RaceBundle]:
    max_year = max_year or catalog_service.seasons()[0]
    quali_by_year: dict[int, dict[int, list[dict]]] = {}
    bundles: list[RaceBundle] = []
    for year in range(catalog_service.seasons()[-1], max_year + 1):
        quali_by_year[year] = _index_quali(year)
        try:
            payload = season_service.results(year)
        except NotFound:
            continue
        for race in payload["races"]:
            rnd = int(race["round"])
            bundles.append(
                RaceBundle(
                    year=year,
                    round=rnd,
                    circuit=race["circuit"],
                    locality=race.get("locality"),
                    results=race["results"],
                    quali=quali_by_year[year].get(rnd, []),
                    sprint=race.get("sprint") or [],
                    wet=wet_races.is_wet_race(year, rnd),
                )
            )
    bundles.sort(key=lambda b: (b.year, b.round))
    return bundles


def _quali_map(quali: list[dict]) -> dict[str, int]:
    return {r["driver_id"]: int(r["position"]) for r in quali}


def _sprint_maps(sprint: list[dict]) -> tuple[dict[str, int], dict[str, int]]:
    fin = {r["driver_id"]: int(r["position"]) for r in sprint}
    grid = {r["driver_id"]: int(r["grid"]) for r in sprint if r.get("grid") is not None}
    return fin, grid


def _state_snapshot(
    st: DriverState,
    bundle: RaceBundle,
    field_size: int,
    grid_val: int | None,
    quali_val: int | None,
    weekend: dict[str, float] | None,
    wet_indicator: float,
    *,
    sprint_grid_override: int | None = None,
    sprint_finish_override: int | None = None,
    quali_gap_override: float | None = None,
    driver_number: str | None = None,
    driver_id: str | None = None,
) -> dict[str, Any]:
    cid = st.constructor_id or "unknown"
    c_hist = st.constructor_pos.get(cid, [])
    dry = _avg(st.dry_pos)
    wet = _avg(st.wet_pos)
    wet_n = len(st.wet_pos)
    dry_n = len(st.dry_pos)
    wet_skill = (dry - wet) if wet_n >= 3 and dry_n >= 3 else 0.0
    g = float(grid_val if grid_val is not None else _avg(st.grids))
    q = float(quali_val if quali_val is not None else g)
    wk = weekend or {}
    return {
        "roll3_avg_pos": _avg(st.positions[-3:]),
        "roll5_avg_pos": _avg(st.positions[-5:]),
        "roll3_avg_grid": _avg([float(x) for x in st.grids[-3:]]),
        "roll5_avg_grid": _avg([float(x) for x in st.grids[-5:]]),
        "roll5_quali_to_race": _avg(st.quali_to_race[-5:]),
        "season_points_norm": st.season_points / max(25.0 * max(bundle.round, 1), 1.0),
        "constructor_roll5_avg_pos": _avg(c_hist[-5:]),
        "constructor_tenure_norm": min(len(c_hist), 40) / 40.0,
        "circuit_avg_pos": _avg(st.circuit_pos.get(bundle.circuit, [])),
        "circuit_cluster": circuit_clusters.cluster_id(bundle.circuit, bundle.locality),
        "dnf_rate5": _avg(st.dnfs[-5:], 0.15),
        "grid_position": g,
        "grid_gap_to_pole": max(0.0, g - 1.0),
        "grid_field_norm": g / max(field_size, 1.0),
        "quali_position": q,
        "quali_gap_to_pole_norm": float(
            quali_gap_override if quali_gap_override is not None else _avg(st.quali_gap_norm[-3:], (g - 1.0) / max(field_size, 1.0))
        ),
        "roll5_quali_gap_norm": _avg(st.quali_gap_norm[-5:], 0.0),
        "sector_pace_norm": float(wk.get("sector_pace_norm", 0.0)),
        "constructor_swap": 1.0 if st.last_constructor_id and cid != st.last_constructor_id else 0.0,
        "stint_deg_norm": stint_features.stint_deg_for_driver(driver_number, driver_id or "", 0.5),
        "sprint_avg_pos5": _avg(st.sprint_pos[-5:] + ([sprint_finish_override] if sprint_finish_override is not None else [])),
        "sprint_grid": float(sprint_grid_override if sprint_grid_override is not None else (st.sprint_grid[-1] if st.sprint_grid else g)),
        "fp_pace_norm": float(wk.get("fp_pace_norm", 0.0)),
        "quali_pace_norm": float(wk.get("quali_pace_norm", 0.0)),
        "dry_avg_pos": dry,
        "wet_avg_pos": wet if wet_n >= 2 else dry,
        "wet_skill": wet_skill,
        "race_wet_indicator": wet_indicator,
        "avg_laps_norm": _avg(st.laps_frac[-5:], 0.85),
    }


def build_training_rows(*, use_grid: bool = True) -> tuple[list[dict[str, Any]], list[float]]:
    bundles = load_bundles()
    states: dict[str, DriverState] = {}
    rows: list[dict[str, Any]] = []
    labels: list[float] = []

    for bundle in bundles:
        qmap = _quali_map(bundle.quali)
        sprint_fin, sprint_grid = _sprint_maps(bundle.sprint)
        field_size = max(len(bundle.results), 1)
        wet_ind = 1.0 if bundle.wet else 0.0
        gaps = quali_times.gaps_to_pole(bundle.quali)
        pole_times = [t for r in bundle.quali if (t := quali_times.best_quali_time(r)) is not None]
        pole_t = min(pole_times) if pole_times else None

        for res in bundle.results:
            did = res["driver_id"]
            st = states.setdefault(did, DriverState())
            st.constructor_id = res["constructor_id"]
            grid_val = res.get("grid")
            quali_val = qmap.get(did) or grid_val
            g_use = int(grid_val) if use_grid and grid_val is not None else None
            gap_o = quali_times.gap_norm(gaps[did], pole_t) if did in gaps and pole_t else None
            feats = _state_snapshot(
                st, bundle, field_size, g_use, int(quali_val) if quali_val else None, None, wet_ind, quali_gap_override=gap_o, driver_id=did
            )
            feats["year"] = bundle.year
            feats["round"] = bundle.round
            feats["driver_id"] = did
            feats["constructor_id"] = res["constructor_id"]
            rows.append(feats)
            labels.append(float(res["position"]))

        for res in bundle.results:
            did = res["driver_id"]
            cid = res["constructor_id"]
            pos = int(res["position"])
            st = states[did]
            st.last_constructor_id = st.constructor_id
            st.constructor_id = cid
            grid_val = res.get("grid")
            quali_val = qmap.get(did) or grid_val
            if grid_val is not None:
                st.grids.append(int(grid_val))
            if quali_val is not None:
                st.quali_pos.append(int(quali_val))
            if grid_val is not None:
                st.quali_to_race.append(float(pos - int(grid_val)))
            st.positions.append(pos)
            st.season_points += float(res["points"])
            st.circuit_pos.setdefault(bundle.circuit, []).append(pos)
            st.dnfs.append(1 if _dnf(res["status"]) else 0)
            leader_laps = max((r["laps"] for r in bundle.results), default=1) or 1
            st.laps_frac.append(min(1.0, float(res["laps"]) / leader_laps))
            if bundle.wet:
                st.wet_pos.append(pos)
            else:
                st.dry_pos.append(pos)
            st.constructor_pos.setdefault(cid, []).append(pos)
            if did in sprint_fin:
                st.sprint_pos.append(sprint_fin[did])
            if did in sprint_grid:
                st.sprint_grid.append(sprint_grid[did])
            if did in gaps and pole_t:
                st.quali_gap_norm.append(quali_times.gap_norm(gaps[did], pole_t))

        idx = bundles.index(bundle)
        if idx + 1 < len(bundles) and bundles[idx + 1].year != bundle.year:
            states = {k: DriverState(circuit_pos=v.circuit_pos, constructor_pos=v.constructor_pos) for k, v in states.items()}

    return rows, labels


def features_for_upcoming(
    *,
    year: int,
    round_number: int,
    circuit: str,
    locality: str | None,
    drivers: list[dict],
    grid_by_driver: dict[str, int | None],
    quali_by_driver: dict[str, int | None],
    sprint_grid_by_driver: dict[str, int | None],
    sprint_finish_by_driver: dict[str, int | None],
    weekend_pace: dict[str, dict[str, float]],
    wet_indicator: float,
    quali_gap_by_driver: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    bundles = [b for b in load_bundles(max_year=year) if b.year < year or (b.year == year and b.round < round_number)]
    states: dict[str, DriverState] = {}
    for bundle in bundles:
        qmap = _quali_map(bundle.quali)
        sprint_fin, sprint_grid = _sprint_maps(bundle.sprint)
        for res in bundle.results:
            did = res["driver_id"]
            cid = res["constructor_id"]
            pos = int(res["position"])
            st = states.setdefault(did, DriverState())
            st.constructor_id = cid
            grid_val = res.get("grid")
            quali_val = qmap.get(did) or grid_val
            if grid_val is not None:
                st.grids.append(int(grid_val))
            if quali_val is not None:
                st.quali_pos.append(int(quali_val))
            if grid_val is not None:
                st.quali_to_race.append(float(pos - int(grid_val)))
            st.positions.append(pos)
            st.season_points += float(res["points"])
            st.circuit_pos.setdefault(bundle.circuit, []).append(pos)
            st.dnfs.append(1 if _dnf(res["status"]) else 0)
            leader_laps = max((r["laps"] for r in bundle.results), default=1) or 1
            st.laps_frac.append(min(1.0, float(res["laps"]) / leader_laps))
            if bundle.wet:
                st.wet_pos.append(pos)
            else:
                st.dry_pos.append(pos)
            st.constructor_pos.setdefault(cid, []).append(pos)
            if did in sprint_fin:
                st.sprint_pos.append(sprint_fin[did])
            if did in sprint_grid:
                st.sprint_grid.append(sprint_grid[did])
        idx = bundles.index(bundle)
        if idx + 1 < len(bundles) and bundles[idx + 1].year != bundle.year:
            states = {k: DriverState(circuit_pos=v.circuit_pos, constructor_pos=v.constructor_pos) for k, v in states.items()}

    pseudo = RaceBundle(year=year, round=round_number, circuit=circuit, locality=locality, results=[], quali=[], sprint=[], wet=False)
    field_size = max(len(drivers), 1)
    out = []
    for d in drivers:
        did = d["driver_id"]
        st = states.get(did, DriverState())
        st.constructor_id = d.get("constructor_id")
        g = grid_by_driver.get(did)
        q = quali_by_driver.get(did) or g
        wk = weekend_pace.get(did, {})
        row = _state_snapshot(
            st,
            pseudo,
            field_size,
            g,
            q,
            wk,
            wet_indicator,
            sprint_grid_override=sprint_grid_by_driver.get(did),
            sprint_finish_override=sprint_finish_by_driver.get(did),
            quali_gap_override=(quali_gap_by_driver or {}).get(did),
            driver_number=str(d.get("number")) if d.get("number") else None,
            driver_id=did,
        )
        row["driver_id"] = did
        row["constructor_id"] = d["constructor_id"]
        out.append(row)
    return out


def feature_vector(row: dict[str, Any]) -> list[float]:
    return [float(row.get(k, 0.0)) for k in FEATURE_NAMES]
