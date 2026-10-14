import type { DriverPredictionRow, ForecastSnapshot } from '@/services/api/types';

/** Old snapshots may contain duplicate OpenF1 rows — keep best predicted rank per driver. */
export function normalizeForecastDrivers(drivers: DriverPredictionRow[]): DriverPredictionRow[] {
  const byId = new Map<string, DriverPredictionRow>();
  for (const d of drivers) {
    const prev = byId.get(d.driver_id);
    if (!prev || d.predicted_position < prev.predicted_position) byId.set(d.driver_id, d);
  }
  return [...byId.values()].sort((a, b) => a.predicted_position - b.predicted_position);
}

export function withNormalizedDrivers(snap: ForecastSnapshot): ForecastSnapshot {
  const drivers = normalizeForecastDrivers(snap.drivers).map((d, i) => ({ ...d, predicted_position: i + 1 }));
  return { ...snap, drivers };
}

/** Heuristic band when Monte Carlo ranges are unavailable. */
export function approxRange(expected: number, field = 20): [number, number] {
  const spread = Math.max(1.5, expected * 0.18);
  return [Math.max(1, Math.round(expected - spread)), Math.min(field, Math.round(expected + spread))];
}
