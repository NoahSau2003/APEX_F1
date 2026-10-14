"""Turns one FastF1 session load into normalised, cached datasets.

Every dataset is derived from recorded provider data. Values that are computed
rather than published are flagged with `calculated` and a formula note in their
provenance. Nothing is interpolated or filled here: location and telemetry are
the provider's raw samples (FastF1 `pos_data` / `car_data`, Source == 'pos'/'car').

Time base: FastF1 SessionTime in seconds (offset from `t0_utc`, the start of the
session's data feed). Location/telemetry times are integer milliseconds on the same base.
"""

from __future__ import annotations

import logging
import math
import threading
import time
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.core.config import get_settings
from app.core.errors import BadRequest, DataUnavailable, NotFound
from app.providers import fastf1_provider, openf1_provider
from app.repositories.file_cache import FileCache

from . import catalog_service, track_geometry

log = logging.getLogger("apex.session")
PROCESSING_VERSION = 2
_locks: dict[str, threading.Lock] = {}
_guard = threading.Lock()

FASTF1_SOURCE = {"provider": "FastF1", "origin": "Formula 1 live-timing archive via FastF1"}


def _fc() -> FileCache:
    return FileCache(get_settings().processed_dir / "sessions")


def _lock(sid: str) -> threading.Lock:
    with _guard:
        return _locks.setdefault(sid, threading.Lock())


# ----------------------------------------------------------------- helpers --


def _secs(v) -> float | None:
    if v is None or (isinstance(v, float) and math.isnan(v)) or pd.isna(v):
        return None
    return round(pd.Timedelta(v).total_seconds(), 3)


def _num(v, nd: int | None = None):
    if v is None or pd.isna(v):
        return None
    f = float(v)
    if not math.isfinite(f):
        return None
    return round(f, nd) if nd is not None else f


def _int(v) -> int | None:
    if v is None or pd.isna(v):
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _str(v) -> str | None:
    if v is None or (isinstance(v, float) and math.isnan(v)) or pd.isna(v):
        return None
    s = str(v).strip()
    return s or None


def _color(v) -> str | None:
    s = _str(v)
    if not s:
        return None
    s = s.lstrip("#")
    return f"#{s.lower()}" if len(s) == 6 and all(c in "0123456789abcdefABCDEF" for c in s) else None


def _source(**extra) -> dict:
    return {**FASTF1_SOURCE, **extra}


# --------------------------------------------------------------- building --


def _clean_laps(laps: pd.DataFrame) -> pd.DataFrame:
    return laps[
        laps["PitInTime"].isna()
        & laps["PitOutTime"].isna()
        & laps["LapTime"].notna()
        & (laps["TrackStatus"].astype(str) == "1")
        & (laps["IsAccurate"] == True)  # noqa: E712 - pandas boolean column
        & (laps["Deleted"] != True)  # noqa: E712
    ]


def _build_track(s, clean: pd.DataFrame) -> dict:
    lap_xy: list[np.ndarray] = []
    speed_dist: list[float] = []
    starts: list[np.ndarray] = []
    drivers: set[str] = set()
    for _, lap in clean.iterrows():
        d = lap["DriverNumber"]
        p = s.pos_data.get(d)
        c = s.car_data.get(d)
        if p is None or c is None:
            continue
        t0, t1 = lap["LapStartTime"], lap["Time"]
        m = (p["SessionTime"] >= t0) & (p["SessionTime"] <= t1)
        xy = p.loc[m, ["X", "Y"]].to_numpy(float) / 10.0  # source units are 1/10 m
        if len(xy) < 40:
            continue
        lap_xy.append(xy)
        starts.append(xy[0])
        drivers.add(d)
        cc = c.loc[(c["SessionTime"] >= t0) & (c["SessionTime"] <= t1)]
        tt = cc["SessionTime"].dt.total_seconds().to_numpy()
        v = cc["Speed"].to_numpy(float) / 3.6
        if len(tt) > 10:
            speed_dist.append(float(np.sum((v[1:] + v[:-1]) / 2 * np.diff(tt))))
    # Cap the work on long sessions while keeping laps from every driver.
    if len(lap_xy) > 400:
        step = len(lap_xy) / 400
        keep = [int(i * step) for i in range(400)]
        lap_xy = [lap_xy[i] for i in keep]
        starts = [starts[i] for i in keep]
    if len(lap_xy) < 3:
        return {
            "available": False,
            "reason": f"Only {len(lap_xy)} clean green-flag laps with position data; a reliable circuit shape cannot be derived.",
        }

    centre = track_geometry.reconstruct_centreline(lap_xy)
    ci = fastf1_provider.circuit_info(s)
    corners = None
    corner_rows = []
    if ci is not None and ci.corners is not None and len(ci.corners):
        corners = ci.corners[["X", "Y"]].to_numpy(float) / 10.0
        for _, r in ci.corners.iterrows():
            corner_rows.append({"number": _int(r["Number"]), "letter": _str(r.get("Letter")), "x": _num(r["X"] / 10, 1), "y": _num(r["Y"] / 10, 1)})
    report = track_geometry.validate(
        centre,
        lap_xy,
        len(drivers),
        speed_dist,
        np.array(starts),
        corners,
        "FastF1 circuit_info corner positions (sourced from MultiViewer)" if corners is not None else None,
    )
    # Debug sample of genuine recorded points from the laps used (every k-th sample).
    allpts = np.concatenate(lap_xy)
    k = max(1, len(allpts) // 12000)
    raw = allpts[::k]
    return {
        "available": True,
        "units": "metre",
        "frame": "provider source frame (FastF1 X/Y ÷ 10)",
        "rotation_deg": _num(ci.rotation, 2) if ci is not None else 0.0,
        "rotation_source": "FastF1 circuit_info (MultiViewer)" if ci is not None else None,
        "centreline": [[round(float(x), 2), round(float(y), 2)] for x, y in centre],
        "corners": corner_rows,
        "validation": report.__dict__,
        "method": "Median of all clean green-flag laps' recorded position samples, refined by nearest-vertex medians; 5-vertex circular moving average.",
        "debug_raw_points": {"x": [round(float(v), 1) for v in raw[:, 0]], "y": [round(float(v), 1) for v in raw[:, 1]], "stride": k},
    }


def _build_locations(s, chunk_s: int) -> tuple[dict[int, dict], dict]:
    """Raw samples for session entrants only. The feed can also carry non-driver
    transponders (e.g. 241–243), which have no identity in the results and are skipped."""
    chunks: dict[int, dict] = {}
    coverage: dict[str, dict] = {}
    entrants = {str(x) for x in s.results["DriverNumber"]}
    for d, p in s.pos_data.items():
        if str(d) not in entrants or p is None or p.empty:
            continue
        df = p[["SessionTime", "X", "Y", "Status"]].dropna(subset=["SessionTime", "X", "Y"])
        t = (df["SessionTime"].dt.total_seconds().to_numpy() * 1000).round().astype(np.int64)
        x = df["X"].to_numpy().round().astype(np.int64)
        y = df["Y"].to_numpy().round().astype(np.int64)
        on = (df["Status"] == "OnTrack").to_numpy().astype(np.int8)
        order = np.argsort(t, kind="stable")
        t, x, y, on = t[order], x[order], y[order], on[order]
        keep = np.concatenate([[True], np.diff(t) > 0])  # drop duplicate timestamps
        t, x, y, on = t[keep], x[keep], y[keep], on[keep]
        if not len(t):
            continue
        gaps = np.diff(t)
        coverage[d] = {"samples": int(len(t)), "first_ms": int(t[0]), "last_ms": int(t[-1]), "max_gap_ms": int(gaps.max()) if len(gaps) else 0}
        cidx = t // (chunk_s * 1000)
        for c in np.unique(cidx):
            m = cidx == c
            chunks.setdefault(int(c), {})[d] = {"t": t[m].tolist(), "x": x[m].tolist(), "y": y[m].tolist(), "on": on[m].tolist()}
    return chunks, coverage


def _build_telemetry(s) -> dict[str, dict]:
    out = {}
    entrants = {str(x) for x in s.results["DriverNumber"]}
    for d, c in s.car_data.items():
        if str(d) not in entrants or c is None or c.empty:
            continue
        df = c.dropna(subset=["SessionTime"])
        t = (df["SessionTime"].dt.total_seconds().to_numpy() * 1000).round().astype(np.int64)
        order = np.argsort(t, kind="stable")
        df = df.iloc[order]
        t = t[order]
        keep = np.concatenate([[True], np.diff(t) > 0])
        df, t = df[keep], t[keep]

        def col(name, cast=float):
            v = df[name].to_numpy()
            return [None if pd.isna(a) else cast(a) for a in v]

        out[d] = {
            "t": t.tolist(),
            "speed": col("Speed", lambda a: round(float(a), 1)),
            "rpm": col("RPM", int),
            "gear": col("nGear", int),
            "throttle": col("Throttle", lambda a: round(float(a), 1)),
            "brake": col("Brake", lambda a: 1 if bool(a) else 0),
            "drs": col("DRS", int),
        }
    return out


def _pit_stops(s, meeting: dict, session: dict, t0_utc: pd.Timestamp, drivers: dict) -> dict:
    if session["session_key"] and meeting["year"] >= openf1_provider.FIRST_YEAR:
        rows = openf1_provider.get("pit", {"session_key": session["session_key"]})
        stops = []
        for r in rows:
            date = pd.Timestamp(r["date"]) if r.get("date") else None
            stops.append(
                {
                    "driver_number": str(r["driver_number"]),
                    "lap": r.get("lap_number"),
                    "time": round((date.tz_convert("UTC").tz_localize(None) - t0_utc).total_seconds(), 3) if date is not None else None,
                    "lane_duration": r.get("lane_duration", r.get("pit_duration")),
                    "stop_duration": r.get("stop_duration"),
                }
            )
        if stops:
            return {
                "rows": sorted(stops, key=lambda r: (r["time"] or 0)),
                "source": {"provider": "OpenF1", "origin": "OpenF1 /pit (historical)", "calculated": False,
                           "note": "Stationary time is published only from the 2024 United States GP onward."},
            }
    laps = s.laps
    stops = []
    for d, g in laps.groupby("DriverNumber"):
        g = g.sort_values("LapNumber")
        ins = g[g["PitInTime"].notna()]
        for _, lap in ins.iterrows():
            nxt = g[g["LapNumber"] == lap["LapNumber"] + 1]
            out_t = nxt["PitOutTime"].iloc[0] if len(nxt) and pd.notna(nxt["PitOutTime"].iloc[0]) else None
            stops.append(
                {
                    "driver_number": str(d),
                    "lap": _int(lap["LapNumber"]),
                    "time": _secs(lap["PitInTime"]),
                    "lane_duration": round(pd.Timedelta(out_t - lap["PitInTime"]).total_seconds(), 3) if out_t is not None else None,
                    "stop_duration": None,
                }
            )
    return {
        "rows": sorted(stops, key=lambda r: (r["time"] or 0)),
        "source": _source(calculated=True, note="Pit-lane time = next lap's PitOutTime − PitInTime from FastF1 lap timing. Stationary time unavailable."),
    }


def _results(s, laps: pd.DataFrame, kind: str) -> dict:
    r = s.results
    best = laps[laps["LapTime"].notna() & (laps["Deleted"] != True)].groupby("DriverNumber")["LapTime"].min()  # noqa: E712
    rows = []
    for _, x in r.iterrows():
        d = str(x["DriverNumber"])
        rows.append(
            {
                "driver_number": d,
                "position": _int(x["Position"]),
                "classified_position": _str(x["ClassifiedPosition"]),
                "grid": _int(x["GridPosition"]) if _num(x["GridPosition"]) not in (None, 0.0) else None,
                "status": _str(x["Status"]),
                "time": _secs(x["Time"]),
                "points": _num(x["Points"]),
                "laps": _int(x["Laps"]),
                "q1": _secs(x["Q1"]),
                "q2": _secs(x["Q2"]),
                "q3": _secs(x["Q3"]),
                "best_lap": _secs(best.get(d)),
            }
        )
    calculated = False
    if all(row["position"] is None for row in rows):
        # Practice: FastF1 publishes no classification, so rank by fastest recorded lap.
        rows.sort(key=lambda row: (row["best_lap"] is None, row["best_lap"] or 0))
        for i, row in enumerate(rows):
            row["position"] = i + 1 if row["best_lap"] is not None else None
        calculated = True
    else:
        rows.sort(key=lambda row: (row["position"] is None, row["position"] or 99))
    note = "Order ranked by each driver's fastest non-deleted lap from FastF1 lap timing." if calculated else None
    if kind == "race" and not calculated:
        note = "`time` is the winner's race time; for other classified drivers FastF1 reports the gap to the winner."
    return {"rows": rows, "source": _source(calculated=calculated, note=note, best_lap_note="best_lap = minimum non-deleted LapTime (calculated)")}


def _laps(laps: pd.DataFrame) -> list[dict]:
    out = []
    for _, l in laps.sort_values(["DriverNumber", "LapNumber"]).iterrows():
        out.append(
            {
                "driver_number": str(l["DriverNumber"]),
                "lap": _int(l["LapNumber"]),
                "start": _secs(l["LapStartTime"]),
                "end": _secs(l["Time"]),
                "lap_time": _secs(l["LapTime"]),
                "s1": _secs(l["Sector1Time"]),
                "s2": _secs(l["Sector2Time"]),
                "s3": _secs(l["Sector3Time"]),
                "s1_end": _secs(l["Sector1SessionTime"]),
                "s2_end": _secs(l["Sector2SessionTime"]),
                "compound": _str(l["Compound"]),
                "tyre_life": _int(l["TyreLife"]),
                "stint": _int(l["Stint"]),
                "pit_in": _secs(l["PitInTime"]),
                "pit_out": _secs(l["PitOutTime"]),
                "position": _int(l["Position"]),
                "track_status": _str(l["TrackStatus"]),
                "deleted": bool(l["Deleted"]) if pd.notna(l["Deleted"]) else False,
                "personal_best": bool(l["IsPersonalBest"]) if pd.notna(l["IsPersonalBest"]) else False,
                "speed_trap": _num(l["SpeedST"]),
            }
        )
    return out


def _stints(laps: pd.DataFrame) -> list[dict]:
    out = []
    for (d, st), g in laps.dropna(subset=["Stint"]).groupby(["DriverNumber", "Stint"]):
        g = g.sort_values("LapNumber")
        out.append(
            {
                "driver_number": str(d),
                "stint": int(st),
                "compound": _str(g["Compound"].iloc[0]),
                "lap_start": _int(g["LapNumber"].iloc[0]),
                "lap_end": _int(g["LapNumber"].iloc[-1]),
                "tyre_life_start": _int(g["TyreLife"].iloc[0]),
                "fresh": bool(g["FreshTyre"].iloc[0]) if pd.notna(g["FreshTyre"].iloc[0]) else None,
            }
        )
    return out


def _process(sid: str) -> None:
    meeting, session = catalog_service.resolve_session(sid)
    if not session["replay_available"]:
        raise DataUnavailable(session["unavailable_reason"] or "Session data is unavailable")
    started = time.time()
    s = fastf1_provider.load_session(meeting["year"], meeting["round"], session["name"])
    fc = _fc()
    base = f"{sid}"
    t0_utc = pd.Timestamp(s.t0_date)
    laps = s.laps

    res = s.results
    drivers = {}
    for _, x in res.iterrows():
        d = str(x["DriverNumber"])
        color = _color(x.get("TeamColor"))
        drivers[d] = {
            "driver_number": d,
            "abbreviation": _str(x["Abbreviation"]),
            "first_name": _str(x["FirstName"]),
            "last_name": _str(x["LastName"]),
            "full_name": _str(x["FullName"]),
            "broadcast_name": _str(x["BroadcastName"]),
            "team_name": _str(x["TeamName"]),
            "team_id": _str(x.get("TeamId")),
            "driver_id": _str(x.get("DriverId")),
            "team_color": color or "#8b8f99",
            "team_color_official": color is not None,
            "country_code": _str(x.get("CountryCode")),
            "headshot_url": _str(x.get("HeadshotUrl")),
        }

    chunks, coverage = _build_locations(s, get_settings().location_chunk_s)
    if not chunks:
        raise DataUnavailable("FastF1 returned no position samples for this session")
    for c, data in chunks.items():
        fc.put(f"{base}/locations/{c}", data)
    telemetry = _build_telemetry(s)
    for d, data in telemetry.items():
        fc.put(f"{base}/telemetry/{d}", data)

    clean = _clean_laps(laps)
    fc.put(f"{base}/track", _build_track(s, clean))
    fc.put(f"{base}/results", _results(s, laps, session["kind"]))
    fc.put(f"{base}/laps", {"rows": _laps(laps), "source": _source(calculated=False)})
    fc.put(f"{base}/stints", {"rows": _stints(laps), "source": _source(calculated=True, note="Stints grouped from FastF1 per-lap Stint/Compound/TyreLife.")})
    fc.put(f"{base}/pit-stops", _pit_stops(s, meeting, session, t0_utc, drivers))

    w = s.weather_data
    fc.put(
        f"{base}/weather",
        {
            "rows": [
                {
                    "time": _secs(r["Time"]),
                    "air_temp": _num(r["AirTemp"], 1),
                    "track_temp": _num(r["TrackTemp"], 1),
                    "humidity": _num(r["Humidity"], 1),
                    "pressure": _num(r["Pressure"], 1),
                    "rainfall": bool(r["Rainfall"]) if pd.notna(r["Rainfall"]) else None,
                    "wind_direction": _int(r["WindDirection"]),
                    "wind_speed": _num(r["WindSpeed"], 1),
                }
                for _, r in (w if w is not None else pd.DataFrame()).iterrows()
            ],
            "source": _source(calculated=False, units={"temp": "°C", "pressure": "mbar", "wind_speed": "m/s"}),
        },
    )
    rc = s.race_control_messages
    fc.put(
        f"{base}/race-control",
        {
            "rows": [
                {
                    "time": round((pd.Timestamp(r["Time"]) - t0_utc).total_seconds(), 3) if pd.notna(r["Time"]) else None,
                    "category": _str(r.get("Category")),
                    "flag": _str(r.get("Flag")),
                    "scope": _str(r.get("Scope")),
                    "sector": _int(r.get("Sector")),
                    "driver_number": _str(r.get("RacingNumber")),
                    "lap": _int(r.get("Lap")),
                    "message": _str(r.get("Message")),
                }
                for _, r in (rc if rc is not None else pd.DataFrame()).iterrows()
            ],
            "source": _source(calculated=False),
        },
    )
    ts = s.track_status
    fc.put(
        f"{base}/track-status",
        {
            "rows": [{"time": _secs(r["Time"]), "status": _str(r["Status"]), "message": _str(r["Message"])} for _, r in (ts if ts is not None else pd.DataFrame()).iterrows()],
            "source": _source(calculated=False, note="Status codes: 1 clear, 2 yellow, 4 safety car, 5 red, 6 VSC deployed, 7 VSC ending."),
        },
    )

    first = min(v["first_ms"] for v in coverage.values()) / 1000
    last = max(v["last_ms"] for v in coverage.values()) / 1000
    start_time = _secs(s.session_start_time) if getattr(s, "session_start_time", None) is not None else None
    total_laps = int(laps["LapNumber"].max()) if len(laps) else None
    fc.put(
        f"{base}/drivers",
        {"rows": list(drivers.values()), "source": _source(calculated=False, note="Team colours are the per-session values from the F1 driver list; '#8b8f99' marks a neutral fallback where none was published.")},
    )
    info = {
        "id": sid,
        "session_key": session["session_key"],
        "meeting_key": meeting["meeting_key"],
        "meeting_id": meeting["id"],
        "year": meeting["year"],
        "round": meeting["round"],
        "meeting_name": meeting["name"],
        "official_name": meeting["official_name"],
        "country": meeting["country"],
        "location": meeting["location"],
        "circuit_short_name": (s.session_info or {}).get("Meeting", {}).get("Circuit", {}).get("ShortName"),
        "session_name": session["name"],
        "session_code": session["code"],
        "kind": session["kind"],
        "date_utc": session["date_utc"],
        "t0_utc": t0_utc.isoformat() + "Z",
        "timeline": {"first_sample": first, "last_sample": last, "session_start": start_time, "chunk_s": get_settings().location_chunk_s, "chunks": sorted(chunks)},
        "total_laps": total_laps,
        "location_coverage": coverage,
        "telemetry_drivers": sorted(telemetry),
        "processing": {"version": PROCESSING_VERSION, "processed_at": datetime.now(timezone.utc).isoformat(), "seconds": round(time.time() - started, 1)},
        "sources": [
            {**FASTF1_SOURCE, "datasets": ["drivers", "results", "laps", "locations", "telemetry", "weather", "race-control", "track-status", "stints", "track"]},
            *([{"provider": "OpenF1", "origin": "OpenF1 historical API", "datasets": ["pit-stops"]}] if meeting["year"] >= openf1_provider.FIRST_YEAR and session["session_key"] else []),
        ],
    }
    fc.put(f"{base}/info", info)
    log.info("Processed %s in %.1fs", sid, time.time() - started)


def ensure(sid: str) -> None:
    fc = _fc()
    if fc.exists(f"{sid}/info"):
        info = fc.get(f"{sid}/info")
        if info and info.get("processing", {}).get("version") == PROCESSING_VERSION:
            return
    with _lock(sid):
        if fc.exists(f"{sid}/info") and fc.get(f"{sid}/info").get("processing", {}).get("version") == PROCESSING_VERSION:
            return
        _process(sid)


def get(sid: str, dataset: str) -> Any:
    ensure(sid)
    data = _fc().get(f"{sid}/{dataset}")
    if data is None:
        raise DataUnavailable(f"{dataset} is not available for session {sid}")
    return data


def cache_meta(sid: str) -> dict:
    info = _fc().get(f"{sid}/info") or {}
    return {"served_from": "local processed cache", "processed_at": info.get("processing", {}).get("processed_at")}


def locations(sid: str, start: float, end: float, drivers: list[str] | None) -> dict:
    info = get(sid, "info")
    max_w = get_settings().max_window_s
    if end <= start:
        raise BadRequest("end must be greater than start")
    if end - start > max_w:
        raise BadRequest(f"window may not exceed {max_w} s")
    chunk_s = info["timeline"]["chunk_s"]
    a_ms, b_ms = int(start * 1000), int(end * 1000)
    out: dict[str, dict[str, list]] = {}
    for c in range(int(start // chunk_s), int(end // chunk_s) + 1):
        if c not in info["timeline"]["chunks"]:
            continue
        chunk = _fc().get(f"{sid}/locations/{c}") or {}
        for d, v in chunk.items():
            if drivers and d not in drivers:
                continue
            t = np.asarray(v["t"])
            m = (t >= a_ms) & (t < b_ms)
            if not m.any():
                continue
            dst = out.setdefault(d, {"t": [], "x": [], "y": [], "on": []})
            for k in ("t", "x", "y", "on"):
                dst[k].extend(np.asarray(v[k])[m].tolist())
    return {
        "session_id": sid,
        "start": start,
        "end": end,
        "time_unit": "ms (FastF1 SessionTime)",
        "coordinate_unit": "decimetre (FastF1 X/Y source frame)",
        "drivers": out,
        "source": _source(calculated=False, note="Raw recorded position samples (~4 Hz). No resampling or interpolation."),
    }


def telemetry(sid: str, driver: str, start: float | None, end: float | None, lap: int | None) -> dict:
    info = get(sid, "info")
    if driver not in info["telemetry_drivers"]:
        raise NotFound(f"No car telemetry for driver {driver} in session {sid}")
    data = _fc().get(f"{sid}/telemetry/{driver}")
    if lap is not None:
        rows = [l for l in get(sid, "laps")["rows"] if l["driver_number"] == driver and l["lap"] == lap]
        if not rows or rows[0]["start"] is None or rows[0]["end"] is None:
            raise DataUnavailable(f"Lap {lap} timing is unavailable for driver {driver}")
        start, end = rows[0]["start"], rows[0]["end"]
    if start is None or end is None:
        start, end = info["timeline"]["first_sample"], info["timeline"]["last_sample"] + 1
    t = np.asarray(data["t"])
    m = (t >= start * 1000) & (t <= end * 1000)
    return {
        "session_id": sid,
        "driver_number": driver,
        "start": start,
        "end": end,
        "lap": lap,
        "time_unit": "ms (FastF1 SessionTime)",
        "channels": {k: np.asarray(v, dtype=object)[m].tolist() for k, v in data.items()},
        "units": {"speed": "km/h", "rpm": "rpm", "gear": "gear", "throttle": "%", "brake": "on/off", "drs": "raw F1 DRS code (10, 12, 14 = open; 8 = eligible)"},
        "source": _source(calculated=False, note="Raw car-data samples (~4 Hz)."),
    }
