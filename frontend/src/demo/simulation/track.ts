import type { Circuit } from '@/types/domain';
import { clamp } from '@/utils/math';

/**
 * Turns a stylised circuit outline into an evenly sampled centreline with a
 * physically plausible speed profile. Everything downstream (car motion,
 * telemetry, sectors, 3D geometry, 2D maps) reads from this one structure.
 */

export const TRACK_SAMPLES = 900;

export interface TrackModel {
  circuitId: string;
  lengthM: number;
  /** Centreline in metres, x/y interleaved, evenly spaced by arc length. */
  x: Float32Array;
  y: Float32Array;
  /** Unit tangent. */
  tx: Float32Array;
  ty: Float32Array;
  /** Signed curvature (1/m), smoothed. */
  curvature: Float32Array;
  /** Reference speed profile, km/h, scaled to the circuit's reference lap. */
  speed: Float32Array;
  /** Normalised cumulative time across the lap (0 at start, 1 at the line). */
  timeFrac: Float32Array;
  throttle: Float32Array;
  brake: Float32Array;
  /** Distance fractions where sectors 2 and 3 begin. */
  sectorStarts: [number, number];
  /** Fraction of lap time spent in each sector on the reference lap. */
  sectorWeights: [number, number, number];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** Indices of samples that form corner apexes (for kerbs and labels). */
  cornerMask: Uint8Array;
}

/**
 * Treat the outline as a polygon and round each vertex with a quadratic fillet.
 * This keeps genuine straights between corners, which reads far more like a
 * circuit than a spline through every point.
 */
function filletPolygon(points: [number, number][], radius: number, perCorner: number): [number, number][] {
  const n = points.length;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const p = points[i];
    const next = points[(i + 1) % n];
    const inLen = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    const outLen = Math.hypot(next[0] - p[0], next[1] - p[1]);
    const d = Math.min(radius, inLen * 0.45, outLen * 0.45);
    const a: [number, number] = [p[0] + ((prev[0] - p[0]) / inLen) * d, p[1] + ((prev[1] - p[1]) / inLen) * d];
    const b: [number, number] = [p[0] + ((next[0] - p[0]) / outLen) * d, p[1] + ((next[1] - p[1]) / outLen) * d];
    for (let s = 0; s <= perCorner; s++) {
      const t = s / perCorner;
      const u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * p[0] + t * t * b[0], u * u * a[1] + 2 * u * t * p[1] + t * t * b[1]]);
    }
  }
  return out;
}

function resampleClosed(pts: [number, number][], count: number): [number, number][] {
  const cum = [0];
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i % pts.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[cum.length - 1];
  const out: [number, number][] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const d = (total * k) / count;
    while (cum[j + 1] < d) j++;
    const a = pts[j];
    const b = pts[(j + 1) % pts.length];
    const w = (d - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push([a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w]);
  }
  return out;
}

const cache = new Map<string, TrackModel>();

export function buildTrack(circuit: Circuit): TrackModel {
  const cached = cache.get(circuit.id);
  if (cached) return cached;

  const N = TRACK_SAMPLES;
  const raw = resampleClosed(filletPolygon(circuit.outline, 0.08, 24), N);

  // Scale so the centreline length equals the real circuit length.
  let rawLen = 0;
  for (let i = 0; i < N; i++) {
    const a = raw[i];
    const b = raw[(i + 1) % N];
    rawLen += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const lengthM = circuit.lengthKm * 1000;
  const k = lengthM / rawLen;
  const ds = lengthM / N;

  const x = new Float32Array(N);
  const y = new Float32Array(N);
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < N; i++) {
    cx += raw[i][0];
    cy += raw[i][1];
  }
  cx /= N;
  cy /= N;
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (let i = 0; i < N; i++) {
    x[i] = (raw[i][0] - cx) * k;
    y[i] = (raw[i][1] - cy) * k;
    bounds.minX = Math.min(bounds.minX, x[i]);
    bounds.maxX = Math.max(bounds.maxX, x[i]);
    bounds.minY = Math.min(bounds.minY, y[i]);
    bounds.maxY = Math.max(bounds.maxY, y[i]);
  }

  const tx = new Float32Array(N);
  const ty = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const dx = x[(i + 1) % N] - x[(i - 1 + N) % N];
    const dy = y[(i + 1) % N] - y[(i - 1 + N) % N];
    const l = Math.hypot(dx, dy) || 1;
    tx[i] = dx / l;
    ty[i] = dy / l;
  }

  // Signed curvature from heading change, then smoothed.
  const rawCurv = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a0 = Math.atan2(ty[(i - 1 + N) % N], tx[(i - 1 + N) % N]);
    const a1 = Math.atan2(ty[(i + 1) % N], tx[(i + 1) % N]);
    let d = a1 - a0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    rawCurv[i] = d / (2 * ds);
  }
  const curvature = new Float32Array(N);
  const W = 5;
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let j = -W; j <= W; j++) s += rawCurv[(i + j + N) % N];
    curvature[i] = s / (2 * W + 1);
  }

  // Speed profile (m/s): lateral limit, then acceleration and braking passes.
  const vTop = 84 + 12 * circuit.traits.topSpeed;
  const aLat = 30;
  const brakeDecel = 42;
  const v = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const kk = Math.abs(curvature[i]);
    v[i] = clamp(kk > 1e-5 ? Math.sqrt(aLat / kk) : vTop, 18, vTop);
  }
  const accel = (vv: number) => Math.max(2.5, 12 * (1 - (vv / vTop) ** 2));
  for (let pass = 0; pass < 2; pass++) {
    for (let n = 0; n < N; n++) {
      const i = (n + 1) % N;
      const prev = v[n];
      v[i] = Math.min(v[i], Math.sqrt(prev * prev + 2 * accel(prev) * ds));
    }
    for (let n = N - 1; n >= 0; n--) {
      const i = n;
      const next = v[(n + 1) % N];
      v[i] = Math.min(v[i], Math.sqrt(next * next + 2 * brakeDecel * ds));
    }
  }

  // Normalised time profile and scale speeds to the reference lap.
  const timeFrac = new Float32Array(N + 1);
  let tAcc = 0;
  for (let i = 0; i < N; i++) {
    timeFrac[i] = tAcc;
    tAcc += ds / v[i];
  }
  timeFrac[N] = tAcc;
  const profileLap = tAcc;
  for (let i = 0; i <= N; i++) timeFrac[i] /= profileLap;
  const scale = profileLap / circuit.referenceLap;
  const speed = new Float32Array(N);
  for (let i = 0; i < N; i++) speed[i] = v[i] * scale * 3.6;

  const throttle = new Float32Array(N);
  const brake = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const dv = speed[(i + 2) % N] - speed[i];
    if (dv < -2.5) {
      brake[i] = clamp(-dv / 14, 0.25, 1);
      throttle[i] = 0;
    } else if (dv > 0.6) {
      throttle[i] = 1;
    } else {
      // Mid-corner / steady state: partial throttle proportional to speed ratio.
      throttle[i] = clamp(speed[i] / (vTop * scale * 3.6), 0.25, 1);
    }
  }

  const cornerMask = new Uint8Array(N);
  for (let i = 0; i < N; i++) cornerMask[i] = Math.abs(curvature[i]) > 0.006 ? 1 : 0;

  const sectorStarts: [number, number] = [1 / 3, 2 / 3];
  const tf = (s: number) => timeFrac[Math.round(s * N)];
  const sectorWeights: [number, number, number] = [
    tf(sectorStarts[0]),
    tf(sectorStarts[1]) - tf(sectorStarts[0]),
    1 - tf(sectorStarts[1]),
  ];

  const model: TrackModel = {
    circuitId: circuit.id,
    lengthM,
    x,
    y,
    tx,
    ty,
    curvature,
    speed,
    timeFrac,
    throttle,
    brake,
    sectorStarts,
    sectorWeights,
    bounds,
    cornerMask,
  };
  cache.set(circuit.id, model);
  return model;
}

/** Map a normalised time-in-lap (0..1) to a distance fraction (0..1). */
export function distanceAtTimeFrac(track: TrackModel, tf: number): number {
  const arr = track.timeFrac;
  const N = TRACK_SAMPLES;
  if (tf <= 0) return 0;
  if (tf >= 1) return 1;
  let lo = 0;
  let hi = N;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= tf) lo = mid;
    else hi = mid;
  }
  const w = (tf - arr[lo]) / (arr[hi] - arr[lo] || 1);
  return (lo + w) / N;
}

/** Map a distance fraction (0..1) to normalised time-in-lap. */
export function timeFracAtDistance(track: TrackModel, s: number): number {
  const N = TRACK_SAMPLES;
  const f = clamp(s, 0, 1) * N;
  const i = Math.min(N - 1, Math.floor(f));
  const w = f - i;
  return track.timeFrac[i] + (track.timeFrac[i + 1] - track.timeFrac[i]) * w;
}

/** Interpolated centreline point (metres) and heading at distance fraction s. */
export function pointAt(track: TrackModel, s: number): { x: number; y: number; tx: number; ty: number } {
  const N = TRACK_SAMPLES;
  const f = (((s % 1) + 1) % 1) * N;
  const i = Math.floor(f) % N;
  const j = (i + 1) % N;
  const w = f - Math.floor(f);
  return {
    x: track.x[i] + (track.x[j] - track.x[i]) * w,
    y: track.y[i] + (track.y[j] - track.y[i]) * w,
    tx: track.tx[i] + (track.tx[j] - track.tx[i]) * w,
    ty: track.ty[i] + (track.ty[j] - track.ty[i]) * w,
  };
}

export function sampleIndex(s: number): number {
  return Math.floor((((s % 1) + 1) % 1) * TRACK_SAMPLES) % TRACK_SAMPLES;
}

const GEAR_THRESHOLDS = [0, 85, 125, 160, 195, 232, 268, 300];
export function gearForSpeed(kmh: number): number {
  let g = 1;
  for (let i = 0; i < GEAR_THRESHOLDS.length; i++) if (kmh >= GEAR_THRESHOLDS[i]) g = i + 1;
  return g;
}

export function rpmForSpeed(kmh: number): number {
  const g = gearForSpeed(kmh);
  const lo = GEAR_THRESHOLDS[g - 1];
  const hi = GEAR_THRESHOLDS[g] ?? 345;
  return Math.round(9800 + ((kmh - lo) / (hi - lo)) * 2200);
}
