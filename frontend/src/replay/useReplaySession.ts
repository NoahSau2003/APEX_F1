import { useMemo } from 'react';
import { useSessionData, useSessionDataset } from '@/hooks/useSessionData';
import { api } from '@/services/api/client';
import { useReplay } from './useReplay';
import { useTimingAt } from './useTimingAt';

/** Everything the replay screens need for one session, loaded from the backend. */
export function useReplaySession(sessionId: string | null | undefined) {
  const data = useSessionData(sessionId);
  const ready = data.info.data ? sessionId : null;
  const track = useSessionDataset(ready, 'track', api.track);
  const trackStatus = useSessionDataset(ready, 'track-status', api.trackStatus);
  const raceControl = useSessionDataset(ready, 'race-control', api.raceControl);
  const weather = useSessionDataset(ready, 'weather', api.weather);
  // Bind the replay only to the session that is actually loaded (never a stale one).
  const info = data.info.data && data.info.data.id === sessionId ? data.info.data : undefined;
  const replay = useReplay(info);
  const drivers = useMemo(() => {
    const list = data.drivers.data?.rows ?? [];
    // Only drivers with recorded location samples get a marker.
    return info ? list.filter((d) => info.location_coverage[d.driver_number]) : [];
  }, [data.drivers.data, info]);
  const numbers = useMemo(() => (data.drivers.data?.rows ?? []).map((d) => d.driver_number), [data.drivers.data]);
  const grid = useMemo(() => (data.info.data?.kind === 'race' ? new Map((data.results.data?.rows ?? []).map((r) => [r.driver_number, r.grid])) : undefined), [data.results.data, data.info.data?.kind]);
  const timing = useTimingAt(data.laps.data?.rows, numbers, grid);
  return { ...data, infoQuery: data.info, info, track, trackStatus, raceControl, weather, replay, markerDrivers: drivers, timing };
}
