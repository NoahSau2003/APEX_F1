import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { catalog } from '@/demo/services';
import type { DriverPrediction, PredictionFeature, PredictionSet } from '@/demo/services/contracts';
import type { DriverId } from '@/types/domain';
import { formatPercent, ordinal } from '@/utils/format';
import { cn } from '@/utils/cn';
import { axisProps, CHART, ChartLegend, ChartTooltip, gridProps } from '@/components/charts/theme';
import { Select } from '@/components/ui/Select';
import { DriverLabel } from '@/demo/DemoLabels';

export const FEATURE_LABELS: Record<PredictionFeature, string> = {
  form: 'Recent form',
  carPace: 'Car pace',
  grid: 'Grid position',
  circuit: 'Circuit history',
  wet: 'Wet-weather record',
  reliability: 'Reliability risk',
  adjustment: 'Team pace adjustment',
};

const FEATURE_HINTS: Record<PredictionFeature, string> = {
  form: 'Mean points over the previous five demo races',
  carPace: "Team's mean qualifying gap to pole, previous five races",
  grid: 'Starting position (qualifying or projected)',
  circuit: "Driver's finish at this circuit last season",
  wet: 'Average finish in wet/mixed races vs. dry races',
  reliability: 'Expected cost of retirement risk',
  adjustment: 'Scenario pace adjustment',
};

/** Signed contribution of each input to one driver's score, as a diverging bar list. */
export function Explanation({ driver, set }: { driver: DriverPrediction; set: PredictionSet }) {
  const entries = (Object.keys(FEATURE_LABELS) as PredictionFeature[]).map((k) => ({ k, v: driver.contributions[k] }));
  const max = Math.max(0.5, ...entries.map((e) => Math.abs(e.v)));
  const top = [...entries].sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0];
  const d = catalog.driver(driver.driverId);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] leading-relaxed text-fg-2">
        <span className="font-medium text-fg">
          {d.firstName} {d.lastName}
        </span>{' '}
        is projected {ordinal(driver.predictedPosition)} (expected P{driver.expectedPosition.toFixed(1)}, likely P{driver.range[0]}–P{driver.range[1]}). The largest factor is{' '}
        <span className="text-fg">{FEATURE_LABELS[top.k].toLowerCase()}</span>, which {top.v >= 0 ? 'helps' : 'hurts'} the score most.
        {driver.dnf > 0.08 && ` Retirement risk is elevated at ${formatPercent(driver.dnf)}.`}
      </p>
      <ul className="flex flex-col gap-1.5" aria-label="Score contributions">
        {entries.map(({ k, v }) => {
          const w = (Math.abs(v) / max) * 50;
          const inactive = Math.abs(v) < 0.005 && set.featureWeights[k] === 0;
          return (
            <li key={k} className={cn('grid grid-cols-[112px_1fr_44px] items-center gap-2 text-[11.5px]', inactive && 'opacity-40')} title={FEATURE_HINTS[k]}>
              <span className="truncate text-fg-2">{FEATURE_LABELS[k]}</span>
              <span className="relative h-3">
                <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
                <span
                  className="absolute inset-y-0.5 rounded-[2px]"
                  style={{ left: v >= 0 ? '50%' : `${50 - w}%`, width: `${w}%`, background: v >= 0 ? 'var(--good)' : 'var(--bad)' }}
                />
              </span>
              <span className={cn('num text-right', v > 0.005 ? 'text-good' : v < -0.005 ? 'text-[#ff7a7c]' : 'text-fg-3')}>
                {v > 0 ? '+' : v < 0 ? '−' : ''}
                {Math.abs(v).toFixed(2)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-[10.5px] text-fg-3">Contributions are in score units (standardised feature × weight). Positive moves a driver up the order.</p>
    </div>
  );
}

/** Relative weight of each input under the current stage and scenario. */
export function FeatureImportance({ set }: { set: PredictionSet }) {
  const total = Object.values(set.featureWeights).reduce((s, v) => s + Math.abs(v), 0) || 1;
  const data = (Object.keys(FEATURE_LABELS) as PredictionFeature[])
    .map((k) => ({ name: FEATURE_LABELS[k], value: Math.abs(set.featureWeights[k]) / total }))
    .sort((a, b) => b.value - a.value);
  return (
    <div style={{ height: 230 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap={6}>
          <CartesianGrid {...gridProps} horizontal={false} vertical />
          <XAxis {...axisProps} type="number" tickFormatter={(v) => formatPercent(v)} domain={[0, 'dataMax']} />
          <YAxis {...axisProps} type="category" dataKey="name" width={124} />
          <Tooltip cursor={{ fill: 'rgb(255 255 255 / 0.03)' }} content={<ChartTooltip format={(v) => formatPercent(v, 1)} name={() => 'Share of total weight'} />} />
          <Bar dataKey="value" fill={CHART.accent} radius={[0, 4, 4, 0]} isAnimationActive={false} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Two drivers side by side across every probability. */
export function DriverComparison({ set, defaultA }: { set: PredictionSet; defaultA: DriverId }) {
  const [a, setA] = useState<DriverId>(defaultA);
  const mate = catalog.driversOf(catalog.driver(a).teamId).find((d) => d.id !== a)!.id;
  const [b, setB] = useState<DriverId | null>(null);
  const other = b && b !== a ? b : mate;
  const pa = set.drivers.find((d) => d.driverId === a)!;
  const pb = set.drivers.find((d) => d.driverId === other)!;
  const metrics: { key: keyof DriverPrediction; label: string }[] = [
    { key: 'win', label: 'Win' },
    { key: 'podium', label: 'Podium' },
    { key: 'top5', label: 'Top 5' },
    { key: 'top10', label: 'Top 10' },
    { key: 'dnf', label: 'DNF' },
  ];
  const colorA = catalog.team(catalog.driver(a).teamId).color;
  const sameTeam = catalog.driver(a).teamId === catalog.driver(other).teamId;
  const colorB = sameTeam ? '#e6e6e8' : catalog.team(catalog.driver(other).teamId).color;
  const options = catalog.drivers.map((d) => ({ value: d.id, text: `${d.code} ${d.lastName}`, label: <DriverLabel driverId={d.id} variant="name" /> }));
  const data = metrics.map((m) => ({ name: m.label, [a]: pa[m.key] as number, [other]: pb[m.key] as number }));

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Select label="Driver A" value={a} onChange={setA} options={options} />
        <Select label="Driver B" value={other} onChange={setB} options={options.map((o) => ({ ...o, disabled: o.value === a }))} />
      </div>
      <ChartLegend
        items={[
          { id: a, label: catalog.driver(a).code, color: colorA },
          { id: other, label: catalog.driver(other).code, color: colorB },
        ]}
      />
      <div style={{ height: 170 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} barGap={2}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="name" />
            <YAxis {...axisProps} tickFormatter={(v) => formatPercent(v)} domain={[0, 1]} ticks={[0, 0.5, 1]} />
            <Tooltip cursor={{ fill: 'rgb(255 255 255 / 0.03)' }} content={<ChartTooltip format={(v) => formatPercent(v, 1)} name={(p) => catalog.driver(String(p.dataKey)).code} />} />
            <Bar dataKey={a} fill={colorA} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
            <Bar dataKey={other} fill={colorB} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Each team's combined chance of scoring with both cars, from the same distribution. */
export function TeamComparison({ set }: { set: PredictionSet }) {
  const data = catalog.teams
    .map((t) => {
      const ds = set.drivers.filter((d) => catalog.driver(d.driverId).teamId === t.id);
      return {
        id: t.id,
        name: t.short,
        color: t.color,
        top10: ds.reduce((s, d) => s + d.top10, 0) / 2,
        expected: ds.reduce((s, d) => s + d.expectedPosition, 0) / ds.length,
      };
    })
    .sort((a, b) => b.top10 - a.top10);
  return (
    <div style={{ height: 230 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
          <CartesianGrid {...gridProps} />
          <XAxis {...axisProps} dataKey="name" interval={0} />
          <YAxis {...axisProps} domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={(v) => formatPercent(v)} />
          <Tooltip
            cursor={{ fill: 'rgb(255 255 255 / 0.03)' }}
            content={
              <ChartTooltip
                title={(l) => catalog.teams.find((t) => t.short === l)?.name ?? String(l)}
                format={(v, p) => {
                  const row = p.payload as (typeof data)[number];
                  return `${formatPercent(v)} · mean exp. P${row.expected.toFixed(1)}`;
                }}
                name={() => 'Avg. top-10 chance per car'}
              />
            }
          />
          <Bar dataKey="top10" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.id} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
