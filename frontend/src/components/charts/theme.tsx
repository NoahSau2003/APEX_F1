import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/**
 * Chart tokens. Recharts writes SVG presentation attributes, which cannot
 * resolve CSS variables reliably, so the chart palette mirrors the CSS
 * tokens as literals. Both themes share these values.
 */
export const CHART = {
  grid: '#25272d',
  axis: '#6d707a',
  axisLine: '#2d3037',
  text: '#a3a6ae',
  cursor: '#3a3d45',
  surface: '#111215',
  accent: '#e5383b',
  neutral: '#8b8f99',
  font: 11,
} as const;

export const axisProps = {
  stroke: CHART.axisLine,
  tick: { fill: CHART.axis, fontSize: CHART.font },
  tickLine: false,
  axisLine: false,
} as const;

export const gridProps = { stroke: CHART.grid, strokeDasharray: '0', vertical: false } as const;

interface TooltipItem {
  name?: unknown;
  value?: unknown;
  color?: string;
  dataKey?: unknown;
  payload?: unknown;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<TooltipItem>;
  label?: unknown;
  title?: (label: unknown, payload: ReadonlyArray<TooltipItem>) => ReactNode;
  format?: (value: number, item: TooltipItem) => ReactNode;
  name?: (item: TooltipItem) => ReactNode;
  sort?: 'asc' | 'desc';
  max?: number;
}

/** One tooltip design for every chart. */
export function ChartTooltip({ active, payload, label, title, format, name, sort, max = 10 }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  let items = payload.filter((p) => p.value != null && Number.isFinite(Number(p.value)));
  if (sort) items = [...items].sort((a, b) => (sort === 'asc' ? 1 : -1) * (Number(a.value) - Number(b.value)));
  const hidden = items.length - max;
  items = items.slice(0, max);
  return (
    <div className="min-w-36 rounded-md border border-line-strong bg-surface-2/95 px-2.5 py-2 text-[11.5px] shadow-xl backdrop-blur-sm">
      <div className="mb-1 font-medium text-fg">{title ? title(label, payload) : String(label ?? '')}</div>
      <div className="flex flex-col gap-0.5">
        {items.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-[2px]" style={{ background: p.color }} />
            <span className="flex-1 truncate text-fg-2">{name ? name(p) : String(p.name ?? '')}</span>
            <span className="num font-medium text-fg">{format ? format(Number(p.value), p) : String(p.value)}</span>
          </div>
        ))}
        {hidden > 0 && <div className="text-fg-3">+{hidden} more</div>}
      </div>
    </div>
  );
}

export interface LegendItem {
  id: string;
  label: ReactNode;
  color: string;
  dashed?: boolean;
}

/** HTML legend; optionally toggles series visibility. */
export function ChartLegend({ items, hidden, onToggle, className }: { items: LegendItem[]; hidden?: Set<string>; onToggle?: (id: string) => void; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]', className)} aria-label="Legend">
      {items.map((it) => {
        const off = hidden?.has(it.id);
        const body = (
          <>
            <svg width="14" height="8" aria-hidden className="shrink-0">
              <line x1="0" y1="4" x2="14" y2="4" stroke={it.color} strokeWidth="2.5" strokeDasharray={it.dashed ? '3 2' : undefined} strokeLinecap="round" />
            </svg>
            <span className={cn(off ? 'text-fg-3 line-through' : 'text-fg-2')}>{it.label}</span>
          </>
        );
        return (
          <li key={it.id}>
            {onToggle ? (
              <button type="button" aria-pressed={!off} onClick={() => onToggle(it.id)} className="inline-flex items-center gap-1.5 rounded px-0.5 hover:text-fg">
                {body}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5">{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
