import { useMemo, useState } from 'react';
import { Info, Play, Search } from 'lucide-react';
import { useQuery } from '@/hooks/useQuery';
import { useSessionData } from '@/hooks/useSessionData';
import { api } from '@/services/api/client';
import type { Driver, Meeting, SessionRef, Standings } from '@/services/api/types';
import { openSession, selectDriver, selectYear, useHistoricalContext } from '@/state/historical';
import { navigate } from '@/state/router';
import { formatDate } from '@/utils/format';
import { cn } from '@/utils/cn';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Select } from '@/components/ui/Select';
import { SourceBadge } from '@/components/ui/SourceBadge';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState, LoadingBlock, QueryView } from '@/components/ui/States';
import { PositionChart } from '@/components/charts/PositionChart';
import { SessionLapChart } from '@/components/charts/SessionLapChart';
import { Notice, Page, PageHeader } from '@/components/layout/Page';
import { ResultsTable } from '@/components/results/ResultsTable';

export default function RaceHistoryPage() {
  const ctx = useHistoricalContext();
  const [search, setSearch] = useState('');
  const seasons = ctx.seasons.data?.seasons ?? [];

  return (
    <Page>
      <PageHeader
        title="Race History"
        meta={<Badge tone="info">Historical records</Badge>}
        description="Browse every Grand Prix and session since 2018, inspect the published results and open a replay."
        actions={ctx.year && <Select label="Season" value={ctx.year} onChange={selectYear} className="w-[96px]" options={seasons.map((s) => ({ value: s, label: String(s), text: String(s) }))} />}
      />
      <Notice icon={<Info />} tone="info">
        Results and timing come from the Formula 1 live-timing archive via FastF1; season standings from Jolpica-F1. Values marked “calculated” are derived from those records. This is an unofficial tool; check official sources where it matters.
      </Notice>

      <div className="grid grid-cols-1 gap-gap xl:grid-cols-12">
        <Panel title="Grands Prix" subtitle={ctx.year ? `${ctx.year} season` : ''} flush className="xl:col-span-3" bodyClassName="flex min-h-0 flex-col">
          <div className="border-b border-line p-2">
            <label className="relative flex h-7 items-center">
              <Search className="pointer-events-none absolute left-2 size-3.5 text-fg-3" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Grand Prix, country, circuit"
                aria-label="Search Grands Prix"
                className="h-full w-full rounded-md border border-line bg-surface-2 pr-2 pl-7 text-[12px] placeholder:text-fg-3 focus:border-line-strong focus:outline-none"
              />
            </label>
          </div>
          <QueryView query={ctx.meetings} className="p-pad">
            {(ms) => <MeetingList meetings={ms} search={search} selectedMeeting={ctx.meeting?.id} selectedSession={ctx.session?.id} />}
          </QueryView>
        </Panel>
        <div className="flex min-w-0 flex-col gap-gap xl:col-span-9">
          {ctx.meeting && ctx.session ? <SessionDetail meeting={ctx.meeting} session={ctx.session} driver={ctx.driver} /> : <LoadingBlock rows={8} />}
          {ctx.year && <SeasonStandings year={ctx.year} />}
        </div>
      </div>
    </Page>
  );
}

function MeetingList({ meetings, search, selectedMeeting, selectedSession }: { meetings: Meeting[]; search: string; selectedMeeting?: string; selectedSession?: string }) {
  const q = search.trim().toLowerCase();
  const rows = [...meetings].reverse().filter((m) => !q || `${m.name} ${m.official_name} ${m.country} ${m.location}`.toLowerCase().includes(q));
  if (!rows.length) return <EmptyState title="No Grands Prix match" description="Try a country or circuit name." />;
  return (
    <ul className="max-h-[720px] min-h-0 flex-1 overflow-auto py-1">
      {rows.map((m) => {
        const on = m.id === selectedMeeting;
        return (
          <li key={m.id} className={cn('border-b border-line/60 px-pad py-2 last:border-b-0', on && 'bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]')}>
            <div className="flex items-baseline gap-2">
              <span className="num w-6 text-[11px] text-fg-3">R{m.round}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{m.name.replace(' Grand Prix', ' GP')}</span>
              <span className="text-[11px] text-fg-3">{m.date ? formatDate(m.date.slice(0, 10), { day: 'numeric', month: 'short' }) : ''}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1 pl-8">
              {m.sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={!s.replay_available}
                  title={s.replay_available ? s.name : (s.unavailable_reason ?? 'Unavailable')}
                  onClick={() => openSession(m.year, m.id, s.id)}
                  className={cn(
                    'h-5 rounded border px-1.5 text-[10.5px] font-medium transition-colors disabled:opacity-35',
                    s.id === selectedSession ? 'border-accent bg-accent-soft text-fg' : 'border-line bg-surface-3 text-fg-2 hover:text-fg',
                  )}
                >
                  {s.code ?? s.name}
                </button>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function SessionDetail({ meeting, session, driver }: { meeting: Meeting; session: SessionRef; driver: string | null }) {
  const d = useSessionData(session.replay_available ? session.id : null);
  const [tab, setTab] = useState<'results' | 'positions' | 'laps'>('results');
  const selected = driver && d.driverMap.has(driver) ? driver : null;
  const drivers = useMemo(() => d.drivers.data?.rows ?? [], [d.drivers.data]);
  const lapDrivers = useMemo(() => {
    const top = (d.results.data?.rows ?? []).slice(0, 4).map((r) => r.driver_number);
    if (selected && !top.includes(selected)) top.push(selected);
    return top.map((n) => d.driverMap.get(n)).filter((x): x is Driver => !!x);
  }, [d.results.data, d.driverMap, selected]);

  return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-pad">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold tracking-tight">
              {meeting.year} {meeting.name} · {session.name}
            </h2>
            <Badge tone="neutral">Round {meeting.round}</Badge>
            {session.session_key ? <Badge tone="neutral" title="Official F1 / OpenF1 session key">key {session.session_key}</Badge> : <Badge tone="neutral" title="No official key published; addressed by FastF1 season/round/session">{session.id}</Badge>}
          </div>
          <p className="mt-0.5 text-[12px] text-fg-3">
            {meeting.official_name} · {meeting.location}, {meeting.country}
            {session.date_utc && ` · ${formatDate(session.date_utc.slice(0, 10))}`}
          </p>
        </div>
        <Button variant="primary" size="md" icon={<Play />} disabled={!session.replay_available} onClick={() => navigate('live')}>
          Open replay
        </Button>
      </section>

      {!session.replay_available ? (
        <EmptyState title="No data for this session" description={session.unavailable_reason ?? undefined} />
      ) : (
        <Panel flush bodyClassName="flex flex-col" actions={<SourceBadge source={d.results.data?.source} cache={d.results.data?.cache} />} title="Session data">
          <Tabs
            label="Session views"
            value={tab}
            onChange={setTab}
            className="px-pad"
            tabs={[
              { value: 'results', label: 'Results' },
              { value: 'positions', label: 'Position progression' },
              { value: 'laps', label: 'Lap-time trends' },
            ]}
          />
          {d.info.status === 'loading' && !d.info.data && <p className="px-pad pt-3 text-[12px] text-fg-3">Preparing session data with FastF1 — the first load can take up to a minute.</p>}
          {tab === 'results' && (
            <QueryView query={d.results} className="p-pad">
              {(r) => <ResultsTable rows={r.rows} drivers={d.driverMap} kind={session.kind} selected={selected} onSelect={selectDriver} />}
            </QueryView>
          )}
          {tab === 'positions' && <div className="p-pad">{d.laps.data ? <PositionChart laps={d.laps.data.rows} drivers={drivers} selected={selected} /> : <QueryView query={d.laps}>{() => null}</QueryView>}</div>}
          {tab === 'laps' && <div className="p-pad">{d.laps.data ? <SessionLapChart laps={d.laps.data.rows} drivers={lapDrivers} height={260} /> : <QueryView query={d.laps}>{() => null}</QueryView>}</div>}
        </Panel>
      )}
    </>
  );
}

function SeasonStandings({ year }: { year: number }) {
  const q = useQuery(`api:standings:${year}`, () => api.standings(year));
  const [tab, setTab] = useState<'drivers' | 'constructors'>('drivers');
  return (
    <Panel title={`${year} standings`} subtitle={q.data?.round ? `After round ${q.data.round} · Jolpica-F1` : 'Jolpica-F1'} flush bodyClassName="flex flex-col" actions={<SourceBadge source={q.data?.source} />}>
      <Tabs
        label="Standings"
        value={tab}
        onChange={setTab}
        className="px-pad"
        tabs={[
          { value: 'drivers', label: 'Drivers' },
          { value: 'constructors', label: 'Constructors' },
        ]}
      />
      <QueryView query={q} className="p-pad">
        {(s) => <StandingsTable s={s} tab={tab} />}
      </QueryView>
    </Panel>
  );
}

function StandingsTable({ s, tab }: { s: Standings; tab: 'drivers' | 'constructors' }) {
  if (tab === 'drivers' && !s.drivers.length) return <EmptyState title="No standings published yet" />;
  const leader = tab === 'drivers' ? (s.drivers[0]?.points ?? 0) : (s.constructors[0]?.points ?? 0);
  const rows =
    tab === 'drivers'
      ? s.drivers.map((d) => ({ key: d.driver_id, pos: d.position, name: `${d.given_name} ${d.family_name}`, code: d.code, sub: d.constructors.join(' / '), points: d.points, wins: d.wins }))
      : s.constructors.map((c) => ({ key: c.constructor_id, pos: c.position, name: c.name, code: null, sub: '', points: c.points, wins: c.wins }));
  return (
    <div className="max-h-[420px] overflow-auto">
      <table className="w-full text-[12px]" aria-label={`${tab} standings`}>
        <thead className="sticky top-0 bg-surface text-[10.5px] tracking-wide text-fg-3 uppercase">
          <tr>
            <th className="h-7 pl-pad text-right font-medium">Pos</th>
            <th className="px-2 text-left font-medium">{tab === 'drivers' ? 'Driver' : 'Constructor'}</th>
            <th className="px-2 text-right font-medium">Wins</th>
            <th className="px-2 text-right font-medium">Gap</th>
            <th className="pr-pad text-right font-medium">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="h-row border-t border-line/60">
              <td className="num pl-pad text-right font-semibold">{r.pos ?? '—'}</td>
              <td className="px-2">
                {r.code && <span className="mr-2 font-mono text-[11.5px] font-semibold">{r.code}</span>}
                <span className="text-fg-2">{r.name}</span>
                {r.sub && <span className="ml-2 text-fg-3 max-md:hidden">{r.sub}</span>}
              </td>
              <td className="num px-2 text-right text-fg-2">{r.wins}</td>
              <td className="num px-2 text-right text-fg-3">{r.points === leader ? '—' : `−${(leader - r.points).toString()}`}</td>
              <td className="num pr-pad text-right font-medium">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
