"""FastF1 practice / qualifying / sprint pace for the current weekend (stage cutoffs)."""

from __future__ import annotations

import logging
from app.core.errors import DataUnavailable, UpstreamError
from app.providers import fastf1_provider, openf1_provider

from .calendar import STAGE_EARLY, STAGE_POST_Q, STAGE_PRE_RACE

log = logging.getLogger("apex.prediction.weekend")

FASTF1_NAMES = {"FP1": "FP1", "FP2": "FP2", "FP3": "FP3", "Q": "Q", "SQ": "SQ", "S": "S"}


def _session(meeting: dict, code: str) -> dict | None:
    return next((s for s in meeting.get("sessions") or [] if s.get("code") == code), None)


def _allowed_sessions(stage: str, meeting: dict) -> list[str]:
    codes = [s.get("code") for s in meeting.get("sessions") or [] if s.get("code")]
    if stage == STAGE_EARLY:
        return [c for c in ("FP1", "FP2", "FP3") if c in codes]
    if stage == STAGE_POST_Q:
        return [c for c in ("FP1", "FP2", "FP3", "Q", "SQ") if c in codes]
    base = [c for c in ("FP1", "FP2", "FP3", "Q", "SQ") if c in codes]
    if "S" in codes:
        base.append("S")
    return base


def _session_ok(meeting: dict, code: str, stage: str) -> bool:
    s = _session(meeting, code)
    if not s or s.get("status") != "completed":
        return False
    if stage == STAGE_EARLY and code in ("Q", "SQ", "S"):
        return False
    if stage == STAGE_POST_Q and code == "S":
        return False
    return True


def _driver_map(drivers: list[dict], meeting: dict, code: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for d in drivers:
        if d.get("code"):
            out[d["code"].upper()] = d["driver_id"]
    sess = _session(meeting, code)
    if sess and sess.get("session_key"):
        for row in openf1_provider.get("drivers", {"session_key": int(sess["session_key"])}, max_age_s=3600):
            num = row.get("driver_number")
            if num is None:
                continue
            for d in drivers:
                if str(d.get("number")) == str(num):
                    abbr = (row.get("name_acronym") or d.get("code") or "")[:3].upper()
                    if abbr:
                        out[abbr] = d["driver_id"]
                    break
    return out


def _best_lap_seconds(session) -> dict[str, float]:
    best: dict[str, float] = {}
    if session.laps is None or session.laps.empty:
        return best
    for drv in session.laps["Driver"].unique():
        try:
            fl = session.laps.pick_driver(drv).pick_fastest()
            if fl is not None and fl["LapTime"] is not None:
                best[str(drv)] = float(fl["LapTime"].total_seconds())
        except Exception:
            continue
    return best


def _sector_balance(session, mapping: dict[str, str]) -> dict[str, float]:
    """Lower = more balanced sectors vs field (less weak sector)."""
    if session.laps is None or session.laps.empty:
        return {}
    out: dict[str, float] = {}
    sector_cols = [c for c in ("Sector1Time", "Sector2Time", "Sector3Time") if c in session.laps.columns]
    if len(sector_cols) < 2:
        return {}
    for abbr, did in mapping.items():
        try:
            laps = session.laps.pick_driver(abbr)
            fl = laps.pick_fastest()
            if fl is None:
                continue
            secs = []
            for col in sector_cols:
                val = fl[col]
                if val is not None and str(val) != "NaT":
                    secs.append(float(val.total_seconds()))
            if len(secs) >= 2:
                out[did] = float(max(secs) - min(secs))
        except Exception:
            continue
    if not out:
        return {}
    best = min(out.values())
    worst = max(out.values()) or 1.0
    return {did: (v - best) / max(worst - best, 0.001) for did, v in out.items()}


def pace_features(*, meeting: dict, stage: str, drivers: list[dict]) -> dict[str, dict[str, float]]:
    year, rnd = meeting["year"], meeting["round"]
    out = {d["driver_id"]: {"fp_pace_norm": 0.0, "quali_pace_norm": 0.0, "sector_pace_norm": 0.0} for d in drivers}
    fp_times: list[float] = []
    q_times: list[float] = []
    fp_by_driver: dict[str, float] = {}
    q_by_driver: dict[str, float] = {}
    sector_by_driver: dict[str, float] = {}

    for code in _allowed_sessions(stage, meeting):
        if not _session_ok(meeting, code, stage):
            continue
        fname = FASTF1_NAMES.get(code)
        if not fname:
            continue
        try:
            session = fastf1_provider.load_session(year, rnd, fname, laps_only=True)
        except (DataUnavailable, UpstreamError) as e:
            log.info("weekend pace skip %s: %s", code, e)
            continue
        best = _best_lap_seconds(session)
        mapping = _driver_map(drivers, meeting, code)
        sectors = _sector_balance(session, mapping)
        for abbr, secs in best.items():
            did = mapping.get(abbr.upper()) or mapping.get(abbr)
            if not did:
                continue
            if code in ("FP1", "FP2", "FP3"):
                fp_by_driver[did] = min(fp_by_driver.get(did, secs), secs)
                fp_times.append(secs)
            if code in ("Q", "SQ"):
                q_by_driver[did] = min(q_by_driver.get(did, secs), secs)
                q_times.append(secs)
                if did in sectors:
                    sector_by_driver[did] = min(sector_by_driver.get(did, sectors[did]), sectors[did])

    fp_pole = min(fp_times) if fp_times else None
    q_pole = min(q_times) if q_times else None
    for did in out:
        if did in fp_by_driver and fp_pole:
            out[did]["fp_pace_norm"] = (fp_by_driver[did] - fp_pole) / fp_pole
        if did in q_by_driver and q_pole:
            out[did]["quali_pace_norm"] = (q_by_driver[did] - q_pole) / q_pole
        out[did]["sector_pace_norm"] = sector_by_driver.get(did, 0.0)
    return out
