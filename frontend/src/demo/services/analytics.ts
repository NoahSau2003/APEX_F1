import type { DriverId, TeamId } from '@/types/domain';
import { mean, median, stdDev } from '@/utils/math';
import { catalog, circuitCode } from './catalog';
import type { CompletedRace } from './contracts';

/**
 * Derived statistics. Pure functions over race results, so they work the same
 * for demo data or real historical data fed through the RaceDataService.
 */

export interface StandingEntry {
  id: string;
  position: number;
  points: number;
  wins: number;
  podiums: number;
}

function rank(totals: Map<string, { points: number; wins: number; podiums: number }>): StandingEntry[] {
  return [...totals.entries()]
    .sort((a, b) => b[1].points - a[1].points || b[1].wins - a[1].wins || b[1].podiums - a[1].podiums)
    .map(([id, v], i) => ({ id, position: i + 1, ...v }));
}

export function driverStandings(races: CompletedRace[]): StandingEntry[] {
  const totals = new Map(catalog.drivers.map((d) => [d.id, { points: 0, wins: 0, podiums: 0 }]));
  for (const r of races) {
    for (const c of r.race) {
      const t = totals.get(c.driverId)!;
      t.points += c.points;
      if (c.position === 1 && c.status !== 'dnf') t.wins++;
      if (c.position <= 3 && c.status !== 'dnf') t.podiums++;
    }
  }
  return rank(totals);
}

export function constructorStandings(races: CompletedRace[]): StandingEntry[] {
  const totals = new Map(catalog.teams.map((t) => [t.id, { points: 0, wins: 0, podiums: 0 }]));
  for (const r of races) {
    for (const c of r.race) {
      const t = totals.get(catalog.driver(c.driverId).teamId)!;
      t.points += c.points;
      if (c.position === 1 && c.status !== 'dnf') t.wins++;
      if (c.position <= 3 && c.status !== 'dnf') t.podiums++;
    }
  }
  return rank(totals);
}

export type ProgressionRow = { round: number; label: string } & Record<string, number | string>;

/** Cumulative points per round for drivers or teams. */
export function pointsProgression(races: CompletedRace[], by: 'driver' | 'team'): ProgressionRow[] {
  const ids = by === 'driver' ? catalog.drivers.map((d) => d.id) : catalog.teams.map((t) => t.id);
  const acc: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  return races.map((r) => {
    for (const c of r.race) {
      const key = by === 'driver' ? c.driverId : catalog.driver(c.driverId).teamId;
      acc[key] += c.points;
    }
    return { round: r.event.round, label: circuitCode(r.event.circuitId), ...acc };
  });
}

export interface DriverRaceRow {
  eventId: string;
  round: number;
  season: number;
  label: string;
  circuitId: string;
  grid: number;
  finish: number;
  status: 'finished' | 'lapped' | 'dnf';
  points: number;
  gained: number;
  /** Best qualifying lap gap to pole, percent. */
  qualiGap: number;
  bestLap: number;
  weather: string;
}

export function driverRaceRows(races: CompletedRace[], driverId: DriverId): DriverRaceRow[] {
  return races.map((r) => {
    const c = r.race.find((x) => x.driverId === driverId)!;
    const q = r.qualifying.find((x) => x.driverId === driverId)!;
    const pole = r.qualifying[0];
    const best = (x: typeof q) => x.q3 ?? x.q2 ?? x.q1;
    return {
      eventId: r.event.id,
      round: r.event.round,
      season: r.event.season,
      label: circuitCode(r.event.circuitId),
      circuitId: r.event.circuitId,
      grid: c.grid,
      finish: c.position,
      status: c.status,
      points: c.points,
      gained: c.status === 'dnf' ? 0 : c.grid - c.position,
      qualiGap: ((best(q) - best(pole)) / best(pole)) * 100,
      bestLap: c.bestLap,
      weather: r.event.weather,
    };
  });
}

export interface DriverSeasonStats {
  starts: number;
  points: number;
  wins: number;
  podiums: number;
  poles: number;
  pointsFinishes: number;
  dnfs: number;
  avgFinish: number;
  avgGrid: number;
  bestFinish: number;
  positionsGained: number;
  /** Std. dev. of finishing position across classified finishes. */
  finishSpread: number;
  /** Std. dev. of clean race laps as % of the driver's median, averaged per race. */
  lapConsistency: number;
  fastestLaps: number;
  teammate: { driverId: DriverId; qualiWins: number; raceWins: number; races: number; pointsDelta: number } | null;
}

export function driverSeasonStats(races: CompletedRace[], driverId: DriverId): DriverSeasonStats {
  const rows = driverRaceRows(races, driverId);
  const finished = rows.filter((r) => r.status !== 'dnf');
  const teamId = catalog.driver(driverId).teamId;
  const mate = catalog.driversOf(teamId).find((d) => d.id !== driverId) ?? null;
  const consistency = races.map((r) => {
    const clean = cleanLaps(r, driverId);
    if (clean.length < 5) return null;
    const m = median(clean);
    return (stdDev(clean.filter((l) => l < m * 1.03)) / m) * 100;
  });
  const vals = consistency.filter((x): x is number => x != null);

  let teammate: DriverSeasonStats['teammate'] = null;
  if (mate) {
    const mateRows = driverRaceRows(races, mate.id);
    let qualiWins = 0;
    let raceWins = 0;
    rows.forEach((r, i) => {
      if (r.grid < mateRows[i].grid) qualiWins++;
      if (r.finish < mateRows[i].finish) raceWins++;
    });
    teammate = {
      driverId: mate.id,
      qualiWins,
      raceWins,
      races: rows.length,
      pointsDelta: rows.reduce((s, r) => s + r.points, 0) - mateRows.reduce((s, r) => s + r.points, 0),
    };
  }

  return {
    starts: rows.length,
    points: rows.reduce((s, r) => s + r.points, 0),
    wins: finished.filter((r) => r.finish === 1).length,
    podiums: finished.filter((r) => r.finish <= 3).length,
    poles: rows.filter((r) => r.grid === 1).length,
    pointsFinishes: rows.filter((r) => r.points > 0).length,
    dnfs: rows.length - finished.length,
    avgFinish: mean(finished.map((r) => r.finish)),
    avgGrid: mean(rows.map((r) => r.grid)),
    bestFinish: finished.length ? Math.min(...finished.map((r) => r.finish)) : 0,
    positionsGained: finished.reduce((s, r) => s + r.gained, 0),
    finishSpread: stdDev(finished.map((r) => r.finish)),
    lapConsistency: mean(vals),
    fastestLaps: races.filter((r) => r.sim.fastestLap.driverId === driverId).length,
    teammate,
  };
}

/** Race laps excluding lap 1, pit in-laps, laps after a stop and safety-car laps. */
export function cleanLaps(r: CompletedRace, driverId: DriverId): number[] {
  const tr = r.sim.traces.find((t) => t.driverId === driverId)!;
  const sc = new Set(r.sim.safetyCar.flatMap((p) => Array.from({ length: p.endLap - p.startLap + 2 }, (_, i) => p.startLap + i)));
  return tr.lapTimes.filter((_, i) => i > 0 && !tr.pitLaps.includes(i + 1) && !tr.pitLaps.includes(i) && !sc.has(i + 1));
}

export interface TeamSeasonStats {
  teamId: TeamId;
  points: number;
  wins: number;
  podiums: number;
  /** Mean gap of the team's best qualifier to pole, percent. */
  qualiGap: number;
  /** Mean gap of the team's median clean lap to the fastest team's, percent. */
  raceGap: number;
  mechanicalDnfs: number;
  incidentDnfs: number;
  finishRate: number;
  pitMean: number;
  pitBest: number;
  pitMedian: number;
  pitCount: number;
  doublePoints: number;
}

export function teamQualiGapByRace(r: CompletedRace, teamId: TeamId): number {
  const best = (x: CompletedRace['qualifying'][number]) => x.q3 ?? x.q2 ?? x.q1;
  const pole = best(r.qualifying[0]);
  const mine = Math.min(...r.qualifying.filter((q) => catalog.driver(q.driverId).teamId === teamId).map(best));
  return ((mine - pole) / pole) * 100;
}

export function teamRaceGapByRace(r: CompletedRace, teamId: TeamId): number {
  const teamMedian = (tid: TeamId) => median(catalog.driversOf(tid).flatMap((d) => cleanLaps(r, d.id)));
  const meds = catalog.teams.map((t) => teamMedian(t.id)).filter((m) => m > 0);
  const best = Math.min(...meds);
  const mine = teamMedian(teamId);
  return mine > 0 ? ((mine - best) / best) * 100 : NaN;
}

export function teamSeasonStats(races: CompletedRace[], teamId: TeamId): TeamSeasonStats {
  const drivers = catalog.driversOf(teamId).map((d) => d.id);
  const results = races.flatMap((r) => r.race.filter((c) => drivers.includes(c.driverId)));
  const stops = races.flatMap((r) => r.sim.traces.filter((t) => drivers.includes(t.driverId)).flatMap((t) => t.pitStationary));
  const raceGaps = races.map((r) => teamRaceGapByRace(r, teamId)).filter(Number.isFinite);
  return {
    teamId,
    points: results.reduce((s, c) => s + c.points, 0),
    wins: results.filter((c) => c.position === 1 && c.status !== 'dnf').length,
    podiums: results.filter((c) => c.position <= 3 && c.status !== 'dnf').length,
    qualiGap: mean(races.map((r) => teamQualiGapByRace(r, teamId))),
    raceGap: mean(raceGaps),
    mechanicalDnfs: results.filter((c) => c.status === 'dnf' && c.reason !== 'collision').length,
    incidentDnfs: results.filter((c) => c.status === 'dnf' && c.reason === 'collision').length,
    finishRate: results.length ? results.filter((c) => c.status !== 'dnf').length / results.length : 0,
    pitMean: mean(stops),
    pitBest: stops.length ? Math.min(...stops) : 0,
    pitMedian: median(stops),
    pitCount: stops.length,
    doublePoints: races.filter((r) => r.race.filter((c) => drivers.includes(c.driverId) && c.points > 0).length === 2).length,
  };
}

/** Rows of { round, label, [teamId]: qualifying gap % } for the development chart. */
export function developmentTrend(races: CompletedRace[], metric: 'quali' | 'race'): ProgressionRow[] {
  return races.map((r) => {
    const row: ProgressionRow = { round: r.event.round, label: circuitCode(r.event.circuitId) };
    for (const t of catalog.teams) row[t.id] = +(metric === 'quali' ? teamQualiGapByRace(r, t.id) : teamRaceGapByRace(r, t.id)).toFixed(3);
    return row;
  });
}

/** Average points per race at each circuit, for drivers or teams, across the given races. */
export function circuitPerformance(races: CompletedRace[], ids: string[], by: 'driver' | 'team') {
  const byCircuit = new Map<string, CompletedRace[]>();
  for (const r of races) byCircuit.set(r.event.circuitId, [...(byCircuit.get(r.event.circuitId) ?? []), r]);
  return [...byCircuit.entries()].map(([circuitId, rs]) => {
    const row: Record<string, number | string> = { circuitId, label: circuitCode(circuitId) };
    for (const id of ids) {
      const pts = rs.map((r) =>
        r.race.filter((c) => (by === 'driver' ? c.driverId === id : catalog.driver(c.driverId).teamId === id)).reduce((s, c) => s + c.points, 0),
      );
      const fin = rs.flatMap((r) =>
        r.race.filter((c) => (by === 'driver' ? c.driverId === id : catalog.driver(c.driverId).teamId === id) && c.status !== 'dnf').map((c) => c.position),
      );
      row[id] = +mean(pts).toFixed(1);
      row[`${id}:finish`] = fin.length ? +mean(fin).toFixed(1) : 0;
    }
    return row;
  });
}
