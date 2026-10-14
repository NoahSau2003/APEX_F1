"""Circuit centreline reconstruction and validation from recorded position samples.

Pure numpy, no provider imports, so it can be unit-tested with synthetic data.

Method (documented in README):
1. Input: one (k, 2) array per clean lap (green flag, no pit in/out, accurate timing),
   in metres in the provider's source frame. Laps come from every driver.
2. Each lap is resampled at N evenly spaced arc-length fractions (shape interpolation
   along that lap's own recorded polyline) and the per-index median across laps gives
   an initial centreline.
3. Refinement: every recorded sample is assigned to its nearest centreline vertex and
   each vertex becomes the median of its assigned samples. Empty vertices keep their
   previous value. Repeated a few times.
4. A light circular moving average (window 5 vertices, ~25 m) removes median jitter
   without changing corner geometry.
Validation metrics are computed against the recorded samples and an independent
speed-integrated lap distance; see `validate`.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

N_VERTICES = 1000


def _cumlen(p: np.ndarray) -> np.ndarray:
    seg = np.hypot(*np.diff(p, axis=0).T)
    return np.concatenate([[0.0], np.cumsum(seg)])


def resample_by_arclength(points: np.ndarray, n: int) -> np.ndarray:
    """Resample a polyline at n evenly spaced arc-length fractions in [0, 1)."""
    s = _cumlen(points)
    if s[-1] <= 0:
        raise ValueError("degenerate lap polyline")
    target = np.linspace(0.0, s[-1], n, endpoint=False)
    return np.column_stack([np.interp(target, s, points[:, 0]), np.interp(target, s, points[:, 1])])


def nearest_vertex(points: np.ndarray, centre: np.ndarray, chunk: int = 4096) -> tuple[np.ndarray, np.ndarray]:
    """Index of the nearest centreline vertex and the distance to the closed polyline."""
    n = len(centre)
    idx = np.empty(len(points), dtype=np.int64)
    for a in range(0, len(points), chunk):
        p = points[a : a + chunk]
        d2 = ((p[:, None, :] - centre[None, :, :]) ** 2).sum(-1)
        idx[a : a + chunk] = d2.argmin(1)
    # Exact distance to the two segments adjacent to the nearest vertex.
    prev_v = centre[(idx - 1) % n]
    vert = centre[idx]
    next_v = centre[(idx + 1) % n]
    dist = np.minimum(_seg_dist(points, prev_v, vert), _seg_dist(points, vert, next_v))
    return idx, dist


def _seg_dist(p: np.ndarray, a: np.ndarray, b: np.ndarray) -> np.ndarray:
    ab = b - a
    denom = (ab**2).sum(1)
    t = np.clip(((p - a) * ab).sum(1) / np.where(denom == 0, 1, denom), 0, 1)
    proj = a + ab * t[:, None]
    return np.hypot(*(p - proj).T)


def _circular_smooth(c: np.ndarray, window: int) -> np.ndarray:
    k = window // 2
    padded = np.concatenate([c[-k:], c, c[:k]])
    kernel = np.ones(window) / window
    return np.column_stack([np.convolve(padded[:, i], kernel, mode="valid") for i in range(2)])


def reconstruct_centreline(laps: list[np.ndarray], n: int = N_VERTICES, iterations: int = 3) -> np.ndarray:
    if len(laps) < 3:
        raise ValueError("at least three clean laps are required")
    stack = np.stack([resample_by_arclength(l, n) for l in laps])
    centre = np.median(stack, axis=0)
    samples = np.concatenate(laps)
    for _ in range(iterations):
        idx, _ = nearest_vertex(samples, centre)
        nxt = centre.copy()
        order = np.argsort(idx, kind="stable")
        sidx = idx[order]
        bounds = np.searchsorted(sidx, np.arange(n + 1))
        for v in range(n):
            a, b = bounds[v], bounds[v + 1]
            if b - a >= 2:
                nxt[v] = np.median(samples[order[a:b]], axis=0)
        # Re-space vertices evenly so the index stays proportional to distance.
        centre = resample_by_arclength(np.vstack([nxt, nxt[:1]]), n)
    return _circular_smooth(centre, 5)


@dataclass
class ValidationReport:
    status: str  # "validated" | "unverified"
    laps_used: int
    drivers_used: int
    samples_checked: int
    length_m: float
    speed_distance_m: float | None
    scale_ratio: float | None
    closure_gap_m: float
    residual_median_m: float
    residual_p95_m: float
    residual_p99_m: float
    share_within_20m: float
    forward_share: float
    start_line_spread_m: float | None
    corner_reference_median_m: float | None
    reference: str | None
    failures: list[str] = field(default_factory=list)


THRESHOLDS = {
    "residual_p95_m": 20.0,
    "scale_ratio": (0.97, 1.03),
    "forward_share": 0.97,
    "closure_gap_m": 30.0,
    "min_laps": 5,
    "start_line_spread_m": 60.0,
}


def validate(
    centre: np.ndarray,
    laps: list[np.ndarray],
    drivers_used: int,
    speed_distances_m: list[float],
    lap_start_points: np.ndarray | None,
    corner_points: np.ndarray | None,
    reference: str | None,
) -> ValidationReport:
    """Check the centreline against the samples it was built from and independent references."""
    samples = np.concatenate(laps)
    idx, dist = nearest_vertex(samples, centre)
    closed = np.vstack([centre, centre[:1]])
    length = float(_cumlen(closed)[-1])
    n = len(centre)

    # Direction of travel: consecutive samples of each lap should advance along the index.
    fwd = tot = 0
    for lap in laps:
        li, _ = nearest_vertex(lap, centre)
        d = (np.diff(li) + n // 2) % n - n // 2
        d = d[d != 0]
        fwd += int((d > 0).sum())
        tot += len(d)
    forward_share = fwd / tot if tot else 0.0

    speed_dist = float(np.median(speed_distances_m)) if speed_distances_m else None
    ratio = length / speed_dist if speed_dist else None

    spread = None
    if lap_start_points is not None and len(lap_start_points) >= 3:
        si, _ = nearest_vertex(lap_start_points, centre)
        # Circular distance from index 0 (the centreline starts at the timing line), in metres.
        off = ((si + n // 2) % n - n // 2) * (length / n)
        spread = float(np.percentile(np.abs(off), 90))

    corner_med = None
    if corner_points is not None and len(corner_points):
        _, cd = nearest_vertex(corner_points, centre)
        corner_med = float(np.median(cd))

    rep = ValidationReport(
        status="validated",
        laps_used=len(laps),
        drivers_used=drivers_used,
        samples_checked=int(len(samples)),
        length_m=round(length, 1),
        speed_distance_m=round(speed_dist, 1) if speed_dist else None,
        scale_ratio=round(ratio, 4) if ratio else None,
        closure_gap_m=round(float(np.hypot(*(centre[0] - centre[-1]))), 2),
        residual_median_m=round(float(np.median(dist)), 2),
        residual_p95_m=round(float(np.percentile(dist, 95)), 2),
        residual_p99_m=round(float(np.percentile(dist, 99)), 2),
        share_within_20m=round(float((dist <= 20).mean()), 4),
        forward_share=round(forward_share, 4),
        start_line_spread_m=round(spread, 1) if spread is not None else None,
        corner_reference_median_m=round(corner_med, 1) if corner_med is not None else None,
        reference=reference,
    )
    t = THRESHOLDS
    if rep.laps_used < t["min_laps"]:
        rep.failures.append(f"only {rep.laps_used} clean laps (need {t['min_laps']})")
    if rep.residual_p95_m > t["residual_p95_m"]:
        rep.failures.append(f"95th-percentile sample distance {rep.residual_p95_m} m exceeds {t['residual_p95_m']} m")
    if ratio is None:
        rep.failures.append("no speed-integrated distance available to check scale")
    elif not (t["scale_ratio"][0] <= ratio <= t["scale_ratio"][1]):
        rep.failures.append(f"centreline length / speed-integrated lap distance = {ratio:.3f}")
    if forward_share < t["forward_share"]:
        rep.failures.append(f"only {forward_share:.1%} of sample steps advance along the centreline")
    if rep.closure_gap_m > t["closure_gap_m"]:
        rep.failures.append(f"centreline does not close ({rep.closure_gap_m} m gap)")
    if spread is not None and spread > t["start_line_spread_m"]:
        rep.failures.append(f"lap-start positions spread {spread:.0f} m from the start of the centreline")
    if rep.failures:
        rep.status = "unverified"
    return rep
