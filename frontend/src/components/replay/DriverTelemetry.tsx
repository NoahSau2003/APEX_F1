import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useQuery } from '@/hooks/useQuery';
import { api } from '@/services/api/client';
import type { Driver, Lap, Telemetry } from '@/services/api/types';
import { useReplayTime } from '@/replay/clock';
import { floorIndex } from '@/replay/engine';
import { useSettings } from '@/state/settings';
import { convertSpeed, formatLapTime, speedUnit } from '@/utils/format';
import { cn } from '@/utils/cn';
import { axisProps, CHART, ChartTooltip, gridProps } from '@/components/charts/theme';
import { TyreBadge } from '@/components/ui/Racing';
import { Select } from '@/components/ui/Select';
import { EmptyState, QueryView } from '@/components/ui/States';
import { SourceBadge } from '@/components/ui/SourceBadge';

const STALE_MS = 2000;
const drsOpen = (v: number | null) => v != null && [10, 12, 14].includes(v);

interface Props {
  sessionId: string;
  driver: Driver;
  laps: Lap[];
  compact?: boolean;
}

/** Selected driver's recorded car data, synchronised with the replay clock. */
export function DriverTelemetry({ sessionId, driver, laps, compact }: Props) {
  const tel = useQuery(`api:telemetry:${sessionId}:${driver.driver_number}`, () => api.telemetry(sessionId, driver.driver_number));
  const t = useReplayTime(8);
  const own = useMemo(() => laps.filter((l) => l.driver_number === driver.driver_number && l.lap != null), [laps, driver.driver_number]);
  const current = own.find((l) => l.start != null && l.end != null && l.start <= t && t < l.end) ?? null;
  const [pinned, setPinned] = useState<number | 'follow'>('follow');
  const lap = pinned === 'follow' ? current : (own.find((l) => l.lap === pinned) ?? null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span className="size-3 shrink-0 rounded-full border border-black/40" style={{ background: driver.team_color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[13px] font-semibold">{driver.abbreviation}</span>
            <span className="num text-[11px] text-fg-3">#{driver.driver_number}</span>
          </div>
          <div className="truncate text-[11.5px] text-fg-3">
            {driver.full_name} · {driver.team_name}
          </div>
        </div>
        <SourceBadge source={tel.data?.source} cache={tel.data?.cache} />
      </div>
      <QueryView query={tel}>{(data) => <LiveReadout data={data} t={t} />}</QueryView>

      {!compact && (
        <>
          <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
            <span className="label">Lap trace</span>
            <Select
              label="Lap"
              size="sm"
              align="end"
              value={pinned}
              onChange={setPinned}
              className="w-[150px]"
              options={[
                { value: 'follow' as const, label: `Follow replay${current ? ` (L${current.lap})` : ''}`, text: 'Follow replay' },
                ...own.map((l) => ({ value: l.lap as number, label: `Lap ${l.lap} · ${formatLapTime(l.lap_time)}`, text: `Lap ${l.lap}` })),
              ]}
            />
          </div>
          {lap ? (
            <>
              <LapSummary lap={lap} />
              {tel.data && <LapTrace data={tel.data} lap={lap} t={t} />}
            </>
          ) : (
            <EmptyState title="Not on a timed lap" description="Pick a lap, or play the replay to a point where this driver is on track." className="py-3" />
          )}
        </>
      )}
    </div>
  );
}

function LiveReadout({ data, t }: { data: Telemetry; t: number }) {
  const units = useSettings((s) => s.units);
  const ch = data.channels;
  const i = floorIndex(ch.t, t * 1000);
  const age = i >= 0 ? t * 1000 - ch.t[i] : Infinity;
  if (i < 0 || age > STALE_MS)
    return <EmptyState title="No car data at this time" description="No telemetry sample was recorded within the last 2 s." className="py-3" />;
  const speed = ch.speed[i];
  const throttle = ch.throttle[i];
  const brake = ch.brake[i];
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <div>
          <div className="label">Speed</div>
          <div className="flex items-baseline gap-1">
            <span className="num text-[28px] leading-none font-semibold tracking-tight">{speed != null ? Math.round(convertSpeed(speed, units)) : '—'}</span>
            <span className="text-[11px] text-fg-3">{speedUnit(units)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Box label="Gear" value={ch.gear[i] ?? '—'} />
          <Box label="DRS" value={ch.drs[i] == null ? '—' : drsOpen(ch.drs[i]) ? 'Open' : 'Closed'} tone={drsOpen(ch.drs[i]) ? 'good' : undefined} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Meter label="Throttle" value={throttle} color="var(--good)" text={throttle != null ? `${Math.round(throttle)}%` : '—'} />
        <Meter label="Brake" value={brake != null ? brake * 100 : null} color="var(--bad)" text={brake == null ? '—' : brake ? 'On' : 'Off'} />
      </div>
      <div className="flex items-center justify-between text-[11.5px] text-fg-3">
        <span>
          RPM <span className="num text-fg-2">{ch.rpm[i]?.toLocaleString('en-GB') ?? '—'}</span>
        </span>
        <span title="Values are the latest recorded sample; nothing is interpolated">Sample {(age / 1000).toFixed(2)} s ago</span>
      </div>
    </div>
  );
}

function Box({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'good' }) {
  return (
    <div className="flex min-w-14 flex-col items-center rounded-md border border-line bg-surface-2 px-2 py-1">
      <span className="label">{label}</span>
      <span className={cn('num text-[15px] leading-tight font-semibold', tone === 'good' && 'text-good')}>{value}</span>
    </div>
  );
}

function Meter({ label, value, color, text }: { label: string; value: number | null; color: string; text: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="label">{label}</span>
        <span className="num text-[12px] font-medium">{text}</span>
      </div>
      <div role="meter" aria-label={`${label} ${text}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined} className="h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, value ?? 0)}%`, background: color }} />
      </div>
    </div>
  );
}

function LapSummary({ lap }: { lap: Lap }) {
  return (
    <div className="grid grid-cols-4 gap-1.5 text-[11.5px]">
      {[
        ['Lap', formatLapTime(lap.lap_time)],
        ['S1', lap.s1?.toFixed(3) ?? '—'],
        ['S2', lap.s2?.toFixed(3) ?? '—'],
        ['S3', lap.s3?.toFixed(3) ?? '—'],
      ].map(([k, v]) => (
        <div key={k} className="rounded-md border border-line bg-surface-2 px-2 py-1">
          <div className="label">{k}</div>
          <div className="num font-medium">{v}</div>
        </div>
      ))}
      <div className="col-span-4 flex items-center gap-2 text-fg-3">
        <TyreBadge compound={lap.compound} age={lap.tyre_life} />
        <span>
          Lap {lap.lap}
          {lap.deleted && ' · deleted'}
          {lap.pit_in != null && ' · pit in'}
          {lap.pit_out != null && ' · pit out'}
          {lap.speed_trap != null && ` · speed trap ${Math.round(lap.speed_trap)} km/h`}
        </span>
      </div>
    </div>
  );
}

function LapTrace({ data, lap, t }: { data: Telemetry; lap: Lap; t: number }) {
  const units = useSettings((s) => s.units);
  const rows = useMemo(() => {
    const ch = data.channels;
    const out: { x: number; speed: number | null; throttle: number | null; brake: number | null }[] = [];
    const a = lap.start! * 1000;
    const b = lap.end! * 1000;
    for (let i = floorIndex(ch.t, a) + 1; i < ch.t.length && ch.t[i] <= b; i++) {
      out.push({ x: +((ch.t[i] - a) / 1000).toFixed(3), speed: ch.speed[i] != null ? +convertSpeed(ch.speed[i]!, units).toFixed(1) : null, throttle: ch.throttle[i], brake: ch.brake[i] != null ? ch.brake[i]! * 100 : null });
    }
    return out;
  }, [data, lap, units]);
  if (!rows.length) return <EmptyState title="No telemetry for this lap" className="py-3" />;
  const marker = lap.start != null && t >= lap.start && t <= lap.end! ? +(t - lap.start).toFixed(2) : null;
  const chart = (key: 'speed' | 'throttle' | 'brake', color: string, height: number, domain: [number, number | 'auto'], unit: string) => (
    <div style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 4, right: 6, bottom: 0, left: -18 }} syncId="lap-trace">
          <CartesianGrid {...gridProps} />
          <XAxis {...axisProps} dataKey="x" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => `${Math.round(v)}s`} hide={key !== 'brake'} />
          <YAxis {...axisProps} domain={domain} width={44} tickCount={3} />
          <Tooltip cursor={{ stroke: CHART.cursor }} content={<ChartTooltip title={(l) => `${Number(l).toFixed(2)} s into lap`} format={(v) => (key === 'brake' ? (v > 0 ? 'On' : 'Off') : `${Math.round(v)} ${unit}`)} name={() => key[0].toUpperCase() + key.slice(1)} />} />
          {marker != null && <ReferenceLine x={marker} stroke={CHART.accent} />}
          <Line dataKey={key} stroke={color} strokeWidth={key === 'speed' ? 2 : 1.5} dot={false} isAnimationActive={false} type={key === 'brake' ? 'stepAfter' : 'linear'} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="text-[10.5px] text-fg-3">Recorded samples · speed ({speedUnit(units)}), throttle (%), brake (on/off) · red line = replay time</figcaption>
      {chart('speed', '#e6e6e8', 110, [0, 'auto'], speedUnit(units))}
      {chart('throttle', '#3fb37f', 60, [0, 100], '%')}
      {chart('brake', '#e5484d', 60, [0, 100], '%')}
    </figure>
  );
}
