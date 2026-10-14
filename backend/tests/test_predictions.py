from datetime import datetime, timezone

import pytest

from app.services.prediction import calendar, field, history_engine, trainer


def test_upcoming_excludes_started_race(monkeypatch):
    future = datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc)

    def fake_meetings(year):
        if year == 2026:
            return [
                {
                    "id": "9999",
                    "meeting_key": 9999,
                    "year": 2026,
                    "round": 8,
                    "name": "Future GP",
                    "official_name": "Future GP",
                    "country": "Test",
                    "location": "Testville",
                    "format": "conventional",
                    "sessions": [
                        {"code": "Q", "date_utc": "2026-05-31T12:00:00Z", "status": "completed"},
                        {"code": "R", "date_utc": "2026-06-01T14:00:00Z", "status": "scheduled"},
                    ],
                },
                {
                    "id": "8888",
                    "year": 2026,
                    "round": 7,
                    "name": "Past GP",
                    "location": "Past",
                    "format": "conventional",
                    "sessions": [{"code": "R", "date_utc": "2026-05-01T14:00:00Z", "status": "completed"}],
                },
            ]
        return []

    from app.services import catalog_service

    monkeypatch.setattr(catalog_service, "seasons", lambda: [2026, 2025])
    monkeypatch.setattr(catalog_service, "meetings", fake_meetings)
    out = calendar.upcoming_races(now=future)
    assert len(out["races"]) == 1
    assert out["races"][0]["event_id"] == "9999"


def test_assert_can_predict_blocks_ineligible_event(monkeypatch):
    from app.core.errors import NotFound
    from app.services import catalog_service

    now = datetime(2026, 6, 1, 15, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(catalog_service, "seasons", lambda: [2026])
    monkeypatch.setattr(catalog_service, "meetings", lambda y: [])
    with pytest.raises(NotFound):
        calendar.assert_can_predict("9999", calendar.STAGE_EARLY, now=now)
    _ = now


def test_feature_rows_align_with_labels():
    rows, labels = history_engine.build_training_rows()
    assert len(rows) == len(labels)
    assert len(rows) > 100


def test_dedupe_openf1_driver_rows():
    raw = [
        {"driver_id": "hamilton", "code": "HAM", "given_name": "Lewis", "family_name": "Hamilton", "constructor_id": "mercedes", "constructor": "Mercedes", "number": "44"},
        {"driver_id": "hamilton", "code": "HAM", "given_name": "Lewis", "family_name": "Hamilton", "constructor_id": "mercedes", "constructor": "Mercedes", "number": None},
        {"driver_id": "russell", "code": "RUS", "given_name": "George", "family_name": "Russell", "constructor_id": "mercedes", "constructor": "Mercedes", "number": "63"},
    ]
    out = field.dedupe_drivers(raw)
    assert len(out) == 2
    ham = next(d for d in out if d["driver_id"] == "hamilton")
    assert ham["number"] == "44"


def test_win_probabilities_sum_to_one():
    import numpy as np

    p = trainer.positions_to_win_probs(np.array([1.2, 2.0, 4.5, 8.0, 12.0]))
    assert abs(float(p.sum()) - 1.0) < 1e-6
    assert (p >= 0).all()
