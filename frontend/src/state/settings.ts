import type { PredictionStage } from '@/demo/services/contracts';
import { createStore, useStore } from './store';

export type TelemetryUnits = 'metric' | 'imperial';
export type CameraView = 'overview' | 'follow';

export const CAMERA_LABELS: Record<CameraView, string> = { overview: 'Overview', follow: 'Follow driver' };

export interface Settings {
  theme: 'dark' | 'midnight';
  density: 'compact' | 'comfortable';
  motion: 'system' | 'full' | 'reduced';
  cameraView: CameraView;
  predictionStage: PredictionStage;
  units: TelemetryUnits;
  sidebar: 'auto' | 'expanded' | 'collapsed';
  quality: 'auto' | 'high' | 'low';
  /** Show every driver's abbreviation, not only hovered/selected ones. */
  driverLabels: boolean;
  /** Overlay recorded points and the derived centreline on the replay. */
  debugTrack: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  density: 'compact',
  motion: 'system',
  cameraView: 'overview',
  predictionStage: 'pre-race',
  units: 'metric',
  sidebar: 'auto',
  quality: 'auto',
  driverLabels: false,
  debugTrack: false,
};

/** Allowed values for enum settings; anything else in storage falls back to the default. */
const ALLOWED: Partial<Record<keyof Settings, readonly unknown[]>> = {
  theme: ['dark', 'midnight'],
  density: ['compact', 'comfortable'],
  motion: ['system', 'full', 'reduced'],
  cameraView: ['overview', 'follow'],
  predictionStage: ['pre-qualifying', 'post-qualifying', 'pre-race'],
  units: ['metric', 'imperial'],
  sidebar: ['auto', 'expanded', 'collapsed'],
  quality: ['auto', 'high', 'low'],
};

const KEY = 'apex.settings.v2';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const merged = { ...DEFAULT_SETTINGS };
    for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      const allowed = ALLOWED[k];
      if (parsed[k] !== undefined && typeof parsed[k] === typeof DEFAULT_SETTINGS[k] && (!allowed || allowed.includes(parsed[k]))) (merged as Record<string, unknown>)[k] = parsed[k];
    }
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const settingsStore = createStore<Settings>(load());

settingsStore.subscribe(() => {
  try {
    localStorage.setItem(KEY, JSON.stringify(settingsStore.get()));
  } catch {
    // Storage unavailable (private mode): settings still apply for this session.
  }
});

export const useSettings = <S,>(selector: (s: Settings) => S) => useStore(settingsStore, selector);
export const updateSettings = (patch: Partial<Settings>) => settingsStore.set(patch);
export const resetSettings = () => settingsStore.set(DEFAULT_SETTINGS);

/** Resolve the effective motion preference, including the OS setting. */
export function prefersReducedMotion(motion: Settings['motion']): boolean {
  if (motion === 'reduced') return true;
  if (motion === 'full') return false;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
