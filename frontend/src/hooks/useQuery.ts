import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Small async-data hook with a shared cache. Gives every page consistent
 * loading / error / retry behaviour regardless of which service it calls.
 */
type Entry<T> = { status: 'loading' | 'success' | 'error'; data?: T; error?: Error };

const cache = new Map<string, Entry<unknown>>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

function run<T>(key: string, fn: () => Promise<T>) {
  const prev = cache.get(key) as Entry<T> | undefined;
  cache.set(key, { status: 'loading', data: prev?.data });
  fn().then(
    (data) => {
      cache.set(key, { status: 'success', data });
      notify();
    },
    (error: Error) => {
      cache.set(key, { status: 'error', error, data: prev?.data });
      notify();
    },
  );
}

export interface QueryResult<T> {
  data: T | undefined;
  status: 'loading' | 'success' | 'error';
  error: Error | undefined;
  /** True only while there is nothing to show yet. */
  isLoading: boolean;
  retry: () => void;
}

/** `key` identifies the request; pass null to skip. */
export function useQuery<T>(key: string | null, fn: () => Promise<T>): QueryResult<T> {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const entry = useSyncExternalStore(subscribe, () => (key ? (cache.get(key) as Entry<T> | undefined) : undefined));

  useEffect(() => {
    if (key && !cache.has(key)) {
      run(key, () => fnRef.current());
      notify();
    }
  });

  const retry = useCallback(() => {
    if (!key) return;
    run(key, () => fnRef.current());
    notify();
  }, [key]);

  const status = entry?.status ?? 'loading';
  return { data: entry?.data, status, error: entry?.error, isLoading: entry?.data === undefined && status !== 'error', retry };
}
