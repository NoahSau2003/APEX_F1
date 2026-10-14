import { useEffect } from 'react';
import { useQuery } from '@/hooks/useQuery';
import { api } from '@/services/api/client';
import type { Meeting, SessionRef } from '@/services/api/types';
import { createStore, useStore } from './store';

/**
 * Selected historical season / Grand Prix / session / driver, shared by every
 * page. Remembered locally so a reload returns to the same session.
 */
export interface HistoricalSelection {
  year: number | null;
  meetingId: string | null;
  sessionId: string | null;
  driver: string | null;
}

const KEY = 'apex.historical.v1';

function load(): HistoricalSelection {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { year: null, meetingId: null, sessionId: null, driver: null, ...JSON.parse(raw) };
  } catch {
    // storage unavailable
  }
  return { year: null, meetingId: null, sessionId: null, driver: null };
}

export const historicalStore = createStore<HistoricalSelection>(load());
historicalStore.subscribe(() => {
  try {
    localStorage.setItem(KEY, JSON.stringify(historicalStore.get()));
  } catch {
    // ignore
  }
});

export const useHistorical = <S,>(sel: (s: HistoricalSelection) => S) => useStore(historicalStore, sel);

export function selectYear(year: number) {
  historicalStore.set({ year, meetingId: null, sessionId: null, driver: null });
}

export function selectMeeting(m: Meeting) {
  historicalStore.set({ meetingId: m.id, sessionId: defaultSession(m)?.id ?? null, driver: null });
}

export function selectSession(sessionId: string) {
  // A different session has different drivers: never carry the selection over silently.
  if (historicalStore.get().sessionId !== sessionId) historicalStore.set({ sessionId, driver: null });
}

export const selectDriver = (driver: string | null) => historicalStore.set({ driver });

/** Jump straight to a known meeting/session (e.g. from Race History). */
export function openSession(year: number, meetingId: string, sessionId: string) {
  historicalStore.set({ year, meetingId, sessionId, driver: null });
}

/** The race if it has run, otherwise the latest completed session of the weekend. */
export function defaultSession(m: Meeting): SessionRef | undefined {
  const done = m.sessions.filter((s) => s.replay_available);
  return done.find((s) => s.code === 'R') ?? done[done.length - 1] ?? m.sessions[m.sessions.length - 1];
}

export function latestCompletedMeeting(ms: Meeting[]): Meeting | undefined {
  return [...ms].reverse().find((m) => m.sessions.some((s) => s.replay_available));
}

/**
 * Resolves the selection against backend data, filling defaults (current season,
 * latest completed meeting, its race) whenever a level is unset or unknown.
 */
export function useHistoricalContext() {
  const sel = useHistorical((s) => s);
  const seasons = useQuery('api:seasons', () => api.seasons());
  const year = sel.year ?? seasons.data?.seasons[0] ?? null;
  const meetings = useQuery(year ? `api:meetings:${year}` : null, () => api.meetings(year!));
  const meeting = meetings.data?.find((m) => m.id === sel.meetingId) ?? (meetings.data ? latestCompletedMeeting(meetings.data) : undefined);
  const session = meeting?.sessions.find((s) => s.id === sel.sessionId) ?? (meeting ? defaultSession(meeting) : undefined);

  useEffect(() => {
    const patch: Partial<HistoricalSelection> = {};
    if (year && sel.year !== year) patch.year = year;
    if (meeting && sel.meetingId !== meeting.id) patch.meetingId = meeting.id;
    if (session && sel.sessionId !== session.id) {
      patch.sessionId = session.id;
      patch.driver = null;
    }
    if (Object.keys(patch).length) historicalStore.set(patch);
  }, [year, meeting, session, sel.year, sel.meetingId, sel.sessionId]);

  return { seasons, meetings, year, meeting, session, driver: sel.driver };
}
