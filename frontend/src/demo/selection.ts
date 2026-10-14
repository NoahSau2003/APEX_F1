import { catalog } from '@/demo/services/catalog';
import type { DriverId, EventId, SessionType, TeamId } from '@/types/domain';
import { createStore, useStore } from '@/state/store';

/**
 * Global selection shared across every screen: which event and session is
 * in focus, and which driver/team is highlighted.
 */
export interface Selection {
  season: number;
  eventId: EventId;
  session: SessionType;
  driverId: DriverId;
  teamId: TeamId;
}

const latest = [...catalog.events].filter((e) => e.status === 'completed').sort((a, b) => b.date.localeCompare(a.date))[0];

export const selectionStore = createStore<Selection>({
  season: latest.season,
  eventId: latest.id,
  session: 'R',
  driverId: catalog.drivers[0].id,
  teamId: catalog.drivers[0].teamId,
});

export const useSelection = <S,>(selector: (s: Selection) => S) => useStore(selectionStore, selector);

export const selectDriver = (driverId: DriverId) =>
  selectionStore.set({ driverId, teamId: catalog.driver(driverId).teamId });
export const selectTeam = (teamId: TeamId) => selectionStore.set({ teamId });
export const selectSession = (session: SessionType) => selectionStore.set({ session });

export function selectEvent(eventId: EventId) {
  const ev = catalog.event(eventId);
  selectionStore.set({ eventId, season: ev.season });
}

export function selectSeason(season: number) {
  const events = catalog.events.filter((e) => e.season === season);
  const completed = events.filter((e) => e.status === 'completed');
  const target = completed[completed.length - 1] ?? events[0];
  selectionStore.set({ season, eventId: target.id });
}
