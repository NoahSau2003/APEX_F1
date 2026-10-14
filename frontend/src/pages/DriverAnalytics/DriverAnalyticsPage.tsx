import { useMemo, useState } from 'react';
import { Award, Flag, Gauge, Info, TrendingUp, Trophy, UserRound } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { useQuery } from '@/hooks/useQuery';
import { useSessionData } from '@/hooks/useSessionData';
import { api } from '@/services/api/client';
import type { Driver, Lap, SeasonRace } from '@/services/api/types';
import { driverRows, seasonDrivers, summarise, teammateOf, type DriverRaceRow } from '@/services/seasonStats';
import { selectYear, useHistoricalContext } from '@/state/historical';
import { formatLapTime } from '@/utils/format';
import { median, stdDev } from '@/utils/math';
import { axisProps, CHART, ChartLegend, ChartTooltip, gridProps } from '@/components/charts/theme';
import { SessionLapChart } from '@/components/charts/SessionLapChart';
import { Badge } from '@/components/ui/Badge';
import { Panel } from '@/components/ui/Panel';
import { TyreBadge } from '@/components/ui/Racing';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { SourceBadge } from '@/components/ui/SourceBadge';
import { Stat } from '@/components/ui/Stat';
import { EmptyState, LoadingBlock, QueryView } from '@/components/ui/States';
import { Notice, Page, PageHeader } from '@/components/layout/Page';

const FALLBACK = '#8b8f99';

export default function DriverAnalyticsPage() {
  const ctx = useHistoricalContext();
  const year = ctx.year;
  const results = useQuery(year ? `api:season-results:${year}` : null, () => api.seasonResults(year!));
  const colors = useQuery(year ? `api:team-colors:${year}` : null, () => api.teamColors(year!));
  const session = useSessionData(ctx.session?.replay_available ? ctx.session.id : null);
  const sessionDriver = ctx.driver ? session.driverMap.get(ctx.driver) : undefined;
  const [picked, setPicked] = useState<string | null>(null);
  const [circuit, setCircuit] = useState<string>('all');
  const [kind, setKind] = useState<'race' | 'sprint'>('race');
  const seasons = ctx.seasons.data?.seasons ?? [];

  const drivers = useMemo(() => (results.data ? seasonDrivers(results.data.races) : []), [results.data]);
  const driverId = (picked && drivers.some((d) => d.driverId === picked) ? picked : null) ?? (sessionDriver?.driver_id && drivers.some((d) => d.driverId === sessionDriver.driver_id) ? sessionDriver.driver_id : null) ?? drivers[0]?.driverId ?? null;

  return (
    <Page>
      <PageHeader
        title="Driver Analytics"
        meta={<SourceBadge source={results.data?.source} />}
        description="Season results and lap-by-lap pace from historical records. All statistics below are calculated from those records."
        actions={
          <>
            {year && <Select label="Season" value={year} onChange={selectYear} className="w-[96px]" options={seasons.map((s) => ({ value: s, label: String(s), text: String(s) }))} />}
            <Select
              label="Driver"
              value={driverId ?? ''}
              onChange={setPicked}
              className="w-[220px]"
              menuClassName="w-[260px]"
              options={drivers.length ? drivers.map((d) => ({ value: d.driverId, text: `${d.code ?? ''} ${d.name}`, label: <span className="flex items-center gap-2"><span className="font-mono text-[11.5px] font-semibold">{d.code}</span>{d.name}</span>, hint: d.constructors.map((c) => c.name).join(' / ') })) : [{ value: '', label: 'Loading…', text: '' }]}
            />
            <Select
              label="Circuit"
              value={circuit}
              onChange={setCircuit}
              className="w-[180px]"
              options={[{ value: 'all', label: 'All rounds', text: 'All rounds' }, ...(results.data?.races ?? []).map((r) => ({ value: String(r.round), label: `R${r.round} · ${r.name.replace(' Grand Prix', '')}`, text: r.name }))]}
            />
            <Segmented label="Session" value={kind} onChange={setKind} options={[{ value: 'race', label: 'Race' }, { value: 'sprint', label: 'Sprint' }]} />
          </>
        }
      />
      <QueryView query={results} loading={<LoadingBlock rows={10} />}>
        {(r) =>
          driverId ? (
            <Body races={r.races} driverId={driverId} circuit={circuit} kind={kind} colors={colors.data?.colors ?? {}} session={session} sessionDriverNumber={session.drivers.data?.rows.find((d) => d.driver_id === driverId)?.driver_number ?? null} />
          ) : (
            <EmptyState title="No results for this season yet" />
          )
        }
      </QueryView>
    </Page>
  );
}

function Body({
  races: all,
  driverId,
  circuit,
  kind,
  colors,
  session,
  sessionDriverNumber,
}: {
  races: SeasonRace[];
  driverId: string;
  circuit: string;
  kind: 'race' | 'sprint';
  colors: Record<string, string>;
  session: ReturnType<typeof useSessionData>;
  sessionDriverNumber: string | null;
}) {
  const races = useMemo(() => {
    const base = kind === 'sprint' ? all.filter((r) => r.sprint.length).map((r) => ({ ...r, results: r.sprint, sprint: [] })) : all;
    return circuit === 'all' ? base : base.filter((r) => String(r.round) === circuit);
  }, [all, circuit, kind]);
  const mateId = useMemo(() => teammateOf(all, driverId), [all, driverId]);
  const rows = useMemo(() => driverRows(races, driverId), [races, driverId]);
  const mateRows = useMemo(() => (mateId ? driverRows(races, mateId) : []), [races, mateId]);
  const st = summarise(rows);
  const info = seasonDrivers(all).find((d) => d.driverId === driverId)!;
  const mate = mateId ? seasonDrivers(all).find((d) => d.driverId === mateId) : undefined;
  const color = colors[info.constructors[info.constructors.length - 1]?.id] ?? FALLBACK;

  if (!rows.length) return <EmptyState title="No starts match these filters" description={kind === 'sprint' ? 'This driver has no sprint results in the selection.' : undefined} />;

  return (
    <>
      <section className="relative flex flex-wrap items-center gap-x-6 gap-y-2 overflow-hidden rounded-lg border border-line bg-surface p-pad">
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-lg border border-line-strong bg-surface-2 font-mono text-[15px] font-semibold">{info.number ?? '—'}</div>
          <div>
            <div className="text-[16px] font-semibold tracking-tight">{info.name}</div>
            <div className="text-[12px] text-fg-3">
              {info.code} · {info.constructors.map((c) => c.name).join(' / ')}
            </div>
          </div>
        </div>
        <div className="text-[12px] text-fg-3">
          Team-mate {mate ? <span className="text-fg-2">{mate.name}</span> : '—'} · {rows.length} {kind === 'sprint' ? 'sprint' : 'race'}
          {rows.length === 1 ? '' : 's'} in view
          {!colors[info.constructors[info.constructors.length - 1]?.id] && <Badge className="ml-2" tone="neutral" title="No official team colour found for this constructor">fallback colour</Badge>}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-gap sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Points" icon={<Trophy />} value={st.points} sub={kind === 'race' ? 'Grand Prix + sprint points' : 'Sprint points'} accent={color} />
        <Stat label="Wins · podiums" icon={<Award />} value={`${st.wins} · ${st.podiums}`} sub={`${st.starts} starts`} />
        <Stat label="P1 on grid" icon={<Flag />} value={st.poles} sub={st.avgGrid != null ? `Avg grid P${st.avgGrid.toFixed(1)}` : '—'} />
        <Stat label="Avg finish" icon={<TrendingUp />} value={st.avgFinish != null ? `P${st.avgFinish.toFixed(1)}` : '—'} sub={`${st.notClassified} not classified`} />
        <Stat label="Places gained" icon={<UserRound />} value={st.gained > 0 ? `+${st.gained}` : st.gained} sub="Grid → finish, classified" />
        <Stat label="Fastest laps" icon={<Gauge />} value={st.fastestLaps} sub="Rank 1 fastest lap" />
      </div>
      <Notice icon={<Info />} tone="info">
        Calculated from Jolpica-F1 results: points = Grand Prix + sprint points (may differ from official standings if penalties or adjustments applied); classified = numeric finishing position; places gained = grid − finish for classified finishes with a grid slot.
      </Notice>

      <div className="grid grid-cols-1 gap-gap xl:grid-cols-12">
        <Panel title="Finishing positions" subtitle={`${info.code} vs ${mate?.name ?? 'team-mate'} · gaps = not classified`} className="xl:col-span-7">
          <FinishHistory rows={rows} mateRows={mateRows} color={color} code={info.code ?? ''} mateCode={mate?.code ?? ''} />
        </Panel>
        <Panel title="Qualifying vs race" subtitle="Grid slot vs finish, one dot per race · above the line = places gained" className="xl:col-span-5">
          <GridVsFinish rows={rows} color={color} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-gap xl:grid-cols-12">
        <Panel title="Positions gained / lost" subtitle="Grid minus finish (classified only)" className="xl:col-span-5">
          <Gains rows={rows} />
        </Panel>
        <Panel title="Points progression" subtitle="Cumulative, vs team-mate" className="xl:col-span-7">
          <PointsProgression rows={rows} mateRows={mateRows} color={color} code={info.code ?? ''} mateCode={mate?.code ?? ''} />
        </Panel>
      </div>

      <SessionAnalysis session={session} driverNumber={sessionDriverNumber} />
    </>
  );
}

function FinishHistory({ rows, mateRows, color, code, mateCode }: { rows: DriverRaceRow[]; mateRows: DriverRaceRow[]; color: string; code: string; mateCode: string }) {
  const byRound = new Map(mateRows.map((r) => [r.round, r]));
  const data = rows.map((r) => ({ label: r.label, race: r.race, a: r.finish, b: byRound.get(r.round)?.finish ?? null }));
  return (
    <div>
      <ChartLegend className="mb-2" items={[{ id: 'a', label: code, color }, { id: 'b', label: mateCode || 'Team-mate', color: '#e6e6e8', dashed: true }]} />
      <div style={{ height: 220 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="label" interval="preserveStartEnd" minTickGap={8} />
            <YAxis {...axisProps} reversed domain={[1, 20]} ticks={[1, 5, 10, 15, 20]} tickFormatter={(v) => `P${v}`} />
            <Tooltip cursor={{ stroke: CHART.cursor }} content={<ChartTooltip title={(_, p) => (p[0]?.payload as { race: string } | undefined)?.race ?? ''} format={(v) => `P${v}`} name={(p) => (p.dataKey === 'a' ? code : mateCode)} />} />
            <Line dataKey="a" stroke={color} strokeWidth={2} dot={{ r: 3, fill: color, strokeWidth: 0 }} isAnimationActive={false} connectNulls={false} />
            <Line dataKey="b" stroke="#e6e6e8" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function GridVsFinish({ rows, color }: { rows: DriverRaceRow[]; color: string }) {
  const data = rows.filter((r) => r.finish != null && r.grid != null).map((r) => ({ grid: r.grid!, finish: r.finish!, race: r.race }));
  if (!data.length) return <EmptyState title="No classified finishes from a grid slot" />;
  return (
    <div style={{ height: 248 }}>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 6, right: 12, bottom: 4, left: -16 }}>
          <CartesianGrid {...gridProps} vertical />
          <XAxis {...axisProps} type="number" dataKey="grid" domain={[1, 20]} ticks={[1, 5, 10, 15, 20]} tickFormatter={(v) => `P${v}`} />
          <YAxis {...axisProps} type="number" dataKey="finish" reversed domain={[1, 20]} ticks={[1, 5, 10, 15, 20]} tickFormatter={(v) => `P${v}`} />
          <ZAxis range={[70, 70]} />
          <ReferenceLine segment={[{ x: 1, y: 1 }, { x: 20, y: 20 }]} stroke={CHART.axisLine} strokeDasharray="4 4" />
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !p) return null;
              return <ChartTooltip active payload={[{ name: 'Grid → finish', value: p.finish, color }]} label={p.race} format={(v) => `P${p.grid} → P${v}`} />;
            }}
          />
          <Scatter data={data} fill={color} stroke={CHART.surface} strokeWidth={2} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function Gains({ rows }: { rows: DriverRaceRow[] }) {
  const data = rows.map((r) => ({ label: r.label, race: r.race, v: r.finish != null && r.grid != null ? r.grid - r.finish : null }));
  return (
    <div style={{ height: 230 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid {...gridProps} />
          <XAxis {...axisProps} dataKey="label" interval="preserveStartEnd" minTickGap={8} />
          <YAxis {...axisProps} allowDecimals={false} />
          <ReferenceLine y={0} stroke={CHART.axisLine} />
          <Tooltip cursor={{ fill: 'rgb(255 255 255 / 0.03)' }} content={<ChartTooltip title={(_, p) => (p[0]?.payload as { race: string } | undefined)?.race ?? ''} format={(v) => (v > 0 ? `+${v} places` : v < 0 ? `${v} places` : 'No change')} name={() => 'Positions'} />} />
          <Bar dataKey="v" radius={[3, 3, 3, 3]} maxBarSize={16} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={(d.v ?? 0) >= 0 ? '#3fb37f' : '#e5484d'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PointsProgression({ rows, mateRows, color, code, mateCode }: { rows: DriverRaceRow[]; mateRows: DriverRaceRow[]; color: string; code: string; mateCode: string }) {
  const byRound = new Map(mateRows.map((r) => [r.round, r]));
  let a = 0;
  let b = 0;
  const data = rows.map((r) => {
    a += r.points + r.sprintPoints;
    const m = byRound.get(r.round);
    b += m ? m.points + m.sprintPoints : 0;
    return { label: r.label, race: r.race, a, b };
  });
  return (
    <div>
      <ChartLegend className="mb-2" items={[{ id: 'a', label: code, color }, { id: 'b', label: mateCode || 'Team-mate', color: '#e6e6e8', dashed: true }]} />
      <div style={{ height: 200 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="label" interval="preserveStartEnd" minTickGap={10} />
            <YAxis {...axisProps} width={40} />
            <Tooltip cursor={{ stroke: CHART.cursor }} content={<ChartTooltip title={(_, p) => (p[0]?.payload as { race: string } | undefined)?.race ?? ''} format={(v) => `${v} pts`} name={(p) => (p.dataKey === 'a' ? code : mateCode)} sort="desc" />} />
            <Line dataKey="a" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="b" stroke="#e6e6e8" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Lap-time analysis for the selected historical session (FastF1 laps). */
function SessionAnalysis({ session, driverNumber }: { session: ReturnType<typeof useSessionData>; driverNumber: string | null }) {
  const info = session.info.data;
  const d = driverNumber ? session.driverMap.get(driverNumber) : undefined;
  const mate = d ? session.drivers.data?.rows.find((x) => x.team_name === d.team_name && x.driver_number !== d.driver_number) : undefined;
  const laps = session.laps.data?.rows ?? [];
  const title = info ? `${info.year} ${info.meeting_name} · ${info.session_name}` : 'Selected session';
  if (!info) return <Panel title="Session lap analysis" subtitle={title}><QueryView query={session.info}>{() => null}</QueryView></Panel>;
  if (!d) return <Panel title="Session lap analysis" subtitle={title}><EmptyState title="Driver did not take part in this session" description="Choose another session in the top bar." /></Panel>;
  return (
    <div className="grid grid-cols-1 gap-gap xl:grid-cols-12">
      <Panel title="Lap-time progression" subtitle={`${title} · vs team-mate`} className="xl:col-span-8" actions={<SourceBadge source={session.laps.data?.source} cache={session.laps.data?.cache} />}>
        <SessionLapChart laps={laps} drivers={[d, ...(mate ? [mate] : [])]} height={240} />
      </Panel>
      <Panel title="Consistency & stints" subtitle="Calculated from clean laps" className="xl:col-span-4">
        <Consistency laps={laps} driver={d} />
      </Panel>
    </div>
  );
}

function Consistency({ laps, driver }: { laps: Lap[]; driver: Driver }) {
  const own = laps.filter((l) => l.driver_number === driver.driver_number && l.lap_time != null);
  const clean = own.filter((l) => l.pit_in == null && l.pit_out == null && l.track_status === '1' && !l.deleted).map((l) => l.lap_time!);
  const med = median(clean);
  const core = clean.filter((t) => t < med * 1.03);
  const stints = new Map<number, Lap[]>();
  for (const l of own) if (l.stint != null) (stints.get(l.stint) ?? stints.set(l.stint, []).get(l.stint)!).push(l);
  if (!own.length) return <EmptyState title="No laps recorded" />;
  return (
    <div className="flex flex-col gap-3 text-[12px]">
      <div className="grid grid-cols-3 gap-2">
        {[
          ['Best', formatLapTime(Math.min(...own.map((l) => l.lap_time!)))],
          ['Median clean', clean.length ? formatLapTime(med) : '—'],
          ['Spread', core.length > 3 ? `${stdDev(core).toFixed(3)} s` : '—'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md border border-line bg-surface-2 px-2 py-1.5">
            <div className="label">{k}</div>
            <div className="num text-[13px] font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <p className="text-[10.5px] text-fg-3">Clean laps: green flag, no pit in/out, not deleted. Spread = standard deviation of clean laps within 3% of the median ({core.length} laps).</p>
      <ul className="flex flex-col gap-1">
        {[...stints.entries()].map(([n, ls]) => (
          <li key={n} className="flex items-center justify-between rounded border border-line bg-surface-2 px-2 py-1">
            <span className="flex items-center gap-2">
              <TyreBadge compound={ls[0].compound} />
              Stint {n}
            </span>
            <span className="num text-fg-3">
              L{ls[0].lap}–L{ls[ls.length - 1].lap} · {ls.length} laps
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
