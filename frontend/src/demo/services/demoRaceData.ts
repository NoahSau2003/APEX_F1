import { buildTrack } from '@/demo/simulation/track';
import { simulatePractice, simulateQualifying } from '@/demo/simulation/timed';
import { simulateRace } from '@/demo/simulation/race';
import type { SessionSimulation, TimedSimulation } from '@/demo/simulation/types';
import type { EventId, SessionType } from '@/types/domain';
import { catalog } from './catalog';
import type { CompletedRace, RaceDataService } from './contracts';
import { transport } from './transport';

/**
 * Demo implementation: every session is produced by the deterministic local
 * simulator, so results, standings, laps and telemetry all agree.
 */
const qualiCache = new Map<EventId, TimedSimulation>();
const sessionCache = new Map<string, SessionSimulation>();
const raceCache = new Map<EventId, CompletedRace>();

function qualifying(eventId: EventId): TimedSimulation {
  let q = qualiCache.get(eventId);
  if (!q) {
    const event = catalog.event(eventId);
    const circuit = catalog.circuit(event.circuitId);
    q = simulateQualifying(event, circuit, buildTrack(circuit), catalog.drivers);
    qualiCache.set(eventId, q);
  }
  return q;
}

function race(eventId: EventId): CompletedRace {
  let r = raceCache.get(eventId);
  if (!r) {
    const event = catalog.event(eventId);
    const circuit = catalog.circuit(event.circuitId);
    const q = qualifying(eventId);
    const sim = simulateRace(event, circuit, buildTrack(circuit), catalog.drivers, q.qualifying!);
    r = { event, qualifying: q.qualifying!, race: sim.classification, sim };
    raceCache.set(eventId, r);
  }
  return r;
}

function session(eventId: EventId, type: SessionType): SessionSimulation {
  if (type === 'R') return race(eventId).sim;
  if (type === 'Q') return qualifying(eventId);
  const key = `${eventId}:${type}`;
  let s = sessionCache.get(key);
  if (!s) {
    const event = catalog.event(eventId);
    const circuit = catalog.circuit(event.circuitId);
    s = simulatePractice(event, circuit, buildTrack(circuit), catalog.drivers, type);
    sessionCache.set(key, s);
  }
  return s;
}

function assertCompleted(eventId: EventId) {
  if (catalog.event(eventId).status !== 'completed') throw new Error('This event has not taken place in the demo calendar yet.');
}

/** Synchronous access for other demo services (predictions, analytics). */
export const demoRaceStore = {
  race,
  qualifying,
  season: (season: number) =>
    catalog.events.filter((e) => e.season === season && e.status === 'completed').map((e) => race(e.id)),
};

export const demoRaceData: RaceDataService = {
  getSession: (eventId, type) =>
    transport.request(`session:${eventId}:${type}`, () => {
      assertCompleted(eventId);
      return session(eventId, type);
    }),
  getQualifying: (eventId) =>
    transport.request(`quali:${eventId}`, () => {
      assertCompleted(eventId);
      return qualifying(eventId);
    }),
  getRace: (eventId) =>
    transport.request(`race:${eventId}`, () => {
      assertCompleted(eventId);
      return race(eventId);
    }),
  getSeason: (season) => transport.request(`season:${season}`, () => demoRaceStore.season(season)),
};
