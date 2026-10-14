import type { ReactNode } from 'react';
import { FlaskConical } from 'lucide-react';
import { cn } from '@/utils/cn';

export type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad' | 'info' | 'purple';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-fg-2 border-line-strong',
  accent: 'bg-accent-soft text-[#ff7a7c] border-[rgb(229_56_59/0.3)]',
  good: 'bg-[rgb(63_179_127/0.12)] text-good border-[rgb(63_179_127/0.3)]',
  warn: 'bg-[rgb(224_165_46/0.12)] text-warn border-[rgb(224_165_46/0.3)]',
  bad: 'bg-[rgb(229_72_77/0.12)] text-[#ff7a7c] border-[rgb(229_72_77/0.3)]',
  info: 'bg-[rgb(91_147_245/0.12)] text-info border-[rgb(91_147_245/0.3)]',
  purple: 'bg-[rgb(166_108_242/0.12)] text-purple border-[rgb(166_108_242/0.3)]',
};

export function Badge({ tone = 'neutral', children, icon, className, title }: { tone?: Tone; children: ReactNode; icon?: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded border px-1.5 text-[10.5px] font-semibold tracking-wide whitespace-nowrap [&_svg]:size-3',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Marks content as locally simulated demo data. */
export function DemoBadge({ label = 'Demo data', className }: { label?: string; className?: string }) {
  return (
    <Badge tone="warn" icon={<FlaskConical />} className={className} title="Locally simulated sample data — not real Formula 1 records">
      {label}
    </Badge>
  );
}
