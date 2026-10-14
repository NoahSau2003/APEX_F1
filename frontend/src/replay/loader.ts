import { api } from '@/services/api/client';
import type { SessionInfo } from '@/services/api/types';
import { createStore } from '@/state/store';
import { ReplayEngine } from './engine';
import { replayClock } from './clock';

/**
 * Downloads a session's location samples window by window (the backend's chunk
 * size), starting with the window under the replay clock and expanding outward.
 * Only the selected session is ever loaded; `cancel()` aborts in-flight requests.
 */
export interface LoaderState {
  sessionId: string | null;
  loaded: number;
  total: number;
  error: string | null;
}

export const loaderStore = createStore<LoaderState>({ sessionId: null, loaded: 0, total: 0, error: null });

export class LocationLoader {
  readonly engine: ReplayEngine;
  private abort = new AbortController();
  private pending: number[];
  private done = new Set<number>();
  private active = false;

  constructor(private info: SessionInfo) {
    const coverage = Object.fromEntries(Object.entries(info.location_coverage).map(([d, c]) => [d, { first_ms: c.first_ms, last_ms: c.last_ms }]));
    this.engine = new ReplayEngine(info.id, coverage);
    this.pending = [...info.timeline.chunks];
    loaderStore.set({ sessionId: info.id, loaded: 0, total: this.pending.length, error: null });
  }

  /** Next chunk to fetch: nearest to the replay clock, preferring ahead of it. */
  private next(): number | undefined {
    const cur = Math.floor(replayClock.time / this.info.timeline.chunk_s);
    let best: number | undefined;
    let bestScore = Infinity;
    for (const c of this.pending) {
      if (this.done.has(c)) continue;
      const score = c >= cur ? c - cur : (cur - c) * 1.5 + 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  async run(concurrency = 2) {
    if (this.active) return;
    this.active = true;
    const worker = async () => {
      for (let c = this.next(); c !== undefined && !this.abort.signal.aborted; c = this.next()) {
        this.done.add(c);
        const size = this.info.timeline.chunk_s;
        try {
          const w = await api.locations(this.info.id, c * size, (c + 1) * size, this.abort.signal);
          if (this.abort.signal.aborted) return;
          this.engine.addWindow(c * size * 1000, (c + 1) * size * 1000, w.drivers);
          loaderStore.set((s) => (s.sessionId === this.info.id ? { loaded: s.loaded + 1 } : {}));
        } catch (e) {
          if ((e as Error).name === 'AbortError') return;
          this.done.delete(c);
          loaderStore.set({ error: (e as Error).message });
          return;
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    this.active = false;
  }

  /** Re-prioritise after a seek (the running workers pick the new nearest chunk). */
  retry() {
    loaderStore.set({ error: null });
    void this.run();
  }

  cancel() {
    this.abort.abort();
  }
}
