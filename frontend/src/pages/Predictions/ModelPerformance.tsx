import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Check, X } from 'lucide-react';
import { catalog } from '@/demo/services';
import type { BacktestReport, BacktestRow } from '@/demo/services/contracts';
import { selectEvent } from '@/demo/selection';
import { formatPercent } from '@/utils/format';
import { axisProps, CHART, ChartTooltip, gridProps } from '@/components/charts/theme';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { DriverLabel } from '@/demo/DemoLabels';
import { Segmented } from '@/components/ui/Segmented';
import { Stat } from '@/components/ui/Stat';

type Metric = 'positionMae' | 'rankCorrelation' | 'top10Overlap';
const METRICS: Record<Metric, { label: string; format: (v: number) => string; domain: [number, number]; better: string }> = {
  positionMae: { label: 'Mean position error', format: (v) => v.toFixed(2), domain: [0, 8], better: 'Lower is better' },
  rankCorrelation: { label: 'Rank correlation', format: (v) => v.toFixed(2), domain: [-0.2, 1], better: 'Higher is better' },
  top10Overlap: { label: 'Top-10 overlap', format: (v) => formatPercent(v), domain: [0, 1], better: 'Higher is better' },
};

export function BacktestStats({ report }: { report: BacktestReport }) {
  return (
    <div className="grid grid-cols-2 gap-gap md:grid-cols-5">
      <Stat label="Winner hit rate" value={formatPercent(report.winnerAccuracy)} sub={`${report.rows.filter((r) => r.winnerHit).length} of ${report.rows.length} races`} />
      <Stat label="Podium overlap" value={formatPercent(report.podiumAccuracy)} sub="Share of top 3 named" />
      <Stat label="Top-10 overlap" value={formatPercent(report.top10Accuracy)} sub="Share of top 10 named" />
      <Stat label="Position error" value={report.meanMae.toFixed(2)} sub="Mean absolute, positions" />
      <Stat label="Rank correlation" value={report.meanRankCorrelation.toFixed(2)} sub="Mean Spearman ρ" className="max-md:col-span-2" />
    </div>
  );
}

/** Per-round backtest metric, one metric at a time (no dual axes). */
export function AccuracyChart({ report }: { report: BacktestReport }) {
  const [metric, setMetric] = useState<Metric>('rankCorrelation');
  const m = METRICS[metric];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="Accuracy metric"
          size="xs"
          value={metric}
          onChange={setMetric}
          options={(Object.keys(METRICS) as Metric[]).map((k) => ({ value: k, label: METRICS[k].label }))}
        />
        <span className="text-[11px] text-fg-3">{m.better}</span>
      </div>
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={report.rows} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="name" interval={0} tick={{ ...axisProps.tick, fontSize: 10 }} />
            <YAxis {...axisProps} domain={m.domain} tickFormatter={m.format} width={44} />
            <Tooltip
              cursor={{ stroke: CHART.cursor }}
              content={<ChartTooltip title={(l, p) => `R${(p[0]?.payload as BacktestRow | undefined)?.round ?? ''} · ${l}`} format={m.format} name={() => m.label} />}
            />
            <Line dataKey={metric} stroke={CHART.accent} strokeWidth={2} dot={{ r: 3, fill: CHART.accent, strokeWidth: 0 }} activeDot={{ r: 5, stroke: CHART.surface, strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Predicted versus actual winner for every completed demo race. */
export function BacktestTable({ report }: { report: BacktestReport }) {
  const columns: Column<BacktestRow>[] = [
    { key: 'round', header: 'Rd', align: 'right', sortValue: (r) => r.round, render: (r) => <span className="num text-fg-3">{r.round}</span> },
    { key: 'name', header: 'Race', sortValue: (r) => r.name, render: (r) => catalog.event(r.eventId).name.replace(' Grand Prix', '') },
    { key: 'pred', header: 'Predicted', render: (r) => <DriverLabel driverId={r.predictedWinner} /> },
    { key: 'act', header: 'Winner', render: (r) => <DriverLabel driverId={r.actualWinner} /> },
    {
      key: 'hit',
      header: 'Hit',
      align: 'center',
      sortValue: (r) => Number(r.winnerHit),
      render: (r) => (r.winnerHit ? <Check className="mx-auto size-3.5 text-good" aria-label="Correct" /> : <X className="mx-auto size-3.5 text-fg-3" aria-label="Missed" />),
    },
    { key: 'podium', header: 'Podium', align: 'right', sortValue: (r) => r.podiumOverlap, render: (r) => <span className="num">{Math.round(r.podiumOverlap * 3)}/3</span> },
    { key: 'rho', header: 'ρ', title: 'Rank correlation', align: 'right', hideBelow: 'sm', sortValue: (r) => r.rankCorrelation, render: (r) => <span className="num text-fg-2">{r.rankCorrelation.toFixed(2)}</span> },
  ];
  return (
    <DataTable
      label="Backtest by race"
      rows={report.rows}
      columns={columns}
      rowKey={(r) => r.eventId}
      onRowClick={(r) => selectEvent(r.eventId)}
      defaultSort={{ key: 'round', dir: 'desc' }}
      className="max-h-[300px]"
    />
  );
}
