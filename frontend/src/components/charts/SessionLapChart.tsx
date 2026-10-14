import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Driver, Lap } from '@/services/api/types';
import { formatLapTime } from '@/utils/format';
import { median } from '@/utils/math';
import { EmptyState } from '@/components/ui/States';
import { axisProps, CHART, ChartLegend, ChartTooltip, gridProps } from './theme';

interface Props {
  laps: Lap[];
  drivers: Driver[];
  /** Hide pit in/out laps (they distort pace comparisons). */
  excludePit?: boolean;
  /** Vertical marker, e.g. the replay's current lap. */
  markLap?: number | null;
  height?: number;
}

/** Recorded lap times per lap number. Teammates share the team colour; the second is dashed. */
export function SessionLapChart({ laps, drivers, excludePit = true, markLap, height = 220 }: Props) {
  const { rows, values } = useMemo(() => {
    const ids = new Set(drivers.map((d) => d.driver_number));
    const byLap = new Map<number, Record<string, number | null>>();
    const vals: number[] = [];
    for (const l of laps) {
      if (!ids.has(l.driver_number) || l.lap == null || l.lap_time == null) continue;
      if (excludePit && (l.pit_in != null || l.pit_out != null)) continue;
      const row = byLap.get(l.lap) ?? byLap.set(l.lap, { x: l.lap }).get(l.lap)!;
      row[l.driver_number] = l.lap_time;
      vals.push(l.lap_time);
    }
    return { rows: [...byLap.values()].sort((a, b) => (a.x as number) - (b.x as number)), values: vals };
  }, [laps, drivers, excludePit]);

  const dashed = useMemo(() => {
    const seen = new Set<string>();
    return new Map(
      drivers.map((d) => {
        const team = d.team_name ?? d.driver_number;
        const dash = seen.has(team);
        seen.add(team);
        return [d.driver_number, dash];
      }),
    );
  }, [drivers]);

  if (!values.length) return <EmptyState title="No lap times" description="No timed laps were recorded for these drivers." className="py-6" />;
  const med = median(values);
  const domain: [number, number] = [Math.floor(Math.min(...values) - 0.5), Math.ceil(Math.min(Math.max(...values), med * 1.06))];

  return (
    <div>
      <ChartLegend className="mb-2" items={drivers.map((d) => ({ id: d.driver_number, label: d.abbreviation ?? d.driver_number, color: d.team_color, dashed: dashed.get(d.driver_number) }))} />
      <div style={{ height }}>
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="x" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => `L${v}`} minTickGap={16} />
            <YAxis {...axisProps} width={56} domain={domain} allowDataOverflow tickFormatter={(v) => formatLapTime(v)} tickCount={4} />
            {markLap != null && <ReferenceLine x={markLap} stroke={CHART.accent} strokeDasharray="3 3" />}
            <Tooltip
              cursor={{ stroke: CHART.cursor }}
              content={<ChartTooltip title={(l) => `Lap ${l}`} format={(v) => formatLapTime(v)} name={(p) => drivers.find((d) => d.driver_number === p.dataKey)?.abbreviation ?? String(p.dataKey)} sort="asc" />}
            />
            {drivers.map((d) => (
              <Line
                key={d.driver_number}
                dataKey={d.driver_number}
                stroke={d.team_color}
                strokeWidth={2}
                strokeDasharray={dashed.get(d.driver_number) ? '4 3' : undefined}
                dot={false}
                activeDot={{ r: 4, stroke: CHART.surface, strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[10.5px] text-fg-3">Recorded FastF1 lap times{excludePit ? '; pit in/out laps omitted' : ''}. Very slow laps (safety car) are clipped at the top.</p>
    </div>
  );
}
