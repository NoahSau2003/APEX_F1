import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/utils/cn';
import { useDismiss } from './Popover';

export interface SelectOption<V extends string | number> {
  value: V;
  label: ReactNode;
  /** Plain-text label for type-ahead and the trigger's accessible name. */
  text?: string;
  hint?: ReactNode;
  disabled?: boolean;
  group?: string;
}

interface SelectProps<V extends string | number> {
  value: V;
  options: SelectOption<V>[];
  onChange: (v: V) => void;
  label: string;
  /** Show the visible label before the value. */
  prefix?: ReactNode;
  className?: string;
  menuClassName?: string;
  size?: 'sm' | 'md';
  align?: 'start' | 'end';
}

/** Accessible custom listbox: arrow keys, Home/End, Enter, Escape, type-ahead. */
export function Select<V extends string | number>({ value, options, onChange, label, prefix, className, menuClassName, size = 'sm', align = 'start' }: SelectProps<V>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const refs = useRef([btnRef, listRef]).current;
  const close = useRef(() => setOpen(false)).current;
  const id = useId();
  useDismiss(open, close, refs);

  const current = options.find((o) => o.value === value);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);

  useEffect(() => {
    if (open) {
      setActive(Math.max(0, options.findIndex((o) => o.value === value)));
      requestAnimationFrame(() => listRef.current?.focus());
    }
    // Reset only when opening.
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const commit = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    onChange(o.value);
    setOpen(false);
    btnRef.current?.focus();
  };

  const move = (dir: 1 | -1) => {
    const pos = enabled.indexOf(active);
    const next = enabled[Math.min(enabled.length - 1, Math.max(0, (pos === -1 ? 0 : pos) + dir))];
    if (next != null) setActive(next);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), move(1));
    else if (e.key === 'ArrowUp') (e.preventDefault(), move(-1));
    else if (e.key === 'Home') (e.preventDefault(), setActive(enabled[0]));
    else if (e.key === 'End') (e.preventDefault(), setActive(enabled[enabled.length - 1]));
    else if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), commit(active));
    else if (e.key === 'Tab') setOpen(false);
    else if (e.key.length === 1) {
      const ch = e.key.toLowerCase();
      const hit = options.findIndex((o, i) => i > active && !o.disabled && (o.text ?? String(o.label)).toLowerCase().startsWith(ch));
      const wrap = hit >= 0 ? hit : options.findIndex((o) => !o.disabled && (o.text ?? String(o.label)).toLowerCase().startsWith(ch));
      if (wrap >= 0) setActive(wrap);
    }
  };

  let lastGroup: string | undefined;
  return (
    <div className={cn('relative', className)}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${label}: ${current?.text ?? String(current?.label ?? '')}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          'flex w-full min-w-0 items-center gap-1.5 rounded-md border border-line bg-surface-2 text-left text-fg transition-colors hover:border-line-strong',
          size === 'sm' ? 'h-7 px-2 text-[12px]' : 'h-8 px-2.5 text-[12.5px]',
          open && 'border-line-strong bg-surface-3',
        )}
      >
        {prefix && <span className="shrink-0 text-fg-3">{prefix}</span>}
        <span className="min-w-0 flex-1 truncate font-medium">{current?.label ?? '—'}</span>
        <ChevronDown className={cn('size-3.5 shrink-0 text-fg-3 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            ref={listRef}
            id={id}
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            aria-activedescendant={`${id}-${active}`}
            onKeyDown={onKeyDown}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className={cn(
              'absolute top-full z-50 mt-1 max-h-80 min-w-full overflow-auto rounded-lg border border-line-strong bg-surface-2 p-1 shadow-[0_12px_32px_rgb(0_0_0/0.5)] outline-none',
              align === 'end' ? 'right-0' : 'left-0',
              menuClassName,
            )}
          >
            {options.map((o, i) => {
              const header = o.group && o.group !== lastGroup ? o.group : null;
              lastGroup = o.group;
              return (
                <li key={String(o.value)} role="presentation">
                  {header && <div className="label px-2 pt-2 pb-1">{header}</div>}
                  <div
                    id={`${id}-${i}`}
                    role="option"
                    data-index={i}
                    aria-selected={o.value === value}
                    aria-disabled={o.disabled}
                    onMouseEnter={() => !o.disabled && setActive(i)}
                    onClick={() => commit(i)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] whitespace-nowrap',
                      i === active ? 'bg-surface-3 text-fg' : 'text-fg-2',
                      o.disabled && 'cursor-not-allowed opacity-40',
                    )}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">{o.label}</span>
                    {o.hint && <span className="text-[11px] text-fg-3">{o.hint}</span>}
                    <Check className={cn('size-3.5 text-accent', o.value === value ? 'opacity-100' : 'opacity-0')} />
                  </div>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
