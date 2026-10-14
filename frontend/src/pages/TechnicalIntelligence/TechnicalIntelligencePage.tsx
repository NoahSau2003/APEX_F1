import { useDeferredValue, useMemo, useState } from 'react';
import { ExternalLink, Info, Rss, Search, X } from 'lucide-react';
import { useQuery } from '@/hooks/useQuery';
import { api } from '@/services/api/client';
import type { NewsItem } from '@/services/api/types';
import { cn } from '@/utils/cn';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState, LoadingBlock, QueryView } from '@/components/ui/States';
import { Notice, Page, PageHeader } from '@/components/layout/Page';

const COMPONENT_LABELS: Record<string, string> = {
  'front-wing': 'Front wing',
  'rear-wing': 'Rear wing',
  floor: 'Floor & diffuser',
  suspension: 'Suspension',
  cooling: 'Cooling',
  'power-unit': 'Power unit',
  reliability: 'Reliability',
  sidepods: 'Sidepods',
  upgrade: 'Upgrades',
  tyres: 'Tyres',
  regulations: 'Regulations',
};

const TEAM_LABELS: Record<string, string> = {
  red_bull: 'Red Bull', ferrari: 'Ferrari', mercedes: 'Mercedes', mclaren: 'McLaren', aston_martin: 'Aston Martin', alpine: 'Alpine',
  williams: 'Williams', rb: 'Racing Bulls', sauber: 'Sauber / Audi', haas: 'Haas', cadillac: 'Cadillac',
};

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn('inline-flex h-6 items-center rounded-md border px-2 text-[11.5px] font-medium transition-colors', on ? 'border-line-strong bg-surface-3 text-fg' : 'border-line bg-surface-2 text-fg-3 hover:text-fg-2')}
    >
      {children}
    </button>
  );
}

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export default function TechnicalIntelligencePage() {
  const q = useQuery('api:news', () => api.news());
  const [search, setSearch] = useState('');
  const [teams, setTeams] = useState<string[]>([]);
  const [components, setComponents] = useState<string[]>([]);
  const [status, setStatus] = useState<'all' | NewsItem['status']>('all');
  const [technicalOnly, setTechnicalOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const term = useDeferredValue(search.trim().toLowerCase());

  const items = useMemo(
    () =>
      (q.data?.items ?? []).filter(
        (n) =>
          (!technicalOnly || n.technical) &&
          (status === 'all' || n.status === status) &&
          (!teams.length || n.teams.some((t) => teams.includes(t))) &&
          (!components.length || n.components.some((c) => components.includes(c))) &&
          (!term || term.split(/\s+/).every((w) => `${n.title} ${n.summary} ${n.source}`.toLowerCase().includes(w))),
      ),
    [q.data, technicalOnly, status, teams, components, term],
  );
  const current = items.find((n) => n.id === selected) ?? items[0];
  const filtered = teams.length + components.length > 0 || status !== 'all' || term !== '' || technicalOnly;
  const clear = () => (setSearch(''), setTeams([]), setComponents([]), setStatus('all'), setTechnicalOnly(false));

  return (
    <Page>
      <PageHeader title="Technical Intelligence" meta={<Badge tone="info" icon={<Rss />}>Public RSS</Badge>} description="Recent Formula 1 headlines from public feeds, tagged by a transparent keyword rule set." />
      <Notice icon={<Info />} tone="info">
        Headlines and summaries belong to their publishers and link to the original articles. Tags come from deterministic keyword rules (shown per item), not a language model, so they indicate
        what an article mentions, not verified technical facts. “Confirmed” / “reported” reflects wording such as “confirms” or “understood”; no performance effects are inferred.
      </Notice>

      <QueryView query={q} loading={<LoadingBlock rows={10} />}>
        {(data) => (
          <>
            <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-pad">
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative flex h-7 min-w-[220px] flex-1 items-center sm:max-w-sm">
                  <Search className="pointer-events-none absolute left-2 size-3.5 text-fg-3" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search headlines"
                    aria-label="Search headlines"
                    className="h-full w-full rounded-md border border-line bg-surface-2 pr-2 pl-7 text-[12px] placeholder:text-fg-3 focus:border-line-strong focus:outline-none"
                  />
                </label>
                <Segmented
                  label="Wording"
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'confirmed', label: 'Confirmed' },
                    { value: 'reported', label: 'Reported' },
                    { value: 'unclassified', label: 'Unclassified' },
                  ]}
                />
                <Chip on={technicalOnly} onClick={() => setTechnicalOnly((v) => !v)}>
                  Technical only
                </Chip>
                <Button size="sm" variant="ghost" icon={<X />} disabled={!filtered} onClick={clear}>
                  Clear
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Team filters">
                <span className="label mr-1 w-[88px]">Teams</span>
                {Object.entries(TEAM_LABELS).map(([id, name]) => (
                  <Chip key={id} on={teams.includes(id)} onClick={() => setTeams(toggle(teams, id))}>
                    {name}
                  </Chip>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Component filters">
                <span className="label mr-1 w-[88px]">Topics</span>
                {Object.entries(COMPONENT_LABELS).map(([id, name]) => (
                  <Chip key={id} on={components.includes(id)} onClick={() => setComponents(toggle(components, id))}>
                    {name}
                  </Chip>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] text-fg-3">
                {data.feeds.map((f) => (
                  <span key={f.id} title={f.error ?? f.url} className={f.ok ? '' : 'text-warn'}>
                    {f.name}: {f.ok ? `${f.count} items` : 'unavailable'}
                  </span>
                ))}
                <span>· fetched {new Date(data.fetched_at).toLocaleTimeString()}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-gap xl:grid-cols-12">
              <Panel title="Headlines" subtitle={`${items.length} of ${data.items.length}`} flush className="xl:col-span-6" bodyClassName="max-h-[720px] overflow-auto">
                {items.length === 0 ? (
                  <EmptyState title="No headlines match" action={<Button size="sm" onClick={clear}>Clear filters</Button>} />
                ) : (
                  <ul className="divide-y divide-line">
                    {items.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(n.id)}
                          aria-current={n.id === current?.id}
                          className={cn('flex w-full flex-col gap-1 px-pad py-2.5 text-left hover:bg-surface-2', n.id === current?.id && 'bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]')}
                        >
                          <span className="flex items-center gap-2 text-[11px] text-fg-3">
                            {n.source}
                            {n.published && <span>{new Date(n.published).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                            {n.technical && <Badge tone="purple">technical</Badge>}
                          </span>
                          <span className="text-[12.5px] leading-snug font-medium text-fg">{n.title}</span>
                          <span className="flex flex-wrap gap-1">
                            {n.teams.map((t) => (
                              <span key={t} className="rounded bg-surface-3 px-1.5 py-px text-[10.5px] text-fg-2">{TEAM_LABELS[t] ?? t}</span>
                            ))}
                            {n.components.map((c) => (
                              <span key={c} className="rounded border border-line px-1.5 py-px text-[10.5px] text-fg-3">{COMPONENT_LABELS[c] ?? c}</span>
                            ))}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel className="xl:col-span-6" bodyClassName="p-pad md:p-5">{current ? <Detail n={current} /> : <EmptyState title="Nothing selected" />}</Panel>
            </div>
          </>
        )}
      </QueryView>
    </Page>
  );
}

function Detail({ n }: { n: NewsItem }) {
  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={n.status === 'confirmed' ? 'good' : n.status === 'reported' ? 'info' : 'neutral'}>{n.status}</Badge>
          {n.technical && <Badge tone="purple">technical topic</Badge>}
        </div>
        <h2 className="text-[16px] leading-snug font-semibold tracking-tight">{n.title}</h2>
        <div className="text-[11.5px] text-fg-3">
          {n.source}
          {n.published && ` · ${new Date(n.published).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`}
        </div>
      </header>
      {n.summary && <p className="text-[12.5px] leading-relaxed text-fg-2">{n.summary}</p>}
      <a href={n.link} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1.5 rounded-md border border-line-strong bg-surface-2 px-2.5 py-1.5 text-[12px] font-medium hover:bg-surface-3">
        Read on {n.source} <ExternalLink className="size-3.5" />
      </a>
      <section>
        <h3 className="mb-2 text-[12px] font-semibold">Rules fired</h3>
        {n.rules_fired.length === 0 ? (
          <p className="text-[12px] text-fg-3">No rule matched this headline.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {n.rules_fired.map((r) => (
              <li key={r.rule} className="rounded border border-line bg-surface-2 px-2 py-1 text-[11px]">
                <span className="font-mono text-fg">{r.rule}</span>
                <span className="text-fg-3"> · {r.terms.map((t) => `“${t}”`).join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-[10.5px] text-fg-3">Measured performance is never attributed to a headline. Use Driver and Team Analytics for figures derived from timing data.</p>
    </article>
  );
}
