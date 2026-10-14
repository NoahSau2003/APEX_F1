import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface TabsProps<V extends string> {
  value: V;
  tabs: { value: V; label: ReactNode; count?: number }[];
  onChange: (v: V) => void;
  label: string;
  className?: string;
}

/** Underline tabs. Panels are rendered by the caller. */
export function Tabs<V extends string>({ value, tabs, onChange, label, className }: TabsProps<V>) {
  return (
    <div role="tablist" aria-label={label} className={cn('flex items-center gap-4 overflow-x-auto border-b border-line', className)}>
      {tabs.map((t, i) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
              onChange(next.value);
              const list = (e.currentTarget as HTMLElement).parentElement;
              requestAnimationFrame(() => list?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
            }}
            className={cn(
              '-mb-px flex h-9 shrink-0 items-center gap-1.5 border-b-2 text-[12.5px] font-medium whitespace-nowrap transition-colors',
              on ? 'border-accent text-fg' : 'border-transparent text-fg-3 hover:text-fg-2',
            )}
          >
            {t.label}
            {t.count != null && <span className="num rounded bg-surface-3 px-1 text-[10.5px] text-fg-3">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
