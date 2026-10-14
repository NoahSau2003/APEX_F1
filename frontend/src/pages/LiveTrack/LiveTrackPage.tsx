import { useState } from 'react';
import { CloudRain, MonitorPlay, LoaderCircle, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Thermometer } from 'lucide-react';
import { useReplayTime } from '@/replay/clock';
import { useReplaySession } from '@/replay/useReplaySession';
import { selectDriver, useHistoricalContext } from '@/state/historical';
import { navigate } from '@/state/router';
import type { WeatherRow } from '@/services/api/types';
import { formatDate } from '@/utils/format';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState, FirstError, QueryView } from '@/components/ui/States';
import { SourceBadge } from '@/components/ui/SourceBadge';
import { DriverTelemetry } from '@/components/replay/DriverTelemetry';
import { RaceControlFeed } from '@/components/replay/RaceControlFeed';
import { ReplayControls } from '@/components/replay/ReplayControls';
import { ReplayViewport } from '@/components/replay/ReplayViewport';
import { TimingTower } from '@/components/replay/TimingTower';
import { TrackBadge } from '@/components/replay/TrackBadge';
import { MappingReport } from '@/components/replay/MappingReport';

export default function LiveTrackPage() {
  const ctx = useHistoricalContext();
  const s = useReplaySession(ctx.session?.replay_available ? ctx.session.id : null);
  const [mode, setMode] = useState<'gap' | 'interval'>('interval');
  const [showTower, setShowTower] = useState(true);
  const [showSide, setShowSide] = useState(true);
  const selected = ctx.driver && s.driverMap.has(ctx.driver) ? ctx.driver : null;
  const race = s.info?.kind === 'race';

  if (ctx.session && !ctx.session.replay_available)
    return (
      <EmptyState
        className="h-full"
        icon={<MonitorPlay />}
        title={`${ctx.meeting?.name ?? ''} ${ctx.session.name}: replay unavailable`}
        description={ctx.session.unavailable_reason ?? 'No recorded data for this session.'}
        action={<Button onClick={() => navigate('history')}>Browse race history</Button>}
      />
    );

  const loading = !s.info || !s.track.data;
  const hud = s.info && (
    <>
      <div className="flex items-center gap-1.5 rounded-md border border-line bg-surface/90 px-2 py-1.5 backdrop-blur-sm">
        <IconButton size="sm" label={showTower ? 'Hide timing tower' : 'Show timing tower'} onClick={() => setShowTower((v) => !v)} className="max-lg:hidden">
          {showTower ? <PanelLeftClose /> : <PanelLeftOpen />}
        </IconButton>
        <div className="min-w-0 px-1">
          <div className="truncate text-[12.5px] font-semibold">
            {s.info.year} {s.info.meeting_name}
          </div>
          <div className="truncate text-[11px] text-fg-3">
            {s.info.session_name} · {s.info.location} · {s.info.date_utc ? formatDate(s.info.date_utc.slice(0, 10)) : ''}
          </div>
        </div>
        <IconButton size="sm" label={showSide ? 'Hide side panels' : 'Show side panels'} onClick={() => setShowSide((v) => !v)} className="max-lg:hidden">
          {showSide ? <PanelRightClose /> : <PanelRightOpen />}
        </IconButton>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="info" icon={<MonitorPlay />} title="Recorded historical data replayed locally. Not live.">
          Historical replay
        </Badge>
        {s.track.data?.available && <TrackBadge v={s.track.data.validation} />}
        {s.track.data?.available && <MappingReport track={s.track.data} />}
        <WeatherChip rows={s.weather.data?.rows} />
      </div>
    </>
  );

  return (
    <div className="flex flex-col gap-gap p-3 md:p-4 lg:h-[calc(100dvh-3rem)] lg:flex-row lg:gap-0 lg:p-0">
      {showTower && (
        <Panel
          title="Timing"
          subtitle={s.timing.lap ? `Lap ${s.timing.lap}${s.info?.total_laps && race ? `/${s.info.total_laps}` : ''}` : s.info?.session_name}
          flush
          actions={
            race ? (
              <Segmented
                label="Gap reference"
                size="xs"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'gap', label: 'Leader' },
                  { value: 'interval', label: 'Interval' },
                ]}
              />
            ) : undefined
          }
          className="max-lg:max-h-[520px] lg:w-[300px] lg:shrink-0 lg:rounded-none lg:border-y-0 lg:border-l-0"
          bodyClassName="flex min-h-0 flex-col"
        >
          <QueryView query={s.laps} className="p-pad">
            {() => <TimingTower rows={s.timing.rows} drivers={s.driverMap} selected={selected} onSelect={selectDriver} mode={mode} race={race} className="min-h-0 flex-1" />}
          </QueryView>
          <p className="border-t border-line px-pad py-1.5 text-[10.5px] text-fg-3">Positions: FastF1 lap timing. {race && 'Gaps: calculated from line-crossing times.'}</p>
        </Panel>
      )}

      <section className="flex min-h-[440px] min-w-0 flex-col overflow-hidden rounded-lg border border-line max-lg:order-first max-lg:h-[64vh] lg:flex-1 lg:rounded-none lg:border-0">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            {s.infoQuery.status === 'error' || s.track.status === 'error' ? (
              <FirstError queries={[s.infoQuery, s.track]} />
            ) : (
              <div className="flex flex-col items-center gap-2 text-center">
                <LoaderCircle className="size-5 animate-spin text-fg-3" />
                <p className="text-[13px] font-medium">Preparing {ctx.meeting?.name} {ctx.session?.name}</p>
                <p className="max-w-sm text-[12px] text-fg-3">The first load downloads and processes the session with FastF1; this can take up to a minute. Later loads come from the local cache.</p>
              </div>
            )}
          </div>
        ) : s.track.data && !s.track.data.available ? (
          <EmptyState title="Circuit geometry unavailable" description={s.track.data.reason} />
        ) : (
          s.track.data?.available &&
          s.info && (
            <>
              <ReplayViewport
                className="min-h-0 flex-1"
                sessionId={s.info.id}
                track={s.track.data}
                drivers={s.markerDrivers}
                engine={s.replay.loader?.engine ?? null}
                timing={s.timing.byDriver}
                selected={selected}
                onSelect={selectDriver}
                hud={hud}
              />
              <ReplayControls info={s.info} lap={s.timing.lap} trackStatus={s.trackStatus.data?.rows} progress={s.replay.progress} />
            </>
          )
        )}
      </section>

      {showSide && (
        <div className="flex min-h-0 flex-col gap-gap lg:w-[340px] lg:shrink-0 lg:gap-0 lg:overflow-y-auto lg:border-l lg:border-line">
          <Panel title="Driver telemetry" subtitle="Recorded car data at the replay time" className="lg:rounded-none lg:border-0 lg:border-b">
            {selected && s.info && s.laps.data ? (
              <DriverTelemetry key={`${s.info.id}:${selected}`} sessionId={s.info.id} driver={s.driverMap.get(selected)!} laps={s.laps.data.rows} />
            ) : (
              <EmptyState title="Select a driver" description="Click a dot on the circuit or a row in the timing tower." className="py-4" />
            )}
          </Panel>
          <Panel
            title="Race control"
            subtitle="Official messages up to the replay time"
            actions={<SourceBadge source={s.raceControl.data?.source} cache={s.raceControl.data?.cache} />}
            className="min-h-[260px] lg:min-h-[300px] lg:flex-1 lg:rounded-none lg:border-0"
            bodyClassName="flex min-h-0 flex-col"
          >
            <QueryView query={s.raceControl}>{(d) => <RaceControlFeed rows={d.rows} drivers={s.driverMap} />}</QueryView>
          </Panel>
        </div>
      )}
    </div>
  );
}

/** Latest recorded weather observation at or before the replay time. */
function WeatherChip({ rows }: { rows?: WeatherRow[] }) {
  const t = useReplayTime(1);
  if (!rows?.length) return null;
  let w: WeatherRow | undefined;
  for (const r of rows) if (r.time != null && r.time <= t) w = r;
  if (!w) return null;
  return (
    <span className="num inline-flex items-center gap-1.5 rounded border border-line bg-surface/90 px-1.5 py-0.5 text-[11px] text-fg-2 backdrop-blur-sm" title="Latest recorded weather observation (FastF1, ~1 per minute)">
      {w.rainfall ? <CloudRain className="size-3 text-info" /> : <Thermometer className="size-3" />}
      Air {w.air_temp ?? '—'}°C · Track {w.track_temp ?? '—'}°C
    </span>
  );
}
