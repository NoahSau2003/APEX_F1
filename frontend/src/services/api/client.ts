import type {
  Dataset,
  Driver,
  Health,
  Lap,
  LocationWindow,
  Meeting,
  News,
  PitStop,
  RaceControlRow,
  ResultRow,
  SeasonResults,
  SessionInfo,
  Standings,
  Stint,
  TeamColors,
  Telemetry,
  Track,
  TrackStatusRow,
  WeatherRow,
} from './types';

/**
 * The only module that talks to the backend. The frontend never calls FastF1,
 * OpenF1 or Jolpica directly.
 */
export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8000/api/v1';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, params?: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<T> {
  const url = new URL(`${API_BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(`Cannot reach the Apex backend at ${API_BASE_URL}. Is it running?`, 'backend_unreachable', 0);
  }
  if (!res.ok) {
    let body: { error?: { code: string; message: string }; detail?: unknown } = {};
    try {
      body = await res.json();
    } catch {
      // non-JSON error body
    }
    throw new ApiError(body.error?.message ?? `Request failed (${res.status})`, body.error?.code ?? 'http_error', res.status);
  }
  return res.json() as Promise<T>;
}

const s = (id: string) => `/sessions/${encodeURIComponent(id)}`;

export const api = {
  health: () => request<Health>('/health'),
  seasons: () => request<{ seasons: number[] }>('/seasons'),
  meetings: (year: number) => request<Meeting[]>('/meetings', { year }),
  session: (id: string) => request<SessionInfo>(s(id)),
  drivers: (id: string) => request<Dataset<Driver>>(`${s(id)}/drivers`),
  results: (id: string) => request<Dataset<ResultRow>>(`${s(id)}/results`),
  laps: (id: string) => request<Dataset<Lap>>(`${s(id)}/laps`),
  stints: (id: string) => request<Dataset<Stint>>(`${s(id)}/stints`),
  pitStops: (id: string) => request<Dataset<PitStop>>(`${s(id)}/pit-stops`),
  weather: (id: string) => request<Dataset<WeatherRow>>(`${s(id)}/weather`),
  raceControl: (id: string) => request<Dataset<RaceControlRow>>(`${s(id)}/race-control`),
  trackStatus: (id: string) => request<Dataset<TrackStatusRow>>(`${s(id)}/track-status`),
  track: (id: string) => request<Track>(`${s(id)}/track`),
  locations: (id: string, start: number, end: number, signal?: AbortSignal) => request<LocationWindow>(`${s(id)}/locations`, { start, end }, signal),
  telemetry: (id: string, driver: string, opts: { lap?: number; start?: number; end?: number } = {}, signal?: AbortSignal) =>
    request<Telemetry>(`${s(id)}/telemetry`, { driver, ...opts }, signal),
  seasonResults: (year: number) => request<SeasonResults>(`/seasons/${year}/results`),
  standings: (year: number) => request<Standings>(`/seasons/${year}/standings`),
  teamColors: (year: number) => request<TeamColors>(`/seasons/${year}/team-colors`),
  news: () => request<News>('/news'),
};
