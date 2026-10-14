import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface StatProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  accent?: string;
  className?: string;
}

/** Compact KPI tile: label, headline value, one line of context. */
export function Stat({ label, value, sub, icon, accent, className }: StatProps) {
  return (
    <div className={cn('relative min-w-0 overflow-hidden rounded-lg border border-line bg-surface px-3 py-2.5', className)}>
      {accent && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent }} />}
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-fg-3 [&>svg]:size-3.5">{icon}</span>}
        <span className="label truncate">{label}</span>
      </div>
      <div className="num mt-1 truncate text-[17px] leading-tight font-semibold tracking-tight text-fg">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11.5px] text-fg-3">{sub}</div>}
    </div>
  );
}
