import { useMemo } from 'react';
import type { Lap } from '@/services/api/types';
import { useReplayTime } from './clock';
import { indexLaps, leaderLap, timingAt } from './timing';

/** Timing-tower rows at the replay time, recomputed a few times per second. */
export function useTimingAt(laps: Lap[] | undefined, drivers: string[], grid?: Map<string, number | null>, hz = 4) {
  const t = useReplayTime(hz);
  const index = useMemo(() => indexLaps(laps ?? []), [laps]);
  const rows = useMemo(() => timingAt(index, drivers, t, grid), [index, drivers, t, grid]);
  const byDriver = useMemo(() => new Map(rows.map((r) => [r.driver, r])), [rows]);
  return { rows, byDriver, lap: leaderLap(rows) || null, t };
}
