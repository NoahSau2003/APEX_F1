import { CIRCUITS } from '@/demo/data/demoCircuits';
import { DRIVERS, TEAMS } from '@/demo/data/demoDrivers';
import { EVENTS, SEASONS } from '@/demo/data/demoRaces';
import type { Catalog } from './contracts';

function indexBy<T extends { id: string }>(items: T[], kind: string) {
  const map = new Map(items.map((i) => [i.id, i]));
  return (id: string): T => {
    const hit = map.get(id);
    if (!hit) throw new Error(`Unknown ${kind}: ${id}`);
    return hit;
  };
}

/** Reference data. In production this would be fetched once at boot. */
export const catalog: Catalog = {
  teams: TEAMS,
  drivers: DRIVERS,
  circuits: CIRCUITS,
  events: EVENTS,
  seasons: [...SEASONS],
  team: indexBy(TEAMS, 'team'),
  driver: indexBy(DRIVERS, 'driver'),
  circuit: indexBy(CIRCUITS, 'circuit'),
  event: indexBy(EVENTS, 'event'),
  driversOf: (teamId) => DRIVERS.filter((d) => d.teamId === teamId),
};

const countryCount = new Map<string, number>();
for (const c of CIRCUITS) countryCount.set(c.countryCode, (countryCount.get(c.countryCode) ?? 0) + 1);

/** Short chart label: the country code, or the locality where a country hosts several circuits. */
export function circuitCode(circuitId: string): string {
  const c = catalog.circuit(circuitId);
  return (countryCount.get(c.countryCode) ?? 0) > 1 ? c.locality.slice(0, 3).toUpperCase() : c.countryCode;
}
