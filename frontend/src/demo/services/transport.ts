/**
 * Simulated network for the demo services: a short first-load latency and a
 * switch to simulate a lost data connection, so loading and error states can
 * be exercised. Real adapters would replace this with fetch/WebSocket calls.
 */
type Listener = () => void;

const state = { offline: false };
const listeners = new Set<Listener>();
const warmed = new Set<string>();

export class DataSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataSourceError';
  }
}

export const transport = {
  isOffline: () => state.offline,
  setOffline(value: boolean) {
    if (state.offline === value) return;
    state.offline = value;
    listeners.forEach((l) => l());
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Resolve `fn` as if it came over the network. */
  async request<T>(key: string, fn: () => T): Promise<T> {
    const first = !warmed.has(key);
    await new Promise((r) => setTimeout(r, first ? 220 + Math.random() * 260 : 0));
    if (state.offline) throw new DataSourceError('Demo data source is disconnected (simulated in Settings).');
    warmed.add(key);
    return fn();
  },
};
