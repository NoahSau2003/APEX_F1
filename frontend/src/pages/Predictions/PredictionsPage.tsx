import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BrainCircuit, CloudRain, Info, LoaderCircle, RefreshCw, Trophy } from 'lucide-react';
import { useQuery } from '@/hooks/useQuery';
import { api } from '@/services/api/client';
import type { DriverPredictionRow, ForecastSnapshot, PredictionStage, UpcomingRace } from '@/services/api/types';
import { useSettings } from '@/state/settings';
import { formatPercent } from '@/utils/format';
import { RangeBar } from '@/components/charts/RangeBar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { Stat } from '@/components/ui/Stat';
import { LoadingBlock, QueryView } from '@/components/ui/States';
import { Notice, Page, PageHeader } from '@/components/layout/Page';
import {
  DriverComparisonChart,
  DriverExplanation,
  DriverFeatureTable,
  FeatureHeatmap,
  FieldFeatureSpread,
  ForecastInputsPanel,
  ProbCell,
  TeamComparisonChart,
} from './RealPredictionPanels';
import { approxRange, normalizeForecastDrivers, withNormalizedDrivers } from './forecastUtils';
import { STAGE_LABELS, STAGES } from './stages';

function formatRaceStart(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function countdown(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'Race started';
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h remaining`;
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m remaining`;
}

function buildColumns(): Column<DriverPredictionRow>[] {
  return [
    { key: 'pos', header: 'Pos', align: 'right', sortValue: (r) => r.predicted_position, render: (r) => <span className="num font-semibold">{r.predicted_position}</span> },
    {
      key: 'driver',
      header: 'Driver',
      sortValue: (r) => r.family_name,
      render: (r) => (
        <span className="inline-flex min-w-0 items-center gap-2">
          <span aria-hidden className="h-3.5 w-[3px] shrink-0 rounded-full" style={{ background: r.team_color ?? '#888' }} />
          <span className="font-mono text-[11.5px] font-semibold">{r.code ?? r.driver_id}</span>
          <span className="truncate text-fg-2">{r.family_name}</span>
        </span>
      ),
    },
    {
      key: 'exp',
      header: 'Exp.',
      title: 'Expected finishing position (model output)',
      align: 'right',
      sortValue: (r) => r.expected_position,
      render: (r) => <span className="num text-fg-2">{r.expected_position.toFixed(1)}</span>,
    },
    {
      key: 'range',
      header: 'Est. band',
      title: 'Heuristic P10–P90 band from expected position (not simulation)',
      hideBelow: 'md',
      render: (r) => <RangeBar range={approxRange(r.expected_position)} expected={r.expected_position} />,
      className: 'w-[22%]',
    },
    { key: 'win', header: 'Win', align: 'right', sortValue: (r) => -r.win_probability, render: (r) => <ProbCell v={r.win_probability} /> },
    { key: 'pod', header: 'Podium', align: 'right', hideBelow: 'sm', sortValue: (r) => -r.podium_probability, render: (r) => <ProbCell v={r.podium_probability} /> },
    { key: 't10', header: 'Top 10', align: 'right', sortValue: (r) => -r.top10_probability, render: (r) => <ProbCell v={r.top10_probability} /> },
  ];
}

export default function PredictionsPage() {
  const defaultStage = useSettings((s) => s.predictionStage) as PredictionStage;
  const [eventId, setEventId] = useState<string | null>(null);
  const [stage, setStage] = useState<PredictionStage>(defaultStage);
  const [forecast, setForecast] = useState<ForecastSnapshot | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [predictError, setPredictError] = useState<string | null>(null);

  const upcoming = useQuery('predictions:upcoming', () => api.upcomingRaces());
  const modelInfo = useQuery('predictions:model', () => api.predictionModelInfo());
  const history = useQuery(eventId ? `predictions:history:${eventId}` : 'predictions:history:none', () => (eventId ? api.predictionHistory(eventId) : Promise.resolve({ event_id: '', snapshots: [] })));

  const races = upcoming.data?.races ?? [];
  const selected: UpcomingRace | undefined = races.find((r) => r.event_id === eventId) ?? races[0];

  useEffect(() => {
    if (!eventId && races[0]) setEventId(races[0].event_id);
  }, [eventId, races]);

  useEffect(() => {
    if (selected && !selected.stages?.[stage]) {
      const first = STAGES.find((s) => selected.stages?.[s]);
      if (first) setStage(first);
    }
  }, [selected, stage]);

  const stageOptions = useMemo(
    () =>
      STAGES.map((s) => ({
        value: s,
        label: STAGE_LABELS[s],
        disabled: selected ? !selected.stages?.[s] : true,
      })),
    [selected],
  );

  async function runPredict() {
    if (!selected) return;
    setPredicting(true);
    setPredictError(null);
    try {
      const snap = withNormalizedDrivers(await api.predictRace(selected.event_id, stage));
      setForecast(snap);
      setSelectedDriverId(snap.drivers[0]?.driver_id ?? null);
      history.retry();
    } catch (e) {
      setPredictError((e as Error).message);
    } finally {
      setPredicting(false);
    }
  }

  const rawActive = forecast?.event_id === selected?.event_id && forecast?.stage === stage ? forecast : null;
  const active = useMemo(() => (rawActive ? withNormalizedDrivers(rawActive) : null), [rawActive]);

  const featureNames = useMemo(
    () => active?.feature_names ?? modelInfo.data?.features ?? [],
    [active?.feature_names, modelInfo.data?.features],
  );

  const selectedDriver = useMemo(() => {
    if (!active) return null;
    const id = selectedDriverId ?? active.drivers[0]?.driver_id;
    return active.drivers.find((d) => d.driver_id === id) ?? active.drivers[0] ?? null;
  }, [active, selectedDriverId]);

  const columns = useMemo(() => buildColumns(), []);

  return (
    <Page>
      <PageHeader
        title="Race Predictions"
        meta={
          <>
            {modelInfo.data && (
              <Badge tone="purple">{modelInfo.data.model.name}</Badge>
            )}
            {upcoming.data && <span className="text-[11px] text-fg-3">Calendar {formatRaceStart(upcoming.data.fetched_at)} UTC</span>}
          </>
        }
        description="Upcoming Grands Prix · local ML on Jolpica history, FastF1 weekend pace, grid/quali when available"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="Stage" value={stage} onChange={setStage} options={stageOptions} />
            <Button variant="primary" icon={predicting ? <LoaderCircle className="animate-spin" /> : <BrainCircuit />} disabled={!selected || predicting || !selected.stages?.[stage]} onClick={runPredict}>
              Generate forecast
            </Button>
          </div>
        }
      />

      <Notice icon={<Info />}>
        Trained model (not the old demo Monte Carlo). Win probabilities are softmax estimates from predicted positions. Feature panels show raw model inputs at cutoff — explore drivers in the table to see all {featureNames.length || 29} factors.
      </Notice>

      <QueryView query={upcoming} loading={<LoadingBlock rows={3} />}>
        {(data) =>
          data.races.length === 0 ? (
            <Notice icon={<Info />} tone="info">
              No eligible upcoming races were found on the calendar. Refresh when the season schedule is published or the backend can reach FastF1.
            </Notice>
          ) : (
            <Panel title="Upcoming Grands Prix" subtitle="Only events whose race has not started">
              <div className="flex flex-wrap gap-2">
                {data.races.map((r) => (
                  <button
                    key={r.event_id}
                    type="button"
                    onClick={() => {
                      setEventId(r.event_id);
                      setForecast(null);
                      setSelectedDriverId(null);
                    }}
                    className={`rounded-md border px-3 py-2 text-left text-[12px] transition-colors ${selected?.event_id === r.event_id ? 'border-accent bg-surface-2' : 'border-line hover:border-line-strong'}`}
                  >
                    <div className="font-medium text-fg">{r.name}</div>
                    <div className="text-fg-3">
                      {r.location ?? r.circuit} · {formatRaceStart(r.race_start_utc)}
                    </div>
                    <div className="mt-1 text-[11px] text-info">{countdown(r.race_start_utc)}</div>
                  </button>
                ))}
                <Button variant="ghost" size="xs" icon={<RefreshCw />} onClick={() => upcoming.retry()}>
                  Refresh calendar
                </Button>
              </div>
            </Panel>
          )
        }
      </QueryView>

      {predictError && <Notice icon={<AlertTriangle />}>{predictError}</Notice>}

      {active && selectedDriver ? (
        <>
          <div className="grid grid-cols-1 gap-gap lg:grid-cols-12">
            <div className="lg:col-span-4 xl:col-span-3">
              <ForecastInputsPanel snap={active} />
            </div>

            <Panel
              title="Predicted finishing order"
              subtitle={`${STAGE_LABELS[active.stage]} · cutoff ${formatRaceStart(active.cutoff_utc)} · grid ${active.grid_source.replace(/_/g, ' ')} · ${active.drivers.length} drivers`}
              flush
              className="lg:col-span-8 xl:col-span-6"
            >
              <DataTable
                label="Predicted finishing order"
                rows={active.drivers}
                columns={columns}
                rowKey={(r) => r.driver_id}
                selectedKey={selectedDriver.driver_id}
                onRowClick={(r) => setSelectedDriverId(r.driver_id)}
                defaultSort={{ key: 'pos', dir: 'asc' }}
              />
            </Panel>

            <div className="flex flex-col gap-gap lg:col-span-12 lg:grid lg:grid-cols-2 xl:col-span-3 xl:flex xl:flex-col">
              <WinnerCard snap={active} />
              <Panel title="Why this prediction" subtitle="Selected driver · top signals" icon={<BrainCircuit />}>
                <DriverExplanation driver={selectedDriver} />
              </Panel>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-gap md:grid-cols-2 xl:grid-cols-3">
            <Panel title="Field feature spread" subtitle="Which inputs differ most across the grid">
              <FieldFeatureSpread drivers={active.drivers} featureNames={featureNames} />
            </Panel>
            <Panel title="Driver comparison" subtitle="Probabilities from the same forecast">
              <DriverComparisonChart drivers={active.drivers} defaultA={selectedDriver.driver_id} />
            </Panel>
            <Panel title="Team comparison" subtitle="Average top-10 chance per car" className="md:col-span-2 xl:col-span-1">
              <TeamComparisonChart drivers={active.drivers} />
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-gap xl:grid-cols-2">
            <Panel title="All model features" subtitle={`${selectedDriver.code ?? selectedDriver.driver_id} · full input vector`}>
              <DriverFeatureTable driver={selectedDriver} featureNames={featureNames} />
            </Panel>
            <Panel title="Feature heatmap" subtitle="Top 12 drivers · highest-variance features">
              <FeatureHeatmap drivers={active.drivers} featureNames={featureNames} />
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-gap md:grid-cols-2">
            <Panel title="Weather at race start" icon={<CloudRain />}>
              <WeatherBlock weather={active.weather} />
            </Panel>
            <Panel title="Relevant news" subtitle="Context and model-linked items">
              <NewsBlock items={active.news.items ?? []} />
            </Panel>
          </div>

          {(active.warnings?.length ?? 0) > 0 && <Notice icon={<AlertTriangle />}>{active.warnings!.join(' ')}</Notice>}
        </>
      ) : (
        selected && (
          <Panel title="No forecast yet">
            <p className="text-[12.5px] text-fg-2">Select a stage and generate a forecast for {selected.name}. You will get the full order table, per-driver features, comparisons, and charts.</p>
          </Panel>
        )
      )}

      <QueryView query={history} loading={<LoadingBlock rows={2} />}>
        {(h) =>
          h.snapshots.length === 0 ? null : (
            <Panel title="Forecast history" subtitle="Immutable snapshots for this event">
              <ul className="divide-y divide-line text-[12px]">
                {h.snapshots.map((s) => {
                  const norm = normalizeForecastDrivers(s.drivers);
                  const lead = norm[0];
                  return (
                    <li key={s.snapshot_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        {STAGE_LABELS[s.stage]} · {formatRaceStart(s.generated_at)} · {norm.length} drivers
                      </span>
                      <span className="text-fg-3">
                        Leader: {lead?.family_name} ({formatPercent(lead?.win_probability ?? 0)} win)
                      </span>
                      <Button
                        variant="subtle"
                        size="xs"
                        onClick={() => {
                          const snap = withNormalizedDrivers(s);
                          setForecast(snap);
                          setSelectedDriverId(snap.drivers[0]?.driver_id ?? null);
                        }}
                      >
                        View
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )
        }
      </QueryView>

      <QueryView query={modelInfo} loading={<LoadingBlock rows={2} />}>
        {(info) => (
          <section className="flex flex-col gap-gap">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[14px] font-semibold tracking-tight">Model evaluation</h2>
              <span className="text-[11.5px] text-fg-3">
                {info.model.name} v{info.model.version} · chronological holdout from 2023
              </span>
            </div>
            <div className="grid grid-cols-2 gap-gap md:grid-cols-5">
              <Stat label="Winner accuracy" value={info.evaluation?.winner_accuracy != null ? formatPercent(Number(info.evaluation.winner_accuracy)) : '—'} sub="Holdout races" />
              <Stat label="Mean MAE" value={info.evaluation?.mean_mae != null ? Number(info.evaluation.mean_mae).toFixed(2) : '—'} sub="Positions" />
              <Stat label="Rank correlation" value={info.evaluation?.mean_rank_correlation != null ? Number(info.evaluation.mean_rank_correlation).toFixed(2) : '—'} sub="Spearman ρ" />
              <Stat label="Races evaluated" value={String(info.evaluation?.races_evaluated ?? '—')} />
              <Stat
                label="Form baseline MAE"
                value={info.baselines?.form_baseline_mae != null ? Number(info.baselines.form_baseline_mae).toFixed(2) : '—'}
                sub="vs roll3 form only"
                className="max-md:col-span-2"
              />
            </div>
            <p className="text-[11.5px] text-fg-3">{(info.notes ?? []).join(' ')}</p>
          </section>
        )}
      </QueryView>
    </Page>
  );
}

function WinnerCard({ snap }: { snap: ForecastSnapshot }) {
  const w = snap.drivers[0];
  const ru = snap.drivers[1];
  if (!w) return null;
  const wet = Number(w.features?.race_wet_indicator ?? 0) > 0.35;
  return (
    <section className="relative overflow-hidden rounded-lg border border-line bg-surface p-pad">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: w.team_color ?? '#888' }} />
      <div className="flex items-center justify-between">
        <span className="label flex items-center gap-1.5">
          <Trophy className="size-3.5" />
          Predicted leader
        </span>
        {wet && (
          <Badge tone="info" icon={<CloudRain />}>
            Rain risk
          </Badge>
        )}
      </div>
      <div className="mt-2 text-[20px] font-semibold tracking-tight">{w.family_name}</div>
      <div className="text-[12px] text-fg-3">
        {w.constructor} · {w.code}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div>
          <div className="label">Win est.</div>
          <div className="num text-[16px] font-semibold">{formatPercent(w.win_probability)}</div>
        </div>
        <div>
          <div className="label">Podium</div>
          <div className="num text-[16px] font-semibold">{formatPercent(w.podium_probability)}</div>
        </div>
        <div>
          <div className="label">Expected</div>
          <div className="num text-[16px] font-semibold">P{w.expected_position.toFixed(1)}</div>
        </div>
      </div>
      {ru && (
        <p className="mt-3 text-[11.5px] text-fg-3">
          Next: {ru.family_name} ({formatPercent(ru.win_probability)} win)
        </p>
      )}
      <p className="mt-2 text-[11.5px] text-fg-3">Generated {formatRaceStart(snap.generated_at)}</p>
    </section>
  );
}

function WeatherBlock({ weather }: { weather: Record<string, unknown> }) {
  if (!weather.available) {
    return <p className="text-[12px] text-fg-3">{(weather.reason as string) ?? 'Forecast unavailable'}</p>;
  }
  const row = weather.hourly_at_race_start as Record<string, unknown> | undefined;
  return (
    <div className="text-[12px] text-fg-2">
      <p>Forecast for {String(row?.time_utc ?? '—')} UTC</p>
      <p className="mt-1">
        Temp {String(row?.temperature_c ?? '—')} °C · Rain {String(row?.precipitation_probability_pct ?? '—')}% · Wind {String(row?.windspeed_kmh ?? '—')} km/h
      </p>
      <p className="mt-2 text-fg-3">Retrieved {weather.retrieved_at ? formatRaceStart(String(weather.retrieved_at)) : '—'} · feeds race_wet_indicator feature</p>
    </div>
  );
}

function NewsBlock({ items }: { items: ForecastSnapshot['news']['items'] }) {
  if (!items.length) return <p className="text-[12px] text-fg-3">No recent headlines matched this event.</p>;
  return (
    <ul className="max-h-64 space-y-2 overflow-y-auto text-[12px]">
      {items.map((n) => (
        <li key={n.id} className="border-b border-line pb-2 last:border-0">
          <a href={n.link} target="_blank" rel="noreferrer" className="font-medium text-fg hover:text-accent">
            {n.title}
          </a>
          <div className="text-fg-3">
            {n.source}
            {n.published && ` · ${formatRaceStart(n.published)}`}
            {n.used_in_model && <span className="ml-1 text-info">· used in model inputs</span>}
            {n.context_only && !n.used_in_model && <span className="ml-1">· context only</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
