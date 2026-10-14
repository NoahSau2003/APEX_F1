"""Train, select, and cache the best local model via chronological walk-forward."""

from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path
from typing import Any, Callable

import joblib
import numpy as np
from sklearn.ensemble import ExtraTreesRegressor, HistGradientBoostingRegressor

from app.core.config import get_settings

from . import features

log = logging.getLogger("apex.prediction.train")

MODEL_VERSION = "2.2.0"
CHAMPION_FILE = "champion.joblib"

_train_lock = threading.Lock()
_train_state: dict[str, Any] = {"status": "unknown", "started_at": None, "finished_at": None, "error": None}


def _model_dir() -> Path:
    p = get_settings().processed_dir / "prediction" / "models"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _eval_path() -> Path:
    return _model_dir() / "evaluation.json"


def _model_path() -> Path:
    return _model_dir() / CHAMPION_FILE


def _meta_path() -> Path:
    return _model_dir() / "meta.json"


def train_status() -> dict[str, Any]:
    meta = read_meta()
    return {
        **_train_state,
        "model_ready": _model_path().exists() and meta is not None,
        "algorithm": meta.get("algorithm") if meta else None,
        "version": meta.get("version") if meta else None,
        "trained_at": meta.get("trained_at") if meta else None,
    }


def read_meta() -> dict[str, Any] | None:
    p = _meta_path()
    if not p.exists():
        return None
    return json.loads(p.read_text())


def model_display_name() -> str:
    meta = read_meta()
    if meta and meta.get("algorithm"):
        return str(meta["algorithm"])
    return "hist_gbm"


def positions_to_win_probs(positions: np.ndarray, temperature: float = 2.5) -> np.ndarray:
    scores = -positions / max(temperature, 0.1)
    scores = scores - scores.max()
    ex = np.exp(scores)
    return ex / ex.sum()


def _rank_corr(pred: list[float], actual: list[float]) -> float:
    if len(pred) < 2:
        return 0.0
    a = np.argsort(np.argsort(pred))
    b = np.argsort(np.argsort(actual))
    c = np.corrcoef(a, b)[0, 1]
    return float(c) if c == c else 0.0


def _candidates() -> list[tuple[str, Callable[[], Any]]]:
    out: list[tuple[str, Callable[[], Any]]] = [
        (
            "hist_gbm",
            lambda: HistGradientBoostingRegressor(max_depth=8, learning_rate=0.05, max_iter=220, random_state=42),
        ),
        (
            "extra_trees",
            lambda: ExtraTreesRegressor(n_estimators=240, max_depth=14, min_samples_leaf=2, random_state=42, n_jobs=-1),
        ),
    ]
    try:
        from xgboost import XGBRegressor

        out.append(
            (
                "xgboost",
                lambda: XGBRegressor(
                    objective="reg:squarederror",
                    n_estimators=320,
                    max_depth=6,
                    learning_rate=0.05,
                    subsample=0.85,
                    colsample_bytree=0.85,
                    reg_lambda=1.0,
                    random_state=42,
                    n_jobs=-1,
                ),
            )
        )
    except ImportError:
        log.info("xgboost not installed; model selection skips XGBoost")
    return out


def _walk_forward_mae(
    make_model: Callable[[], Any],
    X: np.ndarray,
    y: np.ndarray,
    keys: list[tuple[int, int]],
    *,
    min_train: int = 80,
    holdout_from_year: int = 2023,
) -> float | None:
    unique_races = sorted(set(keys))
    eval_races = [k for k in unique_races if k[0] >= holdout_from_year]
    maes: list[float] = []
    for yr, rnd in eval_races:
        train_mask = np.array([(k[0], k[1]) < (yr, rnd) for k in keys])
        test_mask = np.array([(k[0], k[1]) == (yr, rnd) for k in keys])
        if train_mask.sum() < min_train or test_mask.sum() == 0:
            continue
        model = make_model()
        model.fit(X[train_mask], y[train_mask])
        pred = model.predict(X[test_mask])
        maes.append(float(np.mean(np.abs(pred - y[test_mask]))))
    return float(np.mean(maes)) if maes else None


def _select_algorithm(X: np.ndarray, y: np.ndarray, keys: list[tuple[int, int]]) -> tuple[str, Callable[[], Any], list[dict[str, Any]]]:
    scored: list[tuple[str, Callable[[], Any], float]] = []
    leaderboard: list[dict[str, Any]] = []
    for name, factory in _candidates():
        mae = _walk_forward_mae(factory, X, y, keys)
        if mae is None:
            continue
        scored.append((name, factory, mae))
        leaderboard.append({"algorithm": name, "walk_forward_mean_mae": round(mae, 4)})
    if not scored:
        factory = _candidates()[0][1]
        return "hist_gbm", factory, leaderboard
    scored.sort(key=lambda x: x[2])
    winner = scored[0]
    leaderboard.sort(key=lambda x: x["walk_forward_mean_mae"])
    log.info("Model selection winner: %s (MAE %.4f)", winner[0], winner[2])
    return winner[0], winner[1], leaderboard


def walk_forward_eval(*, min_train: int = 80, holdout_from_year: int = 2023) -> dict[str, Any]:
    meta = read_meta()
    rows, labels = features.build_training_rows(use_grid=True)
    if len(rows) < min_train + 5:
        return {"races_evaluated": 0, "note": "Insufficient historical races for walk-forward evaluation"}
    X_all = np.array([features.feature_vector(r) for r in rows])
    y_all = np.array(labels)
    keys = [(r["year"], r["round"]) for r in rows]
    factory = None
    algo = meta.get("algorithm") if meta else "hist_gbm"
    for name, fac in _candidates():
        if name == algo:
            factory = fac
            break
    if factory is None:
        factory = _candidates()[0][1]
    unique_races = sorted(set(keys))
    eval_races = [k for k in unique_races if k[0] >= holdout_from_year]
    metrics = []
    for yr, rnd in eval_races:
        train_mask = np.array([(k[0], k[1]) < (yr, rnd) for k in keys])
        test_mask = np.array([(k[0], k[1]) == (yr, rnd) for k in keys])
        if train_mask.sum() < min_train or test_mask.sum() == 0:
            continue
        model = factory()
        model.fit(X_all[train_mask], y_all[train_mask])
        pred = model.predict(X_all[test_mask])
        actual = y_all[test_mask]
        mae = float(np.mean(np.abs(pred - actual)))
        winner_idx = int(np.argmin(pred))
        actual_winner_idx = int(np.argmin(actual))
        metrics.append(
            {
                "year": yr,
                "round": rnd,
                "mae": mae,
                "winner_correct": winner_idx == actual_winner_idx,
                "rank_correlation": _rank_corr(list(pred), list(actual)),
                "top3_overlap": len(set(np.argsort(pred)[:3]) & set(np.argsort(actual)[:3])),
            }
        )
    if not metrics:
        return {"races_evaluated": 0, "note": "No holdout races met training thresholds"}
    summary = {
        "races_evaluated": len(metrics),
        "period": f"{metrics[0]['year']} R{metrics[0]['round']} – {metrics[-1]['year']} R{metrics[-1]['round']}",
        "mean_mae": float(np.mean([m["mae"] for m in metrics])),
        "winner_accuracy": float(np.mean([1.0 if m["winner_correct"] else 0.0 for m in metrics])),
        "mean_rank_correlation": float(np.mean([m["rank_correlation"] for m in metrics])),
        "mean_top3_overlap": float(np.mean([m["top3_overlap"] for m in metrics])),
        "model": algo,
        "model_version": MODEL_VERSION,
        "rows": metrics[-12:],
    }
    _eval_path().write_text(json.dumps({"computed_at": time.time(), "summary": summary}, indent=2))
    return summary


def _model_is_current() -> bool:
    if not _model_path().exists() or not _meta_path().exists():
        return False
    meta = read_meta()
    return bool(
        meta
        and meta.get("feature_names") == features.FEATURE_NAMES
        and meta.get("version") == MODEL_VERSION
    )


def train_champion(*, force: bool = False) -> dict[str, Any]:
    """Select best algorithm via walk-forward MAE, fit on full history, save champion."""
    with _train_lock:
        if _model_is_current() and not force:
            return read_meta() or {}
        _train_state.update({"status": "training", "started_at": time.time(), "finished_at": None, "error": None})
        try:
            log.info("Building training matrix…")
            rows, labels = features.build_training_rows(use_grid=True)
            X = np.array([features.feature_vector(r) for r in rows])
            y = np.array(labels)
            keys = [(r["year"], r["round"]) for r in rows]
            log.info("Selecting model (%d rows, %d features)…", len(rows), len(features.FEATURE_NAMES))
            algo, factory, leaderboard = _select_algorithm(X, y, keys)
            log.info("Training champion %s on full history…", algo)
            model = factory()
            model.fit(X, y)
            joblib.dump(model, _model_path())
            meta = {
                "version": MODEL_VERSION,
                "algorithm": algo,
                "feature_names": features.FEATURE_NAMES,
                "trained_at": time.time(),
                "training_rows": len(rows),
                "selection": {"leaderboard": leaderboard, "winner": algo},
            }
            _meta_path().write_text(json.dumps(meta, indent=2))
            eval_summary = walk_forward_eval()
            meta["evaluation"] = eval_summary
            _meta_path().write_text(json.dumps(meta, indent=2))
            _train_state.update({"status": "ready", "finished_at": time.time(), "error": None})
            return meta
        except Exception as e:
            log.exception("Model training failed")
            _train_state.update({"status": "error", "finished_at": time.time(), "error": str(e)})
            raise


def ensure_model_ready(*, force: bool = False) -> None:
    if _model_is_current() and not force:
        _train_state["status"] = "ready"
        return
    train_champion(force=force)


def load_or_train_model(*, force: bool = False) -> Any:
    if _model_is_current() and not force:
        return joblib.load(_model_path())
    train_champion(force=True)
    return joblib.load(_model_path())


def pretrain_in_background(*, force: bool = False) -> None:
    def _run():
        try:
            ensure_model_ready(force=force)
        except Exception:
            pass

    if _model_is_current() and not force:
        _train_state["status"] = "ready"
        return
    if _train_state.get("status") == "training":
        return
    threading.Thread(target=_run, name="apex-prediction-pretrain", daemon=True).start()


def evaluation_report() -> dict[str, Any]:
    p = _eval_path()
    if p.exists():
        return json.loads(p.read_text())["summary"]
    return walk_forward_eval()


def baseline_comparison() -> dict[str, Any]:
    rows, labels = features.build_training_rows(use_grid=True)
    keys = [(r["year"], r["round"]) for r in rows]
    unique_races = sorted(set(keys))
    eval_races = [k for k in unique_races if k[0] >= 2023]
    form_mae, grid_mae = [], []
    for yr, rnd in eval_races:
        test_idx = [i for i, k in enumerate(keys) if k == (yr, rnd)]
        if not test_idx:
            continue
        form_pred = [rows[i]["roll3_avg_pos"] for i in test_idx]
        grid_pred = [rows[i]["grid_position"] for i in test_idx]
        actual = [labels[i] for i in test_idx]
        form_mae.append(float(np.mean(np.abs(np.array(form_pred) - np.array(actual)))))
        grid_mae.append(float(np.mean(np.abs(np.array(grid_pred) - np.array(actual)))))
    return {
        "form_baseline_mae": float(np.mean(form_mae)) if form_mae else None,
        "grid_baseline_mae": float(np.mean(grid_mae)) if grid_mae else None,
        "races": len(form_mae),
    }
