import { useSyncExternalStore } from 'react';
import { createStore, useStore } from '@/state/store';

/**
 * Replay clock on the session's own timeline (FastF1 SessionTime, seconds).
 * `replayClock.time` advances every animation frame and is read directly by the
 * 3D scene; React panels subscribe to a throttled view via useReplayTime().
 */
export const replayClock = { time: 0 };

interface ClockState {
  sessionId: string | null;
  start: number;
  end: number;
  playing: boolean;
  speed: number;
  /** Bumps on every seek or session change so dependants can react. */
  seekId: number;
}

export const SPEEDS = [0.5, 1, 2, 5, 10, 30] as const;

export const clockStore = createStore<ClockState>({ sessionId: null, start: 0, end: 0, playing: false, speed: 1, seekId: 0 });
export const useClock = <S,>(sel: (s: ClockState) => S) => useStore(clockStore, sel);

let raf = 0;
let last = 0;
function frame(now: number) {
  const s = clockStore.get();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (s.playing && s.sessionId) {
    replayClock.time = Math.min(s.end, replayClock.time + dt * s.speed);
    if (replayClock.time >= s.end) clockStore.set({ playing: false });
  }
  raf = requestAnimationFrame(frame);
}

export function startReplayClock() {
  if (raf) return;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

export function stopReplayClock() {
  cancelAnimationFrame(raf);
  raf = 0;
}

/** Bind the clock to a session. Clears any previous session's position immediately. */
export function bindSession(sessionId: string, start: number, end: number, initial: number) {
  const s = clockStore.get();
  if (s.sessionId === sessionId) return;
  replayClock.time = Math.max(start, Math.min(end, initial));
  clockStore.set({ sessionId, start, end, playing: false, seekId: s.seekId + 1 });
}

export function unbindSession() {
  replayClock.time = 0;
  clockStore.set({ sessionId: null, playing: false, seekId: clockStore.get().seekId + 1 });
}

export function seek(time: number) {
  const s = clockStore.get();
  replayClock.time = Math.max(s.start, Math.min(s.end, time));
  clockStore.set({ seekId: s.seekId + 1 });
}

export function play() {
  const s = clockStore.get();
  if (!s.sessionId) return;
  if (replayClock.time >= s.end) replayClock.time = s.start;
  clockStore.set({ playing: true });
}

export const pause = () => clockStore.set({ playing: false });
export const togglePlay = () => (clockStore.get().playing ? pause() : play());
export const setSpeed = (speed: number) => clockStore.set({ speed });

/** Throttled replay time for UI panels. */
export function useReplayTime(hz = 4): number {
  return useSyncExternalStore(
    (cb) => {
      const id = window.setInterval(cb, 1000 / hz);
      const unsub = clockStore.subscribe(cb);
      return () => {
        window.clearInterval(id);
        unsub();
      };
    },
    () => Math.floor(replayClock.time * hz) / hz,
  );
}
