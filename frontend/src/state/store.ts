import { useSyncExternalStore } from 'react';

/** Minimal external store: components subscribe to slices, so updates stay local. */
export function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  const store = {
    get: () => state,
    set(patch: Partial<T> | ((s: T) => Partial<T>)) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      const changed = Object.keys(next).some((k) => !Object.is(next[k as keyof T], state[k as keyof T]));
      if (!changed) return;
      state = { ...state, ...next };
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
  return store;
}

export function useStore<T extends object, S>(store: ReturnType<typeof createStore<T>>, selector: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}
