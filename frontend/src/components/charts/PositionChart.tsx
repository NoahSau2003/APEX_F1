import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Driver, Lap } from '@/services/api/types';
import { EmptyState } from '@/components/ui/States';
import { axisProps, CHART, ChartTooltip, gridProps } from './theme';

/** Official timing position at the end of every lap (FastF1), selected driver highlighted. */
export function PositionChart({ laps, drivers, selected, height = 300 }: { laps: Lap[]; drivers: Driver[]; selected: string | null; height?: number }) {
  const rows = useMemo(() => {
    const byLap = new Map<number, Record<string, number>>();
    for (const l of laps) {
      if (l.lap == null || l.position == null) continue;
      (byLap.get(l.lap) ?? byLap.set(l.lap, { lap: l.lap }).get(l.lap)!)[l.driver_number] = l.position;
    }
    return [...byLap.values()].sort((a, b) => a.lap - b.lap);
  }, [laps]);
  const n = Math.max(20, drivers.length);
  if (!rows.length) return <EmptyState title="No lap positions" description="FastF1 published no per-lap positions for this session." className="py-6" />;
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 6, right: 40, bottom: 0, left: -16 }}>
          <CartesianGrid {...gridProps} />
          <XAxis {...axisProps} dataKey="lap" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => `L${v}`} minTickGap={20} />
          <YAxis {...axisProps} reversed domain={[1, n]} ticks={[1, 5, 10, 15, 20].filter((t) => t <= n)} tickFormatter={(v) => `P${v}`} />
          <Tooltip cursor={{ stroke: CHART.cursor }} content={<ChartTooltip title={(l) => `Lap ${l}`} format={(v) => `P${v}`} name={(p) => drivers.find((d) => d.driver_number === p.dataKey)?.abbreviation ?? String(p.dataKey)} sort="asc" max={8} />} />
          {drivers.map((d) => {
            const on = d.driver_number === selected;
            return (
              <Line
                key={d.driver_number}
                dataKey={d.driver_number}
                stroke={d.team_color}
                strokeWidth={on ? 2.75 : 1.25}
                strokeOpacity={selected ? (on ? 1 : 0.35) : 0.85}
                dot={false}
                activeDot={on ? { r: 4, stroke: CHART.surface, strokeWidth: 2 } : false}
                isAnimationActive={false}
                connectNulls={false}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
