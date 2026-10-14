import type { SeasonRace, SeasonResultRow } from './api/types';

/**
 * Descriptive statistics CALCULATED from Jolpica-F1 season results. Each helper
 * documents its formula; none of these values are published by the source as-is.
 */

/** Classified finishers have a numeric positionText (others: R retired, D disqualified, W withdrawn, N not classified, E excluded, F failed to qualify). */
export const isClassified = (r: SeasonResultRow) => /^\d+$/.test(r.position_text);

export interface SeasonDriver {
  driverId: string;
  code: string | null;
  name: string;
  number: string | null;
  constructors: { id: string; name: string }[];
}

export function seasonDrivers(races: SeasonRace[]): SeasonDriver[] {
  const map = new Map<string, SeasonDriver>();
  for (const race of races)
    for (const r of race.results) {
      const d = map.get(r.driver_id) ?? { driverId: r.driver_id, code: r.code, name: `${r.given_name} ${r.family_name}`, number: r.number, constructors: [] };
      if (!d.constructors.some((c) => c.id === r.constructor_id)) d.constructors.push({ id: r.constructor_id, name: r.constructor });
      map.set(r.driver_id, d);
    }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface DriverRaceRow {
  round: number;
  label: string;
  race: string;
  grid: number | null;
  finish: number | null;
  positionText: string;
  status: string;
  points: number;
  sprintPoints: number;
  constructorId: string;
  fastestLapRank: number | null;
}

export function driverRows(races: SeasonRace[], driverId: string): DriverRaceRow[] {
  return races.flatMap((race) => {
    const r = race.results.find((x) => x.driver_id === driverId);
    if (!r) return [];
    const sp = race.sprint.find((x) => x.driver_id === driverId);
    return [
      {
        round: race.round,
        label: `R${race.round}`,
        race: race.name,
        grid: r.grid && r.grid > 0 ? r.grid : null,
        finish: isClassified(r) ? r.position : null,
        positionText: r.position_text,
        status: r.status,
        points: r.points,
        sprintPoints: sp?.points ?? 0,
        constructorId: r.constructor_id,
        fastestLapRank: r.fastest_lap_rank,
      },
    ];
  });
}

/** Team-mate = the other driver who raced for the same constructor in the most rounds. */
export function teammateOf(races: SeasonRace[], driverId: string): string | null {
  const counts = new Map<string, number>();
  for (const race of races) {
    const me = race.results.find((x) => x.driver_id === driverId);
    if (!me) continue;
    for (const r of race.results) if (r.constructor_id === me.constructor_id && r.driver_id !== driverId) counts.set(r.driver_id, (counts.get(r.driver_id) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function summarise(rows: DriverRaceRow[]) {
  const classified = rows.filter((r) => r.finish != null);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  return {
    starts: rows.length,
    points: rows.reduce((s, r) => s + r.points + r.sprintPoints, 0),
    wins: classified.filter((r) => r.finish === 1).length,
    podiums: classified.filter((r) => r.finish! <= 3).length,
    poles: rows.filter((r) => r.grid === 1).length,
    notClassified: rows.length - classified.length,
    avgFinish: avg(classified.map((r) => r.finish!)),
    avgGrid: avg(rows.filter((r) => r.grid != null).map((r) => r.grid!)),
    gained: classified.filter((r) => r.grid != null).reduce((s, r) => s + (r.grid! - r.finish!), 0),
    fastestLaps: rows.filter((r) => r.fastestLapRank === 1).length,
  };
}
