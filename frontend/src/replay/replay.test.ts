import { describe, expect, it } from 'vitest';
import type { Lap } from '@/services/api/types';
import { createTransform, decimetresToScene, metresToScene } from './coordinates';
import { floorIndex, MAX_GAP_MS, ReplayEngine } from './engine';
import { indexLaps, timingAt } from './timing';

function engineWith(samples: Record<string, [number, number, number][]>, window: [number, number] = [0, 100_000]) {
  const coverage = Object.fromEntries(Object.entries(samples).map(([d, s]) => [d, { first_ms: s[0][0], last_ms: s[s.length - 1][0] }]));
  const e = new ReplayEngine('test', coverage);
  e.addWindow(window[0], window[1], Object.fromEntries(Object.entries(samples).map(([d, s]) => [d, { t: s.map((p) => p[0]), x: s.map((p) => p[1]), y: s.map((p) => p[2]), on: s.map(() => 1) }])));
  return e;
}

describe('coordinate transform', () => {
  const centre: [number, number][] = [
    [0, 0],
    [100, 0],
    [100, 50],
    [0, 50],
  ];

  it('preserves distances between any two points (similarity transform, no distortion)', () => {
    for (const rot of [0, 37, 95, 270]) {
      const t = createTransform(centre, rot);
      const a = metresToScene(t, 12, 7, { x: 0, z: 0 });
      const b = metresToScene(t, 80, 44, { x: 0, z: 0 });
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(Math.hypot(80 - 12, 44 - 7), 9);
    }
  });

  it('treats raw decimetre samples and metre geometry identically', () => {
    const t = createTransform(centre, 95);
    const a = decimetresToScene(t, 1234, -560);
    const b = metresToScene(t, 123.4, -56);
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.z).toBeCloseTo(b.z, 9);
  });

  it('keeps orientation (no mirroring): counter-clockwise stays counter-clockwise', () => {
    const t = createTransform(centre, 95);
    const pts = centre.map(([x, y]) => metresToScene(t, x, y));
    // Shoelace in source (x, y) vs scene (x, -z): signs must match.
    const area = (p: { x: number; y: number }[]) => p.reduce((s, q, i) => s + q.x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * q.y, 0);
    expect(Math.sign(area(centre.map(([x, y]) => ({ x, y }))))).toBe(Math.sign(area(pts.map((p) => ({ x: p.x, y: -p.z })))));
  });

  it('centres the circuit at the scene origin', () => {
    const t = createTransform(centre, 0);
    const c = metresToScene(t, 50, 25);
    expect(c.x).toBeCloseTo(0);
    expect(c.z).toBeCloseTo(0);
  });
});

describe('replay engine', () => {
  const e = engineWith({
    '1': [
      [1000, 0, 0],
      [1250, 100, 0],
      [1500, 200, 0],
      // 5 s gap: no samples recorded
      [6500, 900, 0],
      [6750, 1000, 0],
    ],
    '44': [
      [1000, 0, 50],
      [1250, 80, 50],
    ],
  });

  it('returns the exact recorded sample at its own timestamp', () => {
    expect(e.stateAt('1', 1250)).toEqual({ kind: 'ok', x: 100, y: 0, interpolated: false, sampleT: 1250, onTrack: true });
  });

  it('interpolates between adjacent samples and flags it', () => {
    const s = e.stateAt('1', 1375);
    expect(s.kind).toBe('ok');
    if (s.kind === 'ok') {
      expect(s.x).toBeCloseTo(150);
      expect(s.interpolated).toBe(true);
      expect(s.sampleT).toBe(1250);
    }
  });

  it('never invents a position inside a recording gap', () => {
    expect(6500 - 1500).toBeGreaterThan(MAX_GAP_MS);
    expect(e.stateAt('1', 3000)).toEqual({ kind: 'gap', lastSampleT: 1500, nextSampleT: 6500 });
  });

  it('reports no data outside a driver’s recorded span', () => {
    expect(e.stateAt('44', 900).kind).toBe('no-data');
    expect(e.stateAt('44', 2000).kind).toBe('no-data');
    expect(e.stateAt('99', 1200).kind).toBe('no-data');
  });

  it('reports loading for windows not yet downloaded', () => {
    const e2 = engineWith({ '1': [[1000, 0, 0], [1250, 10, 0], [200_000, 0, 0]] }, [0, 100_000]);
    expect(e2.stateAt('1', 150_000).kind).toBe('loading');
  });

  it('evaluates every driver at the same timestamp', () => {
    const a = e.stateAt('1', 1125);
    const b = e.stateAt('44', 1125);
    expect(a.kind === 'ok' && b.kind === 'ok' && a.x === 50 && b.x === 40).toBe(true);
  });

  it('merges overlapping windows without duplicating samples', () => {
    const e3 = engineWith({ '1': [[0, 0, 0], [250, 1, 0], [500, 2, 0]] });
    e3.addWindow(250, 1000, { '1': { t: [250, 500, 750], x: [1, 2, 3], y: [0, 0, 0], on: [1, 1, 1] } });
    expect(Array.from(e3.drivers.get('1')!.t)).toEqual([0, 250, 500, 750]);
  });

  it('floorIndex finds the last sample at or before t', () => {
    const arr = [10, 20, 30];
    expect(floorIndex(arr, 5)).toBe(-1);
    expect(floorIndex(arr, 20)).toBe(1);
    expect(floorIndex(arr, 29)).toBe(1);
    expect(floorIndex(arr, 99)).toBe(2);
  });
});

describe('timing at replay time', () => {
  const lap = (d: string, n: number, start: number, end: number, pos: number): Lap => ({
    driver_number: d, lap: n, start, end, lap_time: end - start, s1: null, s2: null, s3: null, s1_end: null, s2_end: null,
    compound: 'MEDIUM', tyre_life: n, stint: 1, pit_in: null, pit_out: null, position: pos, track_status: '1', deleted: false, personal_best: false, speed_trap: null,
  });
  const idx = indexLaps([lap('1', 1, 0, 90, 1), lap('1', 2, 90, 180, 1), lap('16', 1, 0, 91.5, 2), lap('16', 2, 91.5, 182, 2)]);

  it('uses official positions from the last completed lap and calculated line gaps', () => {
    const rows = timingAt(idx, ['16', '1'], 100);
    expect(rows.map((r) => r.driver)).toEqual(['1', '16']);
    expect(rows[1].gap).toBeCloseTo(1.5);
    expect(rows[1].interval).toBeCloseTo(1.5);
    expect(rows[0].lap).toBe(2);
  });

  it('marks a driver out once their recorded laps stop while the leader continues', () => {
    const idx2 = indexLaps([lap('1', 1, 0, 90, 1), lap('1', 2, 90, 180, 1), lap('1', 3, 180, 270, 1), lap('1', 4, 270, 360, 1), lap('22', 1, 0, 95, 2)]);
    const rows = timingAt(idx2, ['22', '1'], 300);
    expect(rows[1]).toMatchObject({ driver: '22', out: true, gap: null });
  });

  it('orders by the published grid before any lap is complete', () => {
    const grid = new Map([['16', 1], ['1', 2]]);
    const rows = timingAt(idx, ['1', '16'], 10, grid);
    expect(rows.map((r) => [r.driver, r.grid, r.position])).toEqual([['16', 1, null], ['1', 2, null]]);
  });

  it('shows nothing before the first line crossing', () => {
    const rows = timingAt(idx, ['16', '1'], 10);
    expect(rows.every((r) => r.position === null && r.gap === null)).toBe(true);
  });
});
