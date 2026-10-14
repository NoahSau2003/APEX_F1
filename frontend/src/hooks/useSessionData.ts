import { useMemo } from 'react';
import { api } from '@/services/api/client';
import type { Driver } from '@/services/api/types';
import { useQuery } from './useQuery';

/** Core datasets of one historical session, each with its own loading/error state. */
export function useSessionData(id: string | null | undefined) {
  const key = (name: string) => (id ? `api:${name}:${id}` : null);
  const info = useQuery(key('session'), () => api.session(id!));
  // Dependent datasets wait for the session to be processed, so the backend loads it once.
  const ready = info.data ? id : null;
  const k = (name: string) => (ready ? `api:${name}:${ready}` : null);
  const drivers = useQuery(k('drivers'), () => api.drivers(ready!));
  const laps = useQuery(k('laps'), () => api.laps(ready!));
  const results = useQuery(k('results'), () => api.results(ready!));
  const driverMap = useMemo(() => new Map<string, Driver>((drivers.data?.rows ?? []).map((d) => [d.driver_number, d])), [drivers.data]);
  return { info, drivers, laps, results, driverMap };
}

export function useSessionDataset<T>(id: string | null | undefined, name: string, fn: (id: string) => Promise<T>, enabled = true) {
  return useQuery(id && enabled ? `api:${name}:${id}` : null, () => fn(id!));
}
