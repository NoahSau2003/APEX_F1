import numpy as np
import pytest

from app.services.track_geometry import nearest_vertex, reconstruct_centreline, resample_by_arclength, validate


def ellipse_lap(a=800.0, b=400.0, n=330, phase=0.0, noise=0.0, rng=None, reverse=False):
    t = np.linspace(0, 2 * np.pi, n, endpoint=False) + phase
    if reverse:
        t = -t
    pts = np.column_stack([a * np.cos(t), b * np.sin(t)])
    if noise:
        pts += rng.normal(0, noise, pts.shape)
    return pts


def perimeter(a, b):
    h = ((a - b) / (a + b)) ** 2
    return np.pi * (a + b) * (1 + 3 * h / (10 + np.sqrt(4 - 3 * h)))


def test_resample_is_even():
    pts = ellipse_lap()
    r = resample_by_arclength(np.vstack([pts, pts[:1]]), 500)
    seg = np.hypot(*np.diff(r, axis=0).T)
    assert seg.std() / seg.mean() < 0.02


def test_reconstruction_recovers_shape_and_scale():
    rng = np.random.default_rng(1)
    laps = [ellipse_lap(phase=rng.uniform(-0.004, 0.004), noise=1.5, rng=rng) for _ in range(30)]
    centre = reconstruct_centreline(laps)
    truth = ellipse_lap(n=20000)
    _, d = nearest_vertex(truth, centre)
    assert np.percentile(d, 95) < 2.0
    true_len = perimeter(800, 400)
    rep = validate(centre, laps, 10, [true_len] * 30, np.array([l[0] for l in laps]), None, None)
    assert rep.status == "validated", rep.failures
    assert abs(rep.scale_ratio - 1) < 0.01
    assert rep.forward_share > 0.99


def test_scale_mismatch_is_flagged():
    laps = [ellipse_lap() for _ in range(10)]
    centre = reconstruct_centreline(laps)
    # Speed-integrated distance 10% longer than the geometry -> inconsistent scaling.
    rep = validate(centre, laps, 5, [perimeter(800, 400) * 1.1] * 10, None, None, None)
    assert rep.status == "unverified"
    assert any("speed-integrated" in f for f in rep.failures)


def test_reverse_direction_is_flagged():
    laps = [ellipse_lap() for _ in range(10)]
    centre = reconstruct_centreline(laps)
    reversed_laps = [ellipse_lap(reverse=True) for _ in range(10)]
    rep = validate(centre, reversed_laps, 5, [perimeter(800, 400)] * 10, None, None, None)
    assert rep.forward_share < 0.05
    assert rep.status == "unverified"


def test_too_few_laps_rejected():
    with pytest.raises(ValueError):
        reconstruct_centreline([ellipse_lap(), ellipse_lap()])


def test_samples_far_from_track_are_reported():
    laps = [ellipse_lap() for _ in range(10)]
    centre = reconstruct_centreline(laps)
    shifted = [l + np.array([0, 60.0]) for l in laps]
    rep = validate(centre, shifted, 5, [perimeter(800, 400)] * 10, None, None, None)
    assert rep.residual_p95_m > 20
    assert rep.status == "unverified"
