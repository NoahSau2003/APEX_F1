import type { RaceEvent, Weather } from '@/types/domain';
import { CIRCUIT_BY_ID } from './demoCircuits';

/**
 * DEMO DATA. A two-season demo calendar. Dates and weather are illustrative;
 * every result for these events is produced by the local simulator.
 */
export const SEASONS = [2026, 2025] as const;

/** "Today" for the demo, so the calendar status does not depend on the wall clock. */
export const DEMO_TODAY = '2026-10-14';

const ROUNDS: { circuitId: string; name: string; date: Record<number, string>; weather?: Partial<Record<number, Weather>> }[] = [
  { circuitId: 'sakhir', name: 'Bahrain Grand Prix', date: { 2025: '2025-03-09', 2026: '2026-03-08' } },
  { circuitId: 'jeddah', name: 'Saudi Arabian Grand Prix', date: { 2025: '2025-03-23', 2026: '2026-03-22' } },
  { circuitId: 'albert-park', name: 'Australian Grand Prix', date: { 2025: '2025-04-06', 2026: '2026-04-05' }, weather: { 2025: 'mixed' } },
  { circuitId: 'shanghai', name: 'Chinese Grand Prix', date: { 2025: '2025-04-20', 2026: '2026-04-19' } },
  { circuitId: 'imola', name: 'Emilia Romagna Grand Prix', date: { 2025: '2025-05-18', 2026: '2026-05-17' }, weather: { 2026: 'wet' } },
  { circuitId: 'monaco', name: 'Monaco Grand Prix', date: { 2025: '2025-05-25', 2026: '2026-05-24' } },
  { circuitId: 'catalunya', name: 'Spanish Grand Prix', date: { 2025: '2025-06-01', 2026: '2026-06-07' } },
  { circuitId: 'villeneuve', name: 'Canadian Grand Prix', date: { 2025: '2025-06-15', 2026: '2026-06-14' }, weather: { 2025: 'wet' } },
  { circuitId: 'spielberg', name: 'Austrian Grand Prix', date: { 2025: '2025-06-29', 2026: '2026-06-28' } },
  { circuitId: 'silverstone', name: 'British Grand Prix', date: { 2025: '2025-07-06', 2026: '2026-07-05' }, weather: { 2026: 'mixed' } },
  { circuitId: 'spa', name: 'Belgian Grand Prix', date: { 2025: '2025-07-27', 2026: '2026-07-26' }, weather: { 2025: 'mixed' } },
  { circuitId: 'zandvoort', name: 'Dutch Grand Prix', date: { 2025: '2025-08-31', 2026: '2026-08-30' } },
  { circuitId: 'monza', name: 'Italian Grand Prix', date: { 2025: '2025-09-07', 2026: '2026-09-06' } },
  { circuitId: 'cota', name: 'United States Grand Prix', date: { 2025: '2025-10-19', 2026: '2026-10-04' } },
  { circuitId: 'interlagos', name: 'São Paulo Grand Prix', date: { 2025: '2025-11-09', 2026: '2026-10-25' } },
  { circuitId: 'yas-marina', name: 'Abu Dhabi Grand Prix', date: { 2025: '2025-12-07', 2026: '2026-11-29' } },
];

export const EVENTS: RaceEvent[] = SEASONS.flatMap((season) =>
  ROUNDS.map((r, i) => {
    if (!CIRCUIT_BY_ID[r.circuitId]) throw new Error(`Unknown circuit ${r.circuitId}`);
    const date = r.date[season];
    return {
      id: `${season}-${String(i + 1).padStart(2, '0')}`,
      season,
      round: i + 1,
      name: r.name,
      circuitId: r.circuitId,
      date,
      status: date <= DEMO_TODAY ? 'completed' : 'upcoming',
      weather: r.weather?.[season] ?? 'dry',
    } satisfies RaceEvent;
  }),
);
