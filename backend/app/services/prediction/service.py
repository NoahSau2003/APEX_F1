"""Orchestrate forecast generation for upcoming races."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import numpy as np

from app.services import catalog_service, season_service

from . import calendar, features, field, grid_state, history_engine, news_intel, snapshots, trainer, weather, weekend_pace
from .calendar import STAGE_EARLY, STAGE_PRE_RACE


def _circuit_meta(meeting: dict) -> tuple[str, str | None]:
    year, rnd = meeting["year"], meeting["round"]
    try:
        for race in season_service.results(year)["races"]:
            if int(race["round"]) == rnd:
                return race["circuit"], race.get("locality")
    except Exception:
        pass
    return meeting.get("location") or meeting.get("name") or "Unknown", meeting.get("location")


def _wet_from_forecast(wf: dict) -> float:
    if not wf.get("available"):
        return 0.0
    row = wf.get("hourly_at_race_start") or {}
    prob = row.get("precipitation_probability_pct")
    if prob is None:
        return 0.0
    return min(1.0, float(prob) / 100.0)


def _explain(row: dict[str, Any]) -> list[dict[str, Any]]:
    keys = [
        ("grid_gap_to_pole", "Grid gap to pole", True),
        ("quali_pace_norm", "Qualifying pace vs pole (FastF1)", True),
        ("fp_pace_norm", "Practice pace vs best (FastF1)", True),
        ("roll5_avg_pos", "Recent race form", True),
        ("roll5_quali_to_race", "Quali → race conversion (5-race)", False),
        ("wet_skill", "Wet vs dry form (historical)", False),
        ("sprint_avg_pos5", "Recent sprint results", True),
        ("circuit_avg_pos", "Circuit history", True),
    ]
    out = []
    for key, label, lower_better in keys:
        val = float(row.get(key, 0.0))
        out.append({"feature": key, "label": label, "value": round(val, 3), "lower_is_better": lower_better})
    return sorted(out, key=lambda x: abs(x["value"]), reverse=True)[:6]


def generate_forecast(event_id: str, stage: str, *, now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    ev = calendar.assert_can_predict(event_id, stage, now=now)
    meeting = catalog_service.meeting(event_id)
    news = news_intel.for_event(event_name=meeting["name"], location=meeting.get("location"), country=meeting.get("country"))
    drivers, warnings = field.entry_list(meeting, news.get("items") or [])
    grid_map, quali_map, sprint_grid, sprint_finish, quali_gap, grid_source, grid_warnings = grid_state.grid_bundle(
        meeting, stage, drivers, news.get("items") or []
    )
    warnings.extend(grid_warnings)
    wf = weather.forecast_for_event(event_id)
    wet = _wet_from_forecast(wf)
    circuit, locality = _circuit_meta(meeting)
    wk_pace = weekend_pace.pace_features(meeting=meeting, stage=stage, drivers=drivers)
    feat_rows = history_engine.features_for_upcoming(
        year=meeting["year"],
        round_number=meeting["round"],
        circuit=circuit,
        locality=locality,
        drivers=drivers,
        grid_by_driver=grid_map if stage != STAGE_EARLY else {d["driver_id"]: None for d in drivers},
        quali_by_driver=quali_map if stage != STAGE_EARLY else {d["driver_id"]: None for d in drivers},
        sprint_grid_by_driver=sprint_grid,
        sprint_finish_by_driver=sprint_finish if stage == STAGE_PRE_RACE else {d["driver_id"]: None for d in drivers},
        weekend_pace=wk_pace,
        wet_indicator=wet,
        quali_gap_by_driver=quali_gap if stage != STAGE_EARLY else None,
    )
    model = trainer.load_or_train_model()
    X = np.array([history_engine.feature_vector(r) for r in feat_rows])
    pred_pos = model.predict(X)
    win_probs = trainer.positions_to_win_probs(pred_pos)
    order = np.argsort(pred_pos)
    colors = {}
    try:
        colors = season_service.team_colors(meeting["year"]).get("colors") or {}
    except Exception:
        pass

    driver_preds = []
    for rank, idx in enumerate(order, start=1):
        row = feat_rows[int(idx)]
        did = row["driver_id"]
        meta = next(d for d in drivers if d["driver_id"] == did)
        exp_pos = float(pred_pos[int(idx)])
        podium_p = min(1.0, win_probs[int(idx)] * 2.2 + max(0.0, (4.0 - exp_pos) / 10.0))
        top10_p = min(1.0, max(0.05, (11.0 - exp_pos) / 10.0))
        driver_preds.append(
            {
                "driver_id": did,
                "code": meta.get("code"),
                "given_name": meta["given_name"],
                "family_name": meta["family_name"],
                "constructor_id": meta["constructor_id"],
                "constructor": meta["constructor"],
                "team_color": colors.get(meta["constructor_id"], "#888888"),
                "predicted_position": rank,
                "expected_position": round(exp_pos, 2),
                "win_probability": round(float(win_probs[int(idx)]), 4),
                "podium_probability": round(podium_p, 4),
                "top10_probability": round(top10_p, 4),
                "explanation": _explain(row),
                "features": {k: round(float(row.get(k, 0.0)), 4) for k in history_engine.FEATURE_NAMES},
            }
        )

    generated_at = now.isoformat().replace("+00:00", "Z")
    payload = {
        "event_id": event_id,
        "event": ev,
        "stage": stage,
        "generated_at": generated_at,
        "cutoff_utc": generated_at,
        "model": {"name": trainer.model_display_name(), "version": trainer.MODEL_VERSION},
        "grid_source": grid_source,
        "drivers": driver_preds,
        "weather": wf,
        "news": {"items": news["items"][:12], "fetched_at": news.get("fetched_at")},
        "feature_names": list(history_engine.FEATURE_NAMES),
        "warnings": warnings,
        "sources": {
            "historical_results": "Jolpica-F1",
            "qualifying": "OpenF1 session_result + Jolpica qualifying",
            "weekend_pace": "FastF1 lap times (completed sessions only)",
            "calendar": "FastF1 event schedule",
            "news": "Public RSS (penalties applied when confirmed)",
            "weather": wf.get("source"),
            "wet_history": "OpenF1 race weather (2023+)",
        },
    }
    return snapshots.save(event_id, payload)


def model_info() -> dict[str, Any]:
    return {
        "model": {"name": trainer.model_display_name(), "version": trainer.MODEL_VERSION},
        "train_status": trainer.train_status(),
        "selection": (trainer.read_meta() or {}).get("selection"),
        "features": history_engine.FEATURE_NAMES,
        "evaluation": trainer.evaluation_report(),
        "baselines": trainer.baseline_comparison(),
        "notes": [
            "Champion model is chosen by chronological walk-forward MAE among HistGBM, ExtraTrees, and XGBoost.",
            "Training runs on startup when no cached champion exists; forecasts reuse the saved model.",
            "Win probabilities remain softmax estimates from predicted finishing positions.",
        ],
    }
