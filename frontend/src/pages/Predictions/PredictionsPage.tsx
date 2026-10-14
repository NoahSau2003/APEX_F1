import { useDeferredValue, useRef, useState } from 'react';
import { BrainCircuit, CloudRain, FlaskConical, Info, LoaderCircle, Trophy } from 'lucide-react';
import { useQuery } from '@/hooks/useQuery';
import { catalog, predictions } from '@/demo/services';
import type { DriverPrediction, PredictionScenario, PredictionSet, PredictionStage } from '@/demo/services/contracts';
import { DEFAULT_SCENARIO } from '@/demo/services/demoPredictions';
import { selectDriver, useSelection } from '@/demo/selection';
import { useSettings } from '@/state/settings';
import { formatDate, formatPercent } from '@/utils/format';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Panel } from '@/components/ui/Panel';
import { DriverLabel } from '@/demo/DemoLabels';
import { Segmented } from '@/components/ui/Segmented';
import { LoadingBlock, QueryView } from '@/components/ui/States';
import { RangeBar } from '@/components/charts/RangeBar';
import { Notice, Page, PageHeader } from '@/components/layout/Page';
import { PredictedVsActual } from './PredictedVsActual';
import { AccuracyChart, BacktestStats, BacktestTable } from './ModelPerformance';
import { DriverComparison, Explanation, FeatureImportance, TeamComparison } from './PredictionPanels';
import { ScenarioControls } from './ScenarioControls';
import { STAGE_LABELS, STAGES } from './stages';

function ProbCell({ v }: { v: number }) {
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="hidden h-1.5 w-10 overflow-hidden rounded-full bg-surface-3 min-[1720px]:block" aria-hidden>
        <span className="block h-full rounded-full bg-info" style={{ width: `${v * 100}%` }} />
      </span>
      <span className="num w-9 text-right">{formatPercent(v)}</span>
    </span>
  );
}

const COLUMNS: Column<DriverPrediction>[] = [
  { key: 'pos', header: 'Pos', align: 'right', sortValue: (r) => r.predictedPosition, render: (r) => <span className="num font-semibold">{r.predictedPosition}</span> },
  { key: 'driver', header: 'Driver', sortValue: (r) => catalog.driver(r.driverId).code, render: (r) => <DriverLabel driverId={r.driverId} variant="name" /> },
  { key: 'exp', header: 'Exp.', title: 'Expected finishing position', align: 'right', sortValue: (r) => r.expectedPosition, render: (r) => <span className="num text-fg-2">{r.expectedPosition.toFixed(1)}</span> },
  { key: 'range', header: 'Uncertainty (P10–P90)', hideBelow: 'md', render: (r) => <RangeBar range={r.range} expected={r.expectedPosition} />, className: 'w-[28%]' },
  { key: 'win', header: 'Win', align: 'right', sortValue: (r) => -r.win, render: (r) => <ProbCell v={r.win} /> },
  { key: 'top5', header: 'Top 5', align: 'right', hideBelow: 'sm', sortValue: (r) => -r.top5, render: (r) => <ProbCell v={r.top5} /> },
  { key: 'top10', header: 'Top 10', align: 'right', sortValue: (r) => -r.top10, render: (r) => <ProbCell v={r.top10} /> },
  { key: 'dnf', header: 'DNF', align: 'right', hideBelow: 'lg', sortValue: (r) => -r.dnf, render: (r) => <span className="num text-fg-3">{formatPercent(r.dnf)}</span> },
];

export default function PredictionsPage() {
  const eventId = useSelection((s) => s.eventId);
  const driverId = useSelection((s) => s.driverId);
  const teamId = useSelection((s) => s.teamId);
  const defaultStage = useSettings((s) => s.predictionStage);
  const [stage, setStage] = useState<PredictionStage>(defaultStage);
  const [scenario, setScenario] = useState<PredictionScenario>(DEFAULT_SCENARIO);
  const deferred = useDeferredValue(scenario);
  const event = catalog.event(eventId);
  const circuit = catalog.circuit(event.circuitId);
  const completed = event.status === 'completed';

  const q = useQuery(`predict:${eventId}:${stage}:${JSON.stringify(deferred)}`, () => predictions.predict(eventId, stage, deferred));
  const baseline = useQuery(`predict:${eventId}:${stage}:default`, () => predictions.predict(eventId, stage, DEFAULT_SCENARIO));
  const backtest = useQuery(`backtest:${event.season}:${stage}`, () => predictions.backtest(event.season, stage));

  // Keep showing the previous result while a new scenario is calculated.
  const last = useRef<PredictionSet | undefined>(undefined);
  if (q.data) last.current = q.data;
  const set = q.data ?? (last.current?.eventId === eventId ? last.current : undefined);
  const busy = !q.data || scenario !== deferred;

  return (
    <Page>
      <PageHeader
        title="Race Predictions"
        meta={
          <>
            <Badge tone="purple" icon={<FlaskConical />}>
              Illustrative
            </Badge>
            {busy && set && (
              <span className="inline-flex items-center gap-1 text-[11px] text-fg-3">
                <LoaderCircle className="size-3 animate-spin" />
                Recalculating
              </span>
            )}
          </>
        }
        description={`Demo calendar: ${event.name} · ${circuit.name} · ${formatDate(event.date)}${completed ? ' · completed in the demo calendar' : ' · upcoming'}`}
        actions={<Segmented label="Prediction stage" value={stage} onChange={setStage} options={STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))} />}
      />

      <Notice icon={<FlaskConical />}>
        <strong className="font-medium text-fg">Demo page — fictional teams and drivers.</strong> This screen is kept from the prototype to preserve its layout for a future milestone. It is not connected to the historical data
        shown elsewhere and contains no machine learning.
      </Notice>
      <Notice icon={<Info />}>
        These are <strong className="font-medium text-fg">illustrative prototype calculations, not predictions from a trained model.</strong> A transparent weighted score over recent form, car pace, grid
        and circuit history feeds a seeded Monte Carlo of 4,000 races. Accuracy figures below come from re-running the same formula against demo results and are not validated performance.
      </Notice>

      {!set ? (
        <QueryView query={q}>{() => null}</QueryView>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-gap lg:grid-cols-12">
            <div className="lg:col-span-4 xl:col-span-3">
              <ScenarioControls scenario={scenario} onChange={setScenario} stage={stage} driverId={driverId} teamId={teamId} />
            </div>

            <Panel
              title="Predicted finishing order"
              subtitle={`${STAGE_LABELS[stage]} · grid ${set.gridSource === 'qualifying' ? 'from qualifying' : set.gridSource === 'projected' ? 'projected (no qualifying yet)' : 'not used'}`}
              flush
              className="lg:col-span-8 xl:col-span-6"
            >
              <DataTable
                label="Predicted finishing order"
                rows={set.drivers}
                columns={COLUMNS}
                rowKey={(r) => r.driverId}
                selectedKey={driverId}
                onRowClick={(r) => selectDriver(r.driverId)}
                defaultSort={{ key: 'pos', dir: 'asc' }}
              />
            </Panel>

            <div className="flex flex-col gap-gap lg:col-span-12 lg:grid lg:grid-cols-2 xl:col-span-3 xl:flex">
              <WinnerCard set={set} />
              <Panel title="Why this prediction" subtitle="Selected driver" icon={<BrainCircuit />}>
                <Explanation driver={set.drivers.find((d) => d.driverId === driverId)!} set={set} />
              </Panel>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-gap md:grid-cols-2 xl:grid-cols-3">
            <Panel title="Feature importance" subtitle="Share of total weight at this stage">
              <FeatureImportance set={set} />
            </Panel>
            <Panel title="Driver comparison" subtitle="Probabilities from the same simulation">
              <DriverComparison key={driverId} set={set} defaultA={driverId} />
            </Panel>
            <Panel title="Team comparison" subtitle="Average top-10 chance per car" className="md:col-span-2 xl:col-span-1">
              <TeamComparison set={set} />
            </Panel>
          </div>
        </>
      )}

      <Panel title="Predicted vs actual" subtitle={completed ? 'This event · default scenario vs simulated demo result' : 'Shown once the event has taken place'}>
        <QueryView query={baseline}>
          {(p) => <PredictedVsActual prediction={p} eventId={eventId} completed={completed} />}
        </QueryView>
      </Panel>

      <section className="flex flex-col gap-gap">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[14px] font-semibold tracking-tight">Model performance · {event.season} backtest</h2>
          <span className="text-[11.5px] text-fg-3">Illustrative formula vs demo results · {STAGE_LABELS[stage]} stage · not validated</span>
        </div>
        <QueryView query={backtest} loading={<LoadingBlock rows={4} />}>
          {(report) =>
            report.rows.length === 0 ? (
              <Notice icon={<Info />} tone="info">
                No completed races in the {event.season} demo season to backtest against.
              </Notice>
            ) : (
              <>
                <BacktestStats report={report} />
                <div className="grid grid-cols-1 gap-gap xl:grid-cols-2">
                  <Panel title="Accuracy by round" subtitle="Historical prediction accuracy">
                    <AccuracyChart report={report} />
                  </Panel>
                  <Panel title="Predicted vs actual winners" subtitle="Click a race to select it" flush>
                    <BacktestTable report={report} />
                  </Panel>
                </div>
              </>
            )
          }
        </QueryView>
      </section>
    </Page>
  );
}

function WinnerCard({ set }: { set: PredictionSet }) {
  const w = set.drivers[0];
  const d = catalog.driver(w.driverId);
  const team = catalog.team(d.teamId);
  const runnerUp = set.drivers[1];
  const wet = set.scenario.conditions === 'wet' || (set.scenario.conditions === 'forecast' && catalog.event(set.eventId).weather !== 'dry');
  return (
    <section className="relative overflow-hidden rounded-lg border border-line bg-surface p-pad">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: team.color }} />
      <div className="flex items-center justify-between">
        <span className="label flex items-center gap-1.5">
          <Trophy className="size-3.5" />
          Predicted winner
        </span>
        {wet && (
          <Badge tone="info" icon={<CloudRain />}>
            Wet
          </Badge>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[20px] font-semibold tracking-tight">{d.lastName}</span>
        <span className="font-mono text-[12px] text-fg-3">
          {d.code} #{d.number}
        </span>
      </div>
      <div className="text-[12px] text-fg-3">{team.name}</div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div>
          <div className="label">Confidence</div>
          <div className="num text-[16px] font-semibold">{formatPercent(w.win)}</div>
        </div>
        <div>
          <div className="label">Podium</div>
          <div className="num text-[16px] font-semibold">{formatPercent(w.podium)}</div>
        </div>
        <div>
          <div className="label">Spread</div>
          <div className="num text-[16px] font-semibold" title="Mean width of the P10–P90 range across the predicted top ten">
            ±{set.uncertainty.toFixed(1)}
          </div>
        </div>
      </div>
      <p className="mt-3 text-[11.5px] text-fg-3">
        Closest challenger: <span className="text-fg-2">{catalog.driver(runnerUp.driverId).lastName}</span> at {formatPercent(runnerUp.win)}. Confidence is the share of 4,000 simulated races won.
      </p>
    </section>
  );
}
