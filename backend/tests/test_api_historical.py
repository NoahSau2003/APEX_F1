"""Integration tests against a real historical session (2024 Italian GP race,
official session key 9590). They download data on first run (cached afterwards).
Skip with: APEX_SKIP_INTEGRATION=1 pytest"""

import os

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app

pytestmark = pytest.mark.skipif(os.environ.get("APEX_SKIP_INTEGRATION") == "1", reason="integration tests disabled")
SID = "9590"
client = TestClient(app)


def get(path, **params):
    r = client.get(f"/api/v1/{path}", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def test_catalog_contains_session_with_official_keys():
    meetings = get("meetings", year=2024)
    monza = next(m for m in meetings if m["round"] == 16)
    assert monza["name"] == "Italian Grand Prix"
    assert monza["meeting_key"] == 1244
    race = next(s for s in monza["sessions"] if s["code"] == "R")
    assert race["session_key"] == 9590 and race["replay_available"]


def test_drivers_have_session_abbreviations_and_colours():
    rows = {r["driver_number"]: r for r in get(f"sessions/{SID}/drivers")["rows"]}
    assert len(rows) == 20
    assert rows["16"]["abbreviation"] == "LEC" and rows["16"]["team_name"] == "Ferrari"
    assert rows["1"]["abbreviation"] == "VER"
    assert all(len(r["abbreviation"]) == 3 for r in rows.values())
    assert all(r["team_color"].startswith("#") for r in rows.values())


def test_results_match_published_classification():
    rows = get(f"sessions/{SID}/results")["rows"]
    assert [r["driver_number"] for r in rows[:3]] == ["16", "81", "4"]  # LEC, PIA, NOR
    assert rows[0]["grid"] == 4 and rows[0]["points"] == 25


def test_locations_are_raw_recorded_samples():
    import fastf1

    from app.providers import fastf1_provider

    fastf1_provider._ensure_cache()
    s = fastf1.get_session(2024, 16, "R")
    s.load(laps=False, telemetry=True, weather=False, messages=False)
    raw = s.pos_data["16"]
    raw_t = set((raw["SessionTime"].dt.total_seconds() * 1000).round().astype(int))
    loc = get(f"sessions/{SID}/locations", start=3400, end=3700, drivers="16")
    d = loc["drivers"]["16"]
    assert len(d["t"]) > 1000
    assert set(d["t"]) <= raw_t  # every timestamp is an original sample
    assert d["t"] == sorted(d["t"]) and len(set(d["t"])) == len(d["t"])
    i = 100
    row = raw.iloc[(raw["SessionTime"].dt.total_seconds() * 1000).round().astype(int).tolist().index(d["t"][i])]
    assert (d["x"][i], d["y"][i]) == (int(round(row["X"])), int(round(row["Y"])))


def test_location_window_does_not_fill_gaps():
    info = get(f"sessions/{SID}")
    cov = info["location_coverage"]["16"]
    # Before the first recorded sample there must be nothing at all.
    loc = get(f"sessions/{SID}/locations", start=0, end=cov["first_ms"] / 1000 - 0.001, drivers="16")
    assert "16" not in loc["drivers"]


def test_location_window_limit():
    r = client.get(f"/api/v1/sessions/{SID}/locations", params={"start": 0, "end": 4000})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "bad_request"


def test_track_is_validated_and_consistent_with_samples():
    track = get(f"sessions/{SID}/track")
    v = track["validation"]
    assert v["status"] == "validated", v["failures"]
    assert 0.97 < v["scale_ratio"] < 1.03
    assert 5600 < v["length_m"] < 5900  # Monza is 5.793 km
    assert v["forward_share"] > 0.97
    # All drivers share one coordinate frame: every driver's samples lie on the same centreline.
    from app.services.track_geometry import nearest_vertex

    centre = np.array(track["centreline"])
    loc = get(f"sessions/{SID}/locations", start=4000, end=4600)
    for num, d in loc["drivers"].items():
        pts = np.column_stack([d["x"], d["y"]]) / 10.0
        # Only moving samples: a retired car keeps reporting its parked position (e.g. #22 at Monza).
        moving = np.concatenate([[False], np.hypot(*np.diff(pts, axis=0).T) > 5])
        if moving.sum() < 50:
            continue
        _, dist = nearest_vertex(pts[moving], centre)
        # Pit-lane samples sit off the racing line, so check the median per driver.
        assert np.median(dist) < 5, num


def test_telemetry_lap_window():
    tel = get(f"sessions/{SID}/telemetry", driver="16", lap=10)
    ch = tel["channels"]
    assert len(ch["t"]) > 250
    assert all(tel["start"] * 1000 <= t <= tel["end"] * 1000 for t in ch["t"])
    assert max(ch["speed"]) > 300  # Monza top speed
    assert set(ch["gear"]) <= set(range(0, 9))


def test_unknown_session_is_404():
    r = client.get("/api/v1/sessions/1")
    assert r.status_code == 404
