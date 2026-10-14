import type { Lap } from '@/services/api/types';

/**
 * Timing-tower state at a replay time, from recorded lap timing only.
 *
 * - position: FastF1's official running position at the end of the driver's last
 *   completed lap (it updates at the timing line, as on the broadcast tower).
 * - gap / interval: CALCULATED as the difference between the times at which two
 *   drivers crossed the line to complete the same lap number. Only shown when both
 *   have completed that lap.
 */
export interface TimingRow {
  driver: string;
  position: number | null;
  lap: number; // laps started
  completed: number;
  lastLap: Lap | null;
  bestLapTime: number | null;
  gap: number | null;
  interval: number | null;
  lapsDown: number;
  inPit: boolean;
  /** No further laps were recorded and the leader has moved on (retired / stopped). */
  out: boolean;
  /** Published starting grid slot (races), used for ordering before the first lap is complete. */
  grid: number | null;
  compound: string | null;
  tyreLife: number | null;
}

export interface LapIndex {
  byDriver: Map<string, Lap[]>;
  /** Line-crossing time for driver d completing lap n: ends.get(d)[n]. */
  ends: Map<string, Map<number, number>>;
}

export function indexLaps(laps: Lap[]): LapIndex {
  const byDriver = new Map<string, Lap[]>();
  const ends = new Map<string, Map<number, number>>();
  for (const l of laps) {
    if (l.lap == null) continue;
    (byDriver.get(l.driver_number) ?? byDriver.set(l.driver_number, []).get(l.driver_number)!).push(l);
    if (l.end != null) (ends.get(l.driver_number) ?? ends.set(l.driver_number, new Map()).get(l.driver_number)!).set(l.lap, l.end);
  }
  for (const v of byDriver.values()) v.sort((a, b) => a.lap! - b.lap!);
  return { byDriver, ends };
}

export function timingAt(index: LapIndex, drivers: string[], t: number, grid?: Map<string, number | null>): TimingRow[] {
  const rows: TimingRow[] = drivers.map((d) => {
    const laps = index.byDriver.get(d) ?? [];
    let completed = 0;
    let started = 0;
    let last: Lap | null = null;
    let best: number | null = null;
    let current: Lap | null = null;
    for (const l of laps) {
      if (l.start != null && l.start <= t) {
        started = l.lap!;
        current = l;
      }
      if (l.end != null && l.end <= t) {
        completed = l.lap!;
        last = l;
        if (l.lap_time != null && !l.deleted && (best == null || l.lap_time < best)) best = l.lap_time;
      }
    }
    const inPit = !!current && ((current.pit_in != null && current.pit_in <= t) || (current.pit_out != null && current.pit_out >= t && current.start! <= t));
    return {
      driver: d,
      position: last?.position ?? null,
      lap: Math.max(started, completed),
      completed,
      lastLap: last,
      bestLapTime: best,
      gap: null,
      interval: null,
      lapsDown: 0,
      inPit,
      out: false,
      grid: grid?.get(d) ?? null,
      // Before lap 1 starts, the first lap's recorded compound is the starting tyre.
      compound: (current ?? last ?? laps[0])?.compound ?? null,
      tyreLife: (current ?? last ?? laps[0])?.tyre_life ?? null,
    };
  });
  // A driver whose recorded laps stopped while the leader kept lapping has retired or stopped.
  const leaderCompleted = Math.max(0, ...rows.map((r) => r.completed));
  for (const r of rows) {
    const laps = index.byDriver.get(r.driver) ?? [];
    const final = laps[laps.length - 1];
    const finalEnd = final?.end ?? final?.start ?? null;
    if (final && finalEnd != null && t > finalEnd + 120 && r.completed === final.lap && leaderCompleted > r.completed) {
      r.out = true;
      r.inPit = false;
    }
  }
  rows.sort((a, b) => Number(a.out) - Number(b.out) || (a.position ?? 999) - (b.position ?? 999) || b.completed - a.completed || (a.grid ?? 999) - (b.grid ?? 999));
  const leader = rows.find((r) => r.position != null);
  rows.forEach((r, i) => {
    if (!leader || r.out || r.position == null || r.completed === 0) return;
    const mine = index.ends.get(r.driver)?.get(r.completed);
    const leaderAt = index.ends.get(leader.driver)?.get(r.completed);
    r.lapsDown = Math.max(0, leader.completed - r.completed);
    if (mine != null && leaderAt != null) r.gap = r === leader ? 0 : +(mine - leaderAt).toFixed(3);
    const ahead = rows[i - 1];
    const aheadAt = ahead ? index.ends.get(ahead.driver)?.get(r.completed) : undefined;
    if (mine != null && aheadAt != null && ahead.position != null) r.interval = +(mine - aheadAt).toFixed(3);
  });
  return rows;
}

/** Laps the leader has started at time t (current race lap). */
export function leaderLap(rows: TimingRow[]): number {
  return rows.reduce((m, r) => Math.max(m, r.lap), 0);
}
