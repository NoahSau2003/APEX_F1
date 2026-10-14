import type { TelemetryUnits } from '@/state/settings';

/** 83.456 → "1:23.456" */
export function formatLapTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, '0')}` : s.toFixed(3);
}

/** Race duration → "1:32:04.512" */
export function formatRaceTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
}

/** Session clock → "01:12:30" or "12:30" */
export function formatClock(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${String(h).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Interval/gap → "+1.234", "+1 LAP", "LEADER" */
export function formatGap(gap: number | null | undefined, lapsDown = 0): string {
  if (lapsDown > 0) return `+${lapsDown} LAP${lapsDown > 1 ? 'S' : ''}`;
  if (gap == null || !Number.isFinite(gap)) return '—';
  if (gap <= 0) return 'Leader';
  return `+${gap.toFixed(3)}`;
}

export function formatSpeed(kmh: number, units: TelemetryUnits): string {
  return units === 'imperial' ? `${Math.round(kmh * 0.621371)}` : `${Math.round(kmh)}`;
}

export const speedUnit = (units: TelemetryUnits) => (units === 'imperial' ? 'mph' : 'km/h');

export function convertSpeed(kmh: number, units: TelemetryUnits): number {
  return units === 'imperial' ? kmh * 0.621371 : kmh;
}

export function formatTemp(celsius: number, units: TelemetryUnits): string {
  return units === 'imperial' ? `${Math.round(celsius * 1.8 + 32)}°F` : `${Math.round(celsius)}°C`;
}

export function formatPercent(p: number, digits = 0): string {
  if (!Number.isFinite(p)) return '—';
  const v = p * 100;
  if (v > 0 && v < 1 && digits === 0) return '<1%';
  return `${v.toFixed(digits)}%`;
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
