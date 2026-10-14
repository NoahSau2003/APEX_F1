import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface SegmentedProps<V extends string | number> {
  value: V;
  options: { value: V; label: ReactNode; title?: string; disabled?: boolean }[];
  onChange: (v: V) => void;
  label: string;
  size?: 'xs' | 'sm';
  className?: string;
}

/** Radio-group style segmented control with roving arrow-key focus. */
export function Segmented<V extends string | number>({ value, options, onChange, label, size = 'sm', className }: SegmentedProps<V>) {
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    for (let k = 1; k <= options.length; k++) {
      const o = options[(i + dir * k + options.length) % options.length];
      if (!o.disabled) {
        onChange(o.value);
        const group = (e.currentTarget as HTMLElement).parentElement;
        requestAnimationFrame(() => group?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
        break;
      }
    }
  };
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex shrink-0 rounded-md border border-line bg-surface-2 p-0.5', className)}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={o.title}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'inline-flex items-center justify-center gap-1 rounded-[5px] font-medium whitespace-nowrap transition-colors disabled:opacity-35 [&_svg]:size-3.5',
              size === 'xs' ? 'h-5 px-1.5 text-[10.5px]' : 'h-6 px-2 text-[11.5px]',
              on ? 'bg-surface-3 text-fg shadow-[0_0_0_1px_var(--border-strong)]' : 'text-fg-3 hover:text-fg-2',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
