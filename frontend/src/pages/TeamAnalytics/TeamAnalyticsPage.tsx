import { useMemo, useState } from 'react';
import { ArrowLeftRight, Info } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useQuery } from '@/hooks/useQuery';
import { useSessionData, useSessionDataset } from '@/hooks/useSessionData';
import { api } from '@/services/api/client';
import type { Lap, PitStop, SeasonRace, Standings } from '@/services/api/types';
import { isClassified } from '@/services/seasonStats';
import { selectYear, useHistoricalContext } from '@/state/historical';
import { median } from '@/utils/math';
import { axisProps, CHART, ChartLegend, ChartTooltip, gridProps } from '@/components/charts/theme';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Panel } from '@/components/ui/Panel';
import { Select } from '@/components/ui/Select';
import { SourceBadge } from '@/components/ui/SourceBadge';
import { EmptyState, LoadingBlock, QueryView } from '@/components/ui/States';
import { Notice, Page, PageHeader } from '@/components/layout/Page';

const FALLBACK = '#8b8f99';

interface TeamRow {
  id: string;
  name: string;
  color: string;
  officialColor: boolean;
  position: number | null;
  points: number;
  wins: number;
  podiums: number;
  starts: number;
  notClassified: number;
  avgFinish: number | null;
  avgGrid: number | null;
  doublePoints: number;
  drivers: string[];
}

function teamRows(races: SeasonRace[], standings: Standings | undefined, colors: Record<string, string>): TeamRow[] {
  const map = new Map<string, TeamRow & { finishes: number[]; grids: number[] }>();
  for (const race of races) {
    const scored = new Map<string, number>();
    for (const r of [...race.results, ...race.sprint]) {
      const t = map.get(r.constructor_id) ?? { id: r.constructor_id, name: r.constructor, color: colors[r.constructor_id] ?? FALLBACK, officialColor: !!colors[r.constructor_id], position: null, points: 0, wins: 0, podiums: 0, starts: 0, notClassified: 0, avgFinish: null, avgGrid: null, doublePoints: 0, drivers: [], finishes: [], grids: [] };
      t.points += r.points;
      if (!t.drivers.includes(r.code ?? r.family_name)) t.drivers.push(r.code ?? r.family_name);
      map.set(r.constructor_id, t);
    }
    for (const r of race.results) {
      const t = map.get(r.constructor_id)!;
      t.starts++;
      if (isClassified(r)) {
        t.finishes.push(r.position);
        if (r.position === 1) t.wins++;
        if (r.position <= 3) t.podiums++;
      } else t.notClassified++;
      if (r.grid && r.grid > 0) t.grids.push(r.grid);
      if (r.points > 0) scored.set(r.constructor_id, (scored.get(r.constructor_id) ?? 0) + 1);
    }
    for (const [id, n] of scored) if (n >= 2) map.get(id)!.doublePoints++;
  }
  const pos = new Map(standings?.constructors.map((c) => [c.constructor_id, c.position]) ?? []);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  return [...map.values()]
    .map(({ finishes, grids, ...t }) => ({ ...t, position: pos.get(t.id) ?? null, avgFinish: avg(finishes), avgGrid: avg(grids) }))
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || b.points - a.points);
}

export default function TeamAnalyticsPage() {
  const ctx = useHistoricalContext();
  const year = ctx.year;
  const results = useQuery(year ? `api:season-results:${year}` : null, () => api.seasonResults(year!));
  const standings = useQuery(year ? `api:standings:${year}` : null, () => api.standings(year!));
  const colors = useQuery(year ? `api:team-colors:${year}` : null, () => api.teamColors(year!));
  const seasons = ctx.seasons.data?.seasons ?? [];

  return (
    <Page>
      <PageHeader
        title="Team Analytics"
        meta={<SourceBadge source={results.data?.source} />}
        description="Constructor results, standings, reliability and pace from historical records. Figures are calculated from those records unless marked official."
        actions={year && <Select label="Season" value={year} onChange={selectYear} className="w-[96px]" options={seasons.map((s) => ({ value: s, label: String(s), text: String(s) }))} />}
      />
      <QueryView query={results} loading={<LoadingBlock rows={10} />}>
        {(r) => (r.races.length ? <Body races={r.races} standings={standings.data} colors={colors.data?.colors ?? {}} colorsFrom={colors.data?.from ?? null} ctx={ctx} /> : <EmptyState title="No results for this season yet" />)}
      </QueryView>
    </Page>
  );
}

function Body({ races, standings, colors, colorsFrom, ctx }: { races: SeasonRace[]; standings?: Standings; colors: Record<string, string>; colorsFrom: string | null; ctx: ReturnType<typeof useHistoricalContext> }) {
  const rows = useMemo(() => teamRows(races, standings, colors), [races, standings, colors]);
  const [open, setOpen] = useState<string | null>(null);
  const cols: Column<TeamRow>[] = [
    { key: 'pos', header: 'Pos', align: 'right', sortValue: (r) => r.position, render: (r) => <span className="num font-semibold">{r.position ?? '—'}</span> },
    {
      key: 'team',
      header: 'Team',
      sortValue: (r) => r.name,
      render: (r) => (
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-[2px]" style={{ background: r.color }} title={r.officialColor ? undefined : 'Fallback colour'} />
          {r.name}
          <span className="text-fg-3 max-lg:hidden">{r.drivers.join(' · ')}</span>
        </span>
      ),
    },
    { key: 'pts', header: 'Pts', align: 'right', title: 'Sum of GP + sprint points (calculated)', sortValue: (r) => -r.points, render: (r) => <span className="num font-medium">{r.points}</span> },
    { key: 'wins', header: 'Wins', align: 'right', sortValue: (r) => -r.wins, render: (r) => <span className="num">{r.wins}</span> },
    { key: 'pod', header: 'Podiums', align: 'right', hideBelow: 'sm', sortValue: (r) => -r.podiums, render: (r) => <span className="num">{r.podiums}</span> },
    { key: 'grid', header: 'Avg grid', align: 'right', hideBelow: 'md', sortValue: (r) => r.avgGrid, render: (r) => <span className="num text-fg-2">{r.avgGrid?.toFixed(1) ?? '—'}</span> },
    { key: 'fin', header: 'Avg finish', align: 'right', hideBelow: 'md', sortValue: (r) => r.avgFinish, render: (r) => <span className="num text-fg-2">{r.avgFinish?.toFixed(1) ?? '—'}</span> },
    { key: 'nc', header: 'Not classified', align: 'right', hideBelow: 'lg', sortValue: (r) => r.notClassified, render: (r) => <span className="num text-fg-2">{r.notClassified}/{r.starts}</span> },
    { key: 'dbl', header: 'Both scored', align: 'right', hideBelow: 'xl', sortValue: (r) => -r.doublePoints, render: (r) => <span className="num text-fg-2">{r.doublePoints}</span> },
  ];

  return (
    <>
      <Notice icon={<Info />} tone="info">
        Points, averages and counts are calculated from Jolpica-F1 race and sprint results. Championship positions are the official standings{standings?.round ? ` after round ${standings.round}` : ''}. Team colours come from the F1 driver list{colorsFrom ? ` (${colorsFrom})` : ''}; a grey swatch marks a fallback.
      </Notice>
      <div className="grid grid-cols-1 gap-gap xl:grid-cols-12">
        <Panel title="Team comparison" subtitle={`${races.length} Grands Prix · click a team for a head-to-head`} flush className="xl:col-span-8">
          <DataTable label="Team comparison" rows={rows} columns={cols} rowKey={(r) => r.id} onRowClick={(r) => setOpen(r.id)} defaultSort={{ key: 'pos', dir: 'asc' }} />
        </Panel>
        <Panel title="Constructors' standings" subtitle="Official · Jolpica-F1" className="xl:col-span-4">
          {standings ? (
            <ol className="flex flex-col">
              {standings.constructors.map((c) => (
                <li key={c.constructor_id} className="grid h-row grid-cols-[22px_1fr_auto_44px] items-center gap-2 border-b border-line/60 text-[12px] last:border-b-0">
                  <span className="num text-right font-semibold">{c.position ?? '—'}</span>
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 rounded-[2px]" style={{ background: colors[c.constructor_id] ?? FALLBACK }} />
                    {c.name}
                  </span>
                  <span className="num text-[11px] text-fg-3">{c.wins ? `${c.wins}W` : ''}</span>
                  <span className="num text-right font-medium">{c.points}</span>
                </li>
              ))}
            </ol>
          ) : (
            <LoadingBlock rows={6} />
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-gap xl:grid-cols-2">
        <Panel title="Points progression" subtitle="Cumulative GP + sprint points (calculated)">
          <Progression races={races} teams={rows} metric="points" />
        </Panel>
        <Panel title="Development trend" subtitle="Best classified finish per team, race by race · lower is better">
          <Progression races={races} teams={rows} metric="best" />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-gap md:grid-cols-2 xl:grid-cols-4">
        <Panel title="Qualifying pace" subtitle="Average grid slot (season)">
          <TeamBars data={rows.filter((r) => r.avgGrid != null).map((r) => ({ name: r.name, color: r.color, value: r.avgGrid! }))} format={(v) => `P${v.toFixed(1)}`} label="Avg grid" />
        </Panel>
        <SessionPace ctx={ctx} />
        <SessionPits ctx={ctx} />
        <Panel title="Reliability" subtitle="Non-classified results by recorded status">
          <Reliability races={races} teams={rows} />
        </Panel>
      </div>

      <TeamModal open={open} onClose={() => setOpen(null)} races={races} teams={rows} />
    </>
  );
}

function Progression({ races, teams, metric }: { races: SeasonRace[]; teams: TeamRow[]; metric: 'points' | 'best' }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const data = useMemo(() => {
    const acc: Record<string, number> = {};
    return races.map((race) => {
      const row: Record<string, number | string | null> = { label: `R${race.round}`, race: race.name };
      for (const t of teams) {
        if (metric === 'points') {
          acc[t.id] = (acc[t.id] ?? 0) + [...race.results, ...race.sprint].filter((r) => r.constructor_id === t.id).reduce((s, r) => s + r.points, 0);
          row[t.id] = acc[t.id];
        } else {
          const fin = race.results.filter((r) => r.constructor_id === t.id && isClassified(r)).map((r) => r.position);
          row[t.id] = fin.length ? Math.min(...fin) : null;
        }
      }
      return row;
    });
  }, [races, teams, metric]);
  return (
    <div>
      <ChartLegend
        className="mb-2"
        items={teams.map((t) => ({ id: t.id, label: t.name, color: t.color }))}
        hidden={hidden}
        onToggle={(id) => setHidden((h) => { const n = new Set(h); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
      />
      <div style={{ height: 240 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="label" interval="preserveStartEnd" minTickGap={10} />
            <YAxis {...axisProps} width={40} reversed={metric === 'best'} domain={metric === 'best' ? [1, 20] : [0, 'auto']} tickFormatter={(v) => (metric === 'best' ? `P${v}` : String(v))} />
            <Tooltip
              cursor={{ stroke: CHART.cursor }}
              content={<ChartTooltip title={(_, p) => String((p[0]?.payload as { race?: string } | undefined)?.race ?? '')} format={(v) => (metric === 'best' ? `P${v}` : `${v} pts`)} name={(p) => teams.find((t) => t.id === p.dataKey)?.name ?? ''} sort={metric === 'best' ? 'asc' : 'desc'} />}
            />
            {teams.map((t) => (
              <Line key={t.id} dataKey={t.id} hide={hidden.has(t.id)} stroke={t.color} strokeWidth={1.75} dot={false} isAnimationActive={false} connectNulls={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TeamBars({ data, format, label, lowerIsBetter = true }: { data: { name: string; color: string; value: number }[]; format: (v: number) => string; label: string; lowerIsBetter?: boolean }) {
  const sorted = [...data].sort((a, b) => (lowerIsBetter ? a.value - b.value : b.value - a.value));
  if (!sorted.length) return <EmptyState title="No data" className="py-6" />;
  return (
    <div style={{ height: 250 }}>
      <ResponsiveContainer>
        <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap={4}>
          <CartesianGrid {...gridProps} horizontal={false} vertical />
          <XAxis {...axisProps} type="number" tickFormatter={format} domain={[0, 'auto']} />
          <YAxis {...axisProps} type="category" dataKey="name" width={92} interval={0} tick={{ ...axisProps.tick, fontSize: 10 }} />
          <Tooltip cursor={{ fill: 'rgb(255 255 255 / 0.03)' }} content={<ChartTooltip format={format} name={() => label} />} />
          <Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={14} isAnimationActive={false}>
            {sorted.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function useTeamColorByName(session: ReturnType<typeof useSessionData>) {
  return useMemo(() => new Map((session.drivers.data?.rows ?? []).map((d) => [d.team_name ?? '', d.team_color])), [session.drivers.data]);
}

/** Median clean-lap time per team in the selected session (calculated from FastF1 laps). */
function SessionPace({ ctx }: { ctx: ReturnType<typeof useHistoricalContext> }) {
  const session = useSessionData(ctx.session?.replay_available ? ctx.session.id : null);
  const teamColor = useTeamColorByName(session);
  const data = useMemo(() => {
    const byTeam = new Map<string, number[]>();
    for (const l of session.laps.data?.rows ?? []) {
      if (!isClean(l)) continue;
      const team = session.driverMap.get(l.driver_number)?.team_name;
      if (team) (byTeam.get(team) ?? byTeam.set(team, []).get(team)!).push(l.lap_time!);
    }
    const meds = [...byTeam.entries()].map(([name, xs]) => ({ name, value: median(xs) }));
    const best = Math.min(...meds.map((m) => m.value));
    return meds.map((m) => ({ name: m.name, color: teamColor.get(m.name) ?? FALLBACK, value: +(((m.value - best) / best) * 100).toFixed(3) }));
  }, [session.laps.data, session.driverMap, teamColor]);
  return (
    <Panel title="Race pace" subtitle={`${ctx.meeting?.name ?? ''} ${ctx.session?.name ?? ''} · median clean lap, % off fastest`}>
      {session.laps.data ? <TeamBars data={data} format={(v) => `${v.toFixed(2)}%`} label="Off fastest team" /> : <QueryView query={session.info}>{() => <LoadingBlock rows={6} />}</QueryView>}
    </Panel>
  );
}

const isClean = (l: Lap) => l.lap_time != null && l.pit_in == null && l.pit_out == null && l.track_status === '1' && !l.deleted;

function SessionPits({ ctx }: { ctx: ReturnType<typeof useHistoricalContext> }) {
  const sid = ctx.session?.replay_available ? ctx.session.id : null;
  const session = useSessionData(sid);
  const pits = useSessionDataset(session.info.data ? sid : null, 'pit-stops', api.pitStops);
  const teamColor = useTeamColorByName(session);
  const stationary = (pits.data?.rows ?? []).some((p) => p.stop_duration != null);
  const data = useMemo(() => {
    const byTeam = new Map<string, number[]>();
    for (const p of (pits.data?.rows ?? []) as PitStop[]) {
      const v = stationary ? p.stop_duration : p.lane_duration;
      const team = session.driverMap.get(p.driver_number)?.team_name;
      if (v != null && team && v < 60) (byTeam.get(team) ?? byTeam.set(team, []).get(team)!).push(v);
    }
    return [...byTeam.entries()].map(([name, xs]) => ({ name, color: teamColor.get(name) ?? FALLBACK, value: +median(xs).toFixed(2) }));
  }, [pits.data, session.driverMap, teamColor, stationary]);
  return (
    <Panel title="Pit-stop performance" subtitle={`${ctx.session?.name ?? ''} · median ${stationary ? 'stationary' : 'pit-lane'} time`} actions={<SourceBadge source={pits.data?.source} />}>
      {pits.data ? data.length ? <TeamBars data={data} format={(v) => `${v.toFixed(1)}s`} label={stationary ? 'Stationary' : 'Pit lane'} /> : <EmptyState title="No pit stops recorded" className="py-6" /> : <LoadingBlock rows={6} />}
    </Panel>
  );
}

function Reliability({ races, teams }: { races: SeasonRace[]; teams: TeamRow[] }) {
  const data = teams.map((t) => ({ name: t.name, color: t.color, value: races.reduce((n, r) => n + r.results.filter((x) => x.constructor_id === t.id && !isClassified(x)).length, 0) }));
  return <TeamBars data={data} format={(v) => `${v}`} label="Not classified" />;
}

function TeamModal({ open, onClose, races, teams }: { open: string | null; onClose: () => void; races: SeasonRace[]; teams: TeamRow[] }) {
  const a = teams.find((t) => t.id === open);
  const [rivalPick, setRival] = useState<string | null>(null);
  const rival = teams.find((t) => t.id === rivalPick && t.id !== open) ?? teams.find((t) => t.id !== open);
  if (!a || !rival) return <Modal open={false} onClose={onClose} title="Team comparison"><span /></Modal>;
  const metrics: [string, number | null, number | null, boolean][] = [
    ['Points (calculated)', a.points, rival.points, false],
    ['Wins', a.wins, rival.wins, false],
    ['Podiums', a.podiums, rival.podiums, false],
    ['Average grid', a.avgGrid, rival.avgGrid, true],
    ['Average finish', a.avgFinish, rival.avgFinish, true],
    ['Not classified', a.notClassified, rival.notClassified, true],
    ['Both cars scored', a.doublePoints, rival.doublePoints, false],
  ];
  const trend = races.map((race) => {
    const best = (id: string) => {
      const f = race.results.filter((r) => r.constructor_id === id && isClassified(r)).map((r) => r.position);
      return f.length ? Math.min(...f) : null;
    };
    return { label: `R${race.round}`, race: race.name, a: best(a.id), b: best(rival.id) };
  });
  return (
    <Modal open={!!open} onClose={onClose} title="Team comparison" width={760}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="flex items-center gap-2 font-medium">
            <span className="size-2.5 rounded-[2px]" style={{ background: a.color }} />
            {a.name}
          </span>
          <ArrowLeftRight className="size-3.5 text-fg-3" />
          <Select label="Rival" value={rival.id} onChange={setRival} className="w-[220px]" options={teams.filter((t) => t.id !== a.id).map((t) => ({ value: t.id, label: t.name, text: t.name }))} />
        </div>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[11px] text-fg-3">
              <th className="h-7 text-left font-medium">Metric</th>
              <th className="text-right font-medium">{a.name}</th>
              <th className="text-right font-medium">{rival.name}</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map(([k, x, y, lower]) => (
              <tr key={k} className="h-7 border-t border-line/70">
                <td className="text-fg-2">{k}</td>
                {[x, y].map((v, i) => {
                  const other = i === 0 ? y : x;
                  const better = v != null && other != null && (lower ? v < other : v > other);
                  return (
                    <td key={i} className={`num text-right ${better ? 'font-semibold text-fg' : 'text-fg-3'}`}>
                      {v == null ? '—' : Number.isInteger(v) ? v : v.toFixed(1)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div>
          <ChartLegend className="mb-1" items={[{ id: 'a', label: a.name, color: a.color }, { id: 'b', label: rival.name, color: rival.color, dashed: true }]} />
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={trend} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid {...gridProps} />
                <XAxis {...axisProps} dataKey="label" interval="preserveStartEnd" minTickGap={8} />
                <YAxis {...axisProps} reversed domain={[1, 20]} ticks={[1, 5, 10, 15, 20]} tickFormatter={(v) => `P${v}`} />
                <Tooltip cursor={{ stroke: CHART.cursor }} content={<ChartTooltip title={(_, p) => String((p[0]?.payload as { race?: string } | undefined)?.race ?? '')} format={(v) => `P${v}`} name={(p) => (p.dataKey === 'a' ? a.name : rival.name)} sort="asc" />} />
                <Line dataKey="a" stroke={a.color} strokeWidth={2} dot={{ r: 2.5, strokeWidth: 0, fill: a.color }} isAnimationActive={false} connectNulls={false} />
                <Line dataKey="b" stroke={rival.color} strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10.5px] text-fg-3">Best classified finish of either car each round (calculated from Jolpica-F1 results).</p>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
