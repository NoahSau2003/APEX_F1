import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DriverPredictionRow, ForecastSnapshot, PredictionExplanation } from '@/services/api/types';
import { formatPercent } from '@/utils/format';
import { axisProps, CHART, ChartLegend, ChartTooltip, gridProps } from '@/components/charts/theme';
import { Select } from '@/components/ui/Select';
import { Panel } from '@/components/ui/Panel';
import { FEATURE_META, featureLabel } from './featureLabels';

export function ForecastInputsPanel({ snap }: { snap: ForecastSnapshot }) {
  const entries = Object.entries(snap.sources ?? {});
  return (
    <Panel title="Inputs & sources" subtitle="Data cut off at forecast generation" bodyClassName="flex flex-col gap-2 text-[12px]">
      <div className="rounded-md border border-line bg-surface-2 px-2.5 py-2">
        <div className="label">Grid source</div>
        <div className="font-medium text-fg">{snap.grid_source.replace(/_/g, ' ')}</div>
        <div className="mt-1 text-fg-3">{snap.feature_names?.length ?? '—'} model features · {snap.model.name} v{snap.model.version}</div>
      </div>
      <ul className="space-y-1.5 text-fg-2">
        {entries.map(([k, v]) => (
          <li key={k} className="flex justify-between gap-2 border-b border-line/60 pb-1 last:border-0">
            <span className="text-fg-3 capitalize">{k.replace(/_/g, ' ')}</span>
            <span className="truncate text-right font-medium">{String(v ?? '—')}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function DriverExplanation({ driver }: { driver: DriverPredictionRow }) {
  const items = driver.explanation ?? [];
  const max = Math.max(0.01, ...items.map((e) => Math.abs(e.value)));
  const top = items[0];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] leading-relaxed text-fg-2">
        <span className="font-medium text-fg">
          {driver.given_name} {driver.family_name}
        </span>{' '}
        is projected P{driver.predicted_position} (expected P{driver.expected_position.toFixed(1)}).
        {top && (
          <>
            {' '}
            Strongest signal in the snapshot: <span className="text-fg">{top.label.toLowerCase()}</span> ({top.value}).
          </>
        )}
      </p>
      <ul className="flex flex-col gap-1.5" aria-label="Top feature values">
        {items.map((e) => (
          <ExplanationBar key={e.feature} entry={e} max={max} />
        ))}
      </ul>
      <p className="text-[10.5px] text-fg-3">Values are raw model inputs at cutoff (not SHAP). Green favours a better finish when lower is better for that feature.</p>
    </div>
  );
}

function ExplanationBar({ entry, max }: { entry: PredictionExplanation; max: number }) {
  const w = (Math.abs(entry.value) / max) * 50;
  const good = entry.lower_is_better ? entry.value < 0.5 : entry.value > 0.5;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_1fr_44px] items-center gap-2 text-[11.5px]" title={entry.label}>
      <span className="truncate text-fg-2">{entry.label}</span>
      <span className="relative h-3">
        <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
        <span
          className="absolute inset-y-0.5 rounded-[2px]"
          style={{
            left: entry.value >= 0 ? '50%' : `${50 - w}%`,
            width: `${Math.max(w, 2)}%`,
            background: good ? 'var(--good)' : 'var(--bad)',
          }}
        />
      </span>
      <span className="num text-right text-fg-2">{entry.value.toFixed(2)}</span>
    </li>
  );
}

/** All feature values for the selected driver. */
export function DriverFeatureTable({ driver, featureNames }: { driver: DriverPredictionRow; featureNames: string[] }) {
  const feats = driver.features ?? {};
  const rows = featureNames.map((k) => ({
    key: k,
    label: featureLabel(k),
    hint: FEATURE_META[k]?.hint,
    value: feats[k] ?? 0,
    lower: FEATURE_META[k]?.lowerIsBetter,
  }));
  return (
    <div className="max-h-72 overflow-y-auto">
      <table className="w-full text-[11.5px]">
        <thead>
          <tr className="text-fg-3 uppercase tracking-wide">
            <th className="pb-1 text-left font-medium">Feature</th>
            <th className="pb-1 text-right font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-line/70" title={r.hint}>
              <td className="py-1 pr-2 text-fg-2">{r.label}</td>
              <td className="num py-1 text-right font-medium">{Number(r.value).toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Mean absolute feature value across the field (proxy for which inputs vary most this weekend). */
export function FieldFeatureSpread({ drivers, featureNames }: { drivers: DriverPredictionRow[]; featureNames: string[] }) {
  const data = useMemo(() => {
    const stats = featureNames.map((k) => {
      const vals = drivers.map((d) => Math.abs(Number(d.features?.[k] ?? 0)));
      const mean = vals.reduce((s, v) => s + v, 0) / Math.max(vals.length, 1);
      return { name: featureLabel(k), value: mean, key: k };
    });
    return stats.sort((a, b) => b.value - a.value).slice(0, 12);
  }, [drivers, featureNames]);

  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap={6}>
          <CartesianGrid {...gridProps} horizontal={false} vertical />
          <XAxis {...axisProps} type="number" tickFormatter={(v) => Number(v).toFixed(2)} />
          <YAxis {...axisProps} type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} />
          <Tooltip cursor={{ fill: 'rgb(255 255 255 / 0.03)' }} content={<ChartTooltip format={(v) => Number(v).toFixed(3)} name={() => 'Mean |value| across field'} />} />
          <Bar dataKey="value" fill={CHART.accent} radius={[0, 4, 4, 0]} isAnimationActive={false} maxBarSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DriverComparisonChart({ drivers, defaultA }: { drivers: DriverPredictionRow[]; defaultA: string }) {
  const [a, setA] = useState(defaultA);
  const [b, setB] = useState<string | null>(null);
  const pa = drivers.find((d) => d.driver_id === a)!;
  const bId = b && b !== a ? b : drivers.find((x) => x.driver_id !== a)?.driver_id;
  const pb = drivers.find((d) => d.driver_id === bId) ?? pa;
  const options = drivers.map((d) => ({
    value: d.driver_id,
    label: `${d.code ?? d.driver_id} ${d.family_name}`,
    text: `${d.code ?? d.driver_id} ${d.family_name}`,
  }));
  const metrics = [
    { name: 'Win', a: pa.win_probability, b: pb.win_probability },
    { name: 'Podium', a: pa.podium_probability, b: pb.podium_probability },
    { name: 'Top 10', a: pa.top10_probability, b: pb.top10_probability },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Select label="Driver A" value={a} onChange={setA} options={options} />
        <Select label="Driver B" value={pb.driver_id} onChange={setB} options={options.map((o) => ({ ...o, disabled: o.value === a }))} />
      </div>
      <ChartLegend
        items={[
          { id: a, label: pa.code ?? pa.driver_id, color: pa.team_color ?? '#888' },
          { id: pb.driver_id, label: pb.code ?? pb.driver_id, color: pb.team_color ?? '#ccc' },
        ]}
      />
      <div style={{ height: 170 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={metrics} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} barGap={2}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="name" />
            <YAxis {...axisProps} tickFormatter={(v) => formatPercent(v)} domain={[0, 1]} ticks={[0, 0.5, 1]} />
            <Tooltip cursor={{ fill: 'rgb(255 255 255 / 0.03)' }} content={<ChartTooltip format={(v) => formatPercent(v, 1)} name={(p) => (p.dataKey === 'a' ? pa.code : pb.code) ?? ''} />} />
            <Bar dataKey="a" fill={pa.team_color ?? CHART.accent} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
            <Bar dataKey="b" fill={pb.team_color ?? '#888'} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function TeamComparisonChart({ drivers }: { drivers: DriverPredictionRow[] }) {
  const data = useMemo(() => {
    const byTeam = new Map<string, { name: string; color: string; top10: number[]; exp: number[] }>();
    for (const d of drivers) {
      const t = byTeam.get(d.constructor_id) ?? { name: d.constructor, color: d.team_color ?? '#888', top10: [], exp: [] };
      t.top10.push(d.top10_probability);
      t.exp.push(d.expected_position);
      byTeam.set(d.constructor_id, t);
    }
    return [...byTeam.values()]
      .map((t) => ({
        name: t.name.length > 12 ? t.name.slice(0, 11) + '…' : t.name,
        top10: t.top10.reduce((s, v) => s + v, 0) / t.top10.length,
        expected: t.exp.reduce((s, v) => s + v, 0) / t.exp.length,
        color: t.color,
      }))
      .sort((a, b) => b.top10 - a.top10);
  }, [drivers]);

  return (
    <div style={{ height: 230 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
          <CartesianGrid {...gridProps} />
          <XAxis {...axisProps} dataKey="name" interval={0} tick={{ fontSize: 10 }} />
          <YAxis {...axisProps} domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={(v) => formatPercent(v)} />
          <Tooltip
            cursor={{ fill: 'rgb(255 255 255 / 0.03)' }}
            content={
              <ChartTooltip
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
              <Cell key={d.name} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Compact heatmap: top drivers × headline features. */
export function FeatureHeatmap({ drivers, featureNames }: { drivers: DriverPredictionRow[]; featureNames: string[] }) {
  const keys = useMemo(() => {
    const spread = featureNames.map((k) => {
      const vals = drivers.map((d) => Number(d.features?.[k] ?? 0));
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      return { k, span: max - min };
    });
    return spread.sort((a, b) => b.span - a.span).slice(0, 8).map((x) => x.k);
  }, [drivers, featureNames]);

  const top = drivers.slice(0, 12);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-[10.5px]">
        <thead>
          <tr>
            <th className="pb-1 text-left font-medium text-fg-3">Driver</th>
            {keys.map((k) => (
              <th key={k} className="pb-1 px-0.5 text-center font-medium text-fg-3" title={FEATURE_META[k]?.hint}>
                {featureLabel(k).split(' ')[0]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {top.map((d) => (
            <tr key={d.driver_id} className="border-t border-line/60">
              <td className="py-0.5 pr-2 font-mono font-semibold">{d.code ?? d.driver_id}</td>
              {keys.map((k) => {
                const v = Number(d.features?.[k] ?? 0);
                const vals = drivers.map((x) => Number(x.features?.[k] ?? 0));
                const min = Math.min(...vals);
                const max = Math.max(...vals);
                const t = max === min ? 0.5 : (v - min) / (max - min);
                const bg = `rgb(91 147 245 / ${0.12 + t * 0.55})`;
                return (
                  <td key={k} className="num px-0.5 py-0.5 text-center" style={{ background: bg }} title={`${featureLabel(k)}: ${v.toFixed(3)}`}>
                    {v.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProbCell({ v }: { v: number }) {
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="hidden h-1.5 w-10 overflow-hidden rounded-full bg-surface-3 min-[1400px]:block" aria-hidden>
        <span className="block h-full rounded-full bg-info" style={{ width: `${v * 100}%` }} />
      </span>
      <span className="num w-9 text-right">{formatPercent(v)}</span>
    </span>
  );
}
