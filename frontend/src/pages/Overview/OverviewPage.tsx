import { useMemo } from 'react';
import { ArrowRight, CloudRain, ExternalLink, Flag, LoaderCircle, MapPin, Maximize2, MonitorPlay, Newspaper, ShieldAlert, Thermometer, Timer, Trophy, Wrench } from 'lucide-react';
import { useQuery } from '@/hooks/useQuery';
import { useSessionDataset } from '@/hooks/useSessionData';
import { api } from '@/services/api/client';
import type { Driver } from '@/services/api/types';
import { useReplaySession } from '@/replay/useReplaySession';
import { selectDriver, useHistoricalContext } from '@/state/historical';
import { navigate } from '@/state/router';
import { formatDate, formatLapTime } from '@/utils/format';
import { mean } from '@/utils/math';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DriverChip } from '@/components/ui/DriverChip';
import { Panel } from '@/components/ui/Panel';
import { SourceBadge } from '@/components/ui/SourceBadge';
import { Stat } from '@/components/ui/Stat';
import { EmptyState, FirstError, QueryView, Skeleton } from '@/components/ui/States';
import { SessionLapChart } from '@/components/charts/SessionLapChart';
import { Page } from '@/components/layout/Page';
import { ResultsTable } from '@/components/results/ResultsTable';
import { RaceControlFeed } from '@/components/replay/RaceControlFeed';
import { ReplayControls } from '@/components/replay/ReplayControls';
import { ReplayViewport } from '@/components/replay/ReplayViewport';
import { TrackBadge } from '@/components/replay/TrackBadge';

export default function OverviewPage() {
  const ctx = useHistoricalContext();
  const sid = ctx.session?.replay_available ? ctx.session.id : null;
  const s = useReplaySession(sid);
  const pits = useSessionDataset(s.info ? sid : null, 'pit-stops', api.pitStops);
  const selected = ctx.driver && s.driverMap.has(ctx.driver) ? ctx.driver : null;
  const kind = s.info?.kind ?? ctx.session?.kind ?? 'race';

  if (ctx.meetings.status === 'error' || ctx.seasons.status === 'error')
    return (
      <Page>
        <FirstError queries={[ctx.seasons, ctx.meetings]} />
      </Page>
    );

  return (
    <Page>
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[17px] font-semibold tracking-tight">{ctx.meeting ? `${ctx.meeting.year} ${ctx.meeting.name}` : <Skeleton className="h-5 w-56" />}</h1>
            <Badge tone="info" icon={<MonitorPlay />} title="Recorded historical data, not live">
              Historical
            </Badge>
            {s.track.data?.available && <TrackBadge v={s.track.data.validation} />}
            {s.results.data && <SourceBadge source={s.results.data.source} cache={s.results.data.cache} />}
          </div>
          {ctx.meeting && (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-3">
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {s.info?.circuit_short_name ?? ctx.meeting.location}, {ctx.meeting.country}
              </span>
              <span>Round {ctx.meeting.round}</span>
              <span>
                {ctx.session?.name}
                {ctx.session?.date_utc && ` · ${formatDate(ctx.session.date_utc.slice(0, 10))}`}
              </span>
              {s.drivers.data && <span>{s.drivers.data.rows.length} drivers</span>}
              {ctx.session && !ctx.session.replay_available && <span className="text-warn">{ctx.session.unavailable_reason}</span>}
            </p>
          )}
        </div>
        <Button size="sm" icon={<Maximize2 />} disabled={!sid} onClick={() => navigate('live')}>
          Open full replay
        </Button>
      </header>

      <KeyStats s={s} pitCount={pits.data?.rows.length} kind={kind} />

      <div className="grid grid-cols-1 gap-gap xl:grid-cols-12">
        <Panel flush className="h-[min(600px,max(430px,60vh))] overflow-hidden xl:col-span-7" bodyClassName="flex min-h-0 flex-col">
          {!sid ? (
            <EmptyState icon={<MonitorPlay />} title="No replay for this session" description={ctx.session?.unavailable_reason ?? 'Select a completed session.'} className="flex-1" />
          ) : s.track.data?.available && s.info ? (
            <>
              <ReplayViewport
                className="min-h-0 flex-1 rounded-t-lg"
                sessionId={s.info.id}
                track={s.track.data}
                drivers={s.markerDrivers}
                engine={s.replay.loader?.engine ?? null}
                timing={s.timing.byDriver}
                selected={selected}
                onSelect={selectDriver}
              />
              <ReplayControls info={s.info} lap={s.timing.lap} trackStatus={s.trackStatus.data?.rows} progress={s.replay.progress} className="rounded-b-lg" />
            </>
          ) : s.track.data && !s.track.data.available ? (
            <EmptyState title="Circuit geometry unavailable" description={s.track.data.reason} className="flex-1" />
          ) : s.infoQuery.status === 'error' || s.track.status === 'error' ? (
            <FirstError queries={[s.infoQuery, s.track]} className="flex-1" />
          ) : (
            <Preparing name={`${ctx.meeting?.name ?? ''} ${ctx.session?.name ?? ''}`} />
          )}
        </Panel>

        <Panel
          title="Results"
          subtitle={s.results.data?.source.calculated ? 'Ranked by fastest lap (calculated)' : 'Official classification'}
          flush
          className="h-[min(600px,max(430px,60vh))] xl:col-span-5"
          bodyClassName="flex min-h-0 flex-col"
          actions={<SourceBadge source={s.results.data?.source} cache={s.results.data?.cache} />}
        >
          {sid ? (
            <QueryView query={s.results} className="p-pad">
              {(r) => <ResultsTable rows={r.rows} drivers={s.driverMap} kind={kind} selected={selected} onSelect={selectDriver} className="min-h-0 flex-1" />}
            </QueryView>
          ) : (
            <EmptyState title="No results" />
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-gap xl:grid-cols-12">
        <Panel title="Lap times" subtitle={selected ? 'Top three and the selected driver' : 'Top three finishers'} className="xl:col-span-6">
          {s.laps.data && s.results.data ? <LapsPanel s={s} selected={selected} /> : <Skeleton className="h-52" />}
        </Panel>
        <Panel title="Race control" subtitle="Official messages up to the replay time" className="xl:col-span-3" bodyClassName="flex max-h-[330px] min-h-0 flex-col">
          {s.raceControl.data ? <RaceControlFeed rows={s.raceControl.data.rows} drivers={s.driverMap} limit={40} /> : <Skeleton className="h-40" />}
        </Panel>
        <Panel
          title="Headlines"
          subtitle="Public RSS feeds"
          icon={<Newspaper />}
          className="xl:col-span-3"
          actions={
            <Button size="xs" variant="ghost" icon={<ArrowRight />} onClick={() => navigate('intel')}>
              All
            </Button>
          }
        >
          <Headlines />
        </Panel>
      </div>
    </Page>
  );
}

function Preparing({ name }: { name: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <LoaderCircle className="size-5 animate-spin text-fg-3" />
      <p className="text-[13px] font-medium">Preparing {name}</p>
      <p className="max-w-sm text-[12px] text-fg-3">First load downloads and processes the session with FastF1 (up to about a minute). Later loads come from the local cache.</p>
    </div>
  );
}

type S = ReturnType<typeof useReplaySession>;

function KeyStats({ s, pitCount, kind }: { s: S; pitCount?: number; kind: string }) {
  const rows = s.results.data?.rows;
  const winner = rows?.[0];
  const pole = kind === 'race' ? rows?.find((r) => r.grid === 1) : undefined;
  const fastest = useMemo(() => {
    let best: { d: string; t: number; lap: number } | null = null;
    for (const l of s.laps.data?.rows ?? []) if (l.lap_time != null && !l.deleted && (!best || l.lap_time < best.t)) best = { d: l.driver_number, t: l.lap_time, lap: l.lap ?? 0 };
    return best;
  }, [s.laps.data]);
  const sc = useMemo(() => {
    const st = s.trackStatus.data?.rows ?? [];
    return { sc: st.filter((r) => r.status === '4').length, vsc: st.filter((r) => r.status === '6').length, red: st.filter((r) => r.status === '5').length };
  }, [s.trackStatus.data]);
  const w = s.weather.data?.rows ?? [];
  const air = w.length ? mean(w.map((r) => r.air_temp ?? NaN).filter(Number.isFinite)) : null;
  const track = w.length ? mean(w.map((r) => r.track_temp ?? NaN).filter(Number.isFinite)) : null;
  const rain = w.some((r) => r.rainfall);
  const chip = (d?: Driver, n?: string) => (n ? <DriverChip driver={d} number={n} variant="name" className="text-[14px]" /> : <Skeleton className="mt-1 h-5 w-24" />);

  return (
    <div className="grid grid-cols-2 gap-gap sm:grid-cols-3 xl:grid-cols-6">
      <Stat label={kind === 'race' ? 'Winner' : 'Fastest driver'} icon={<Trophy />} accent={winner ? s.driverMap.get(winner.driver_number)?.team_color : undefined} value={chip(winner && s.driverMap.get(winner.driver_number), winner?.driver_number)} sub={winner?.status ?? '—'} />
      <Stat
        label={kind === 'race' ? 'Pole / P1 on grid' : 'P2'}
        icon={<Flag />}
        value={kind === 'race' ? chip(pole && s.driverMap.get(pole.driver_number), pole?.driver_number) : chip(rows?.[1] && s.driverMap.get(rows[1].driver_number), rows?.[1]?.driver_number)}
        sub={kind === 'race' ? 'Starting grid (FastF1)' : 'Session classification'}
      />
      <Stat label="Fastest lap" icon={<Timer />} value={fastest ? <span className="text-purple">{formatLapTime(fastest.t)}</span> : '—'} sub={fastest ? `${s.driverMap.get(fastest.d)?.abbreviation ?? fastest.d} · lap ${fastest.lap} · calculated` : 'No timed lap'} />
      <Stat label="Interruptions" icon={<ShieldAlert />} value={s.trackStatus.data ? `${sc.sc} SC · ${sc.vsc} VSC` : '—'} sub={s.trackStatus.data ? `${sc.red} red flag${sc.red === 1 ? '' : 's'} · track-status feed` : 'Loading'} />
      <Stat label="Pit stops" icon={<Wrench />} value={pitCount ?? '—'} sub={kind === 'race' ? 'Recorded pit entries' : 'Pit entries in session'} />
      <Stat
        label="Weather"
        icon={rain ? <CloudRain /> : <Thermometer />}
        value={air != null && Number.isFinite(air) ? `${air.toFixed(1)}°C` : '—'}
        sub={track != null && Number.isFinite(track) ? `Track ${track.toFixed(1)}°C avg${rain ? ' · rain recorded' : ''}` : 'No observations'}
      />
    </div>
  );
}

function LapsPanel({ s, selected }: { s: S; selected: string | null }) {
  const drivers = useMemo(() => {
    const top = (s.results.data?.rows ?? []).slice(0, 3).map((r) => r.driver_number);
    if (selected && !top.includes(selected)) top.push(selected);
    return top.map((n) => s.driverMap.get(n)).filter((d): d is Driver => !!d);
  }, [s.results.data, s.driverMap, selected]);
  return <SessionLapChart laps={s.laps.data!.rows} drivers={drivers} markLap={s.timing.lap} />;
}

function Headlines() {
  const q = useQuery('api:news', () => api.news());
  return (
    <QueryView query={q}>
      {(n) =>
        n.items.length === 0 ? (
          <EmptyState title="No headlines" description="All feeds are unavailable right now." />
        ) : (
          <ul className="-my-1 flex flex-col divide-y divide-line">
            {n.items.slice(0, 5).map((a) => (
              <li key={a.id}>
                <a href={a.link} target="_blank" rel="noreferrer" className="group flex flex-col gap-0.5 py-2">
                  <span className="line-clamp-2 text-[12.5px] leading-snug font-medium text-fg group-hover:underline">{a.title}</span>
                  <span className="flex items-center gap-1 text-[11px] text-fg-3">
                    {a.source}
                    {a.published && ` · ${new Date(a.published).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                    <ExternalLink className="size-3" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )
      }
    </QueryView>
  );
}
