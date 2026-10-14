import { DRIVER_MODEL, TEAM_MODEL } from '@/demo/data/demoModel';
import type { Circuit, Driver, RaceEvent } from '@/types/domain';
import { createRng, hashString } from '@/utils/random';

/**
 * Deterministic pace offset (percent of lap time, lower is faster) for a
 * driver at an event. Shared by every session so practice, qualifying and the
 * race tell the same story.
 */
export function weekendPace(driver: Driver, event: RaceEvent, circuit: Circuit): number {
  const team = TEAM_MODEL[driver.teamId];
  const model = DRIVER_MODEL[driver.id];
  const rng = createRng(hashString(`${event.id}:${driver.id}:form`));
  const car =
    (team.pace[event.season] ?? 1) +
    (team.development[event.season] ?? 0) * (event.round - 1) +
    team.downforceBias * (0.5 - circuit.traits.downforce) * -0.5;
  const wet = event.weather === 'wet' ? model.wet * 1.6 : event.weather === 'mixed' ? model.wet * 0.7 : 0;
  return car + model.skill + wet + rng.gauss() * 0.11;
}

export function weatherLapFactor(weather: RaceEvent['weather']): number {
  return weather === 'wet' ? 1.11 : weather === 'mixed' ? 1.035 : 1;
}

export function eventSeed(event: RaceEvent, salt: string): number {
  return hashString(`${event.id}:${salt}`);
}
