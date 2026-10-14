/**
 * Replay engine: holds the recorded location samples of one session and answers
 * "where was each car at time t?".
 *
 * - Samples keep their original timestamps (integer ms, FastF1 SessionTime).
 * - Between two consecutive samples less than MAX_GAP_MS apart the marker position
 *   is linearly interpolated for rendering only; the result is flagged and never
 *   stored back as data.
 * - Across a larger gap, before a driver's first or after their last sample, the
 *   driver is reported as unavailable — no position is invented.
 * - Time windows that have not been downloaded yet are reported as loading.
 */

export const MAX_GAP_MS = 2000;

export interface DriverSamples {
  t: Float64Array;
  x: Int32Array;
  y: Int32Array;
  on: Uint8Array;
}

export type MarkerState =
  | { kind: 'ok'; x: number; y: number; interpolated: boolean; sampleT: number; onTrack: boolean }
  | { kind: 'gap'; lastSampleT: number | null; nextSampleT: number | null }
  | { kind: 'no-data' }
  | { kind: 'loading' };

/** Largest i with arr[i] <= v, or -1. */
export function floorIndex(arr: ArrayLike<number>, v: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  if (hi < 0 || v < arr[0]) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid] <= v) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function mergeSamples(a: DriverSamples | undefined, b: { t: number[]; x: number[]; y: number[]; on: number[] }): DriverSamples {
  const n = (a?.t.length ?? 0) + b.t.length;
  const idx: [number, number][] = [];
  if (a) for (let i = 0; i < a.t.length; i++) idx.push([a.t[i], i]);
  for (let i = 0; i < b.t.length; i++) idx.push([b.t[i], -1 - i]);
  idx.sort((p, q) => p[0] - q[0]);
  const t = new Float64Array(n);
  const x = new Int32Array(n);
  const y = new Int32Array(n);
  const on = new Uint8Array(n);
  let k = 0;
  let last = -Infinity;
  for (const [time, i] of idx) {
    if (time === last) continue; // the same sample delivered twice (overlapping windows)
    last = time;
    t[k] = time;
    if (i >= 0) {
      x[k] = a!.x[i];
      y[k] = a!.y[i];
      on[k] = a!.on[i];
    } else {
      const j = -1 - i;
      x[k] = b.x[j];
      y[k] = b.y[j];
      on[k] = b.on[j];
    }
    k++;
  }
  return { t: t.subarray(0, k), x: x.subarray(0, k), y: y.subarray(0, k), on: on.subarray(0, k) };
}

export class ReplayEngine {
  readonly drivers = new Map<string, DriverSamples>();
  /** Loaded [startMs, endMs) windows, kept sorted and merged. */
  private loaded: [number, number][] = [];

  constructor(
    readonly sessionId: string,
    /** Each driver's first/last recorded sample over the whole session. */
    readonly coverage: Record<string, { first_ms: number; last_ms: number }>,
  ) {}

  addWindow(startMs: number, endMs: number, drivers: Record<string, { t: number[]; x: number[]; y: number[]; on: number[] }>) {
    for (const [d, s] of Object.entries(drivers)) this.drivers.set(d, mergeSamples(this.drivers.get(d), s));
    const ranges = [...this.loaded, [startMs, endMs] as [number, number]].sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push([r[0], r[1]]);
    }
    this.loaded = merged;
  }

  isLoaded(tMs: number): boolean {
    return this.loaded.some(([a, b]) => tMs >= a && tMs < b);
  }

  loadedRanges(): readonly [number, number][] {
    return this.loaded;
  }

  /** Position of one driver at tMs (see module docs for the rules). */
  stateAt(driver: string, tMs: number): MarkerState {
    const cov = this.coverage[driver];
    if (!cov || tMs < cov.first_ms || tMs > cov.last_ms) return { kind: 'no-data' };
    const s = this.drivers.get(driver);
    if (!this.isLoaded(tMs)) return { kind: 'loading' };
    if (!s || s.t.length === 0) return { kind: 'gap', lastSampleT: null, nextSampleT: null };
    const i = floorIndex(s.t, tMs);
    if (i < 0) return { kind: 'gap', lastSampleT: null, nextSampleT: s.t[0] };
    if (s.t[i] === tMs) return { kind: 'ok', x: s.x[i], y: s.y[i], interpolated: false, sampleT: s.t[i], onTrack: s.on[i] === 1 };
    if (i === s.t.length - 1) return { kind: 'gap', lastSampleT: s.t[i], nextSampleT: null };
    const t0 = s.t[i];
    const t1 = s.t[i + 1];
    if (t1 - t0 > MAX_GAP_MS) return { kind: 'gap', lastSampleT: t0, nextSampleT: t1 };
    const w = (tMs - t0) / (t1 - t0);
    return {
      kind: 'ok',
      x: s.x[i] + (s.x[i + 1] - s.x[i]) * w,
      y: s.y[i] + (s.y[i + 1] - s.y[i]) * w,
      interpolated: true,
      sampleT: t0,
      onTrack: s.on[i] === 1,
    };
  }
}
