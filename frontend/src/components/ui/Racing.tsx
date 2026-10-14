import { ArrowDown, ArrowUp, Flag, Minus, ShieldAlert, TriangleAlert } from 'lucide-react';
import type { TrackStatus } from '@/types/domain';
import { compoundInfo } from '@/utils/tyres';
import { cn } from '@/utils/cn';
import { Badge } from './Badge';

/** Tyre compound badge. Accepts FastF1 compound names (SOFT, MEDIUM, …, 2018's HYPERSOFT etc.). */
export function TyreBadge({ compound, age, className }: { compound: string | null; age?: number | null; className?: string }) {
  const info = compoundInfo(compound);
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)} title={`${info.name}${age != null ? ` · ${age} laps old` : ''}`}>
      <span
        className="flex size-[18px] items-center justify-center rounded-full border-[2.5px] bg-[#0d0d0f] font-mono text-[9px] font-bold text-fg"
        style={{ borderColor: info.color }}
      >
        {info.letter}
      </span>
      {age != null && <span className="num text-[11px] text-fg-3">{age}</span>}
    </span>
  );
}

export function PositionDelta({ change, className }: { change: number; className?: string }) {
  if (change === 0)
    return (
      <span className={cn('inline-flex items-center text-fg-3', className)} aria-label="No change">
        <Minus className="size-3" />
      </span>
    );
  const up = change > 0;
  return (
    <span className={cn('num inline-flex items-center gap-0.5 text-[11px] font-semibold', up ? 'text-good' : 'text-bad', className)} aria-label={`${up ? 'Gained' : 'Lost'} ${Math.abs(change)}`}>
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(change)}
    </span>
  );
}

const STATUS: Record<TrackStatus, { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral'; icon: React.ReactNode }> = {
  green: { label: 'Track clear', tone: 'good', icon: <Flag /> },
  yellow: { label: 'Yellow flag', tone: 'warn', icon: <TriangleAlert /> },
  sc: { label: 'Safety car', tone: 'warn', icon: <ShieldAlert /> },
  red: { label: 'Red flag', tone: 'bad', icon: <Flag /> },
  chequered: { label: 'Chequered', tone: 'neutral', icon: <Flag /> },
};

export function TrackStatusBadge({ status }: { status: TrackStatus }) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {s.label}
    </Badge>
  );
}

/** Lap time text coloured by broadcast convention: purple overall best, green personal best. */
export function timeFlagClass(flag: 'none' | 'personal' | 'overall') {
  return flag === 'overall' ? 'text-purple' : flag === 'personal' ? 'text-good' : 'text-fg';
}
