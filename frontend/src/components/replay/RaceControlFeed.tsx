import { useMemo } from 'react';
import { Flag, Info, ShieldAlert, TriangleAlert } from 'lucide-react';
import type { Driver, RaceControlRow } from '@/services/api/types';
import { seek, useReplayTime } from '@/replay/clock';
import { formatClock } from '@/utils/format';
import { EmptyState } from '@/components/ui/States';

const FLAG_COLORS: Record<string, string> = {
  GREEN: 'text-good',
  CLEAR: 'text-good',
  YELLOW: 'text-warn',
  'DOUBLE YELLOW': 'text-warn',
  RED: 'text-bad',
  BLUE: 'text-info',
  CHEQUERED: 'text-fg',
  'BLACK AND WHITE': 'text-fg-2',
};

/** Official race-control messages up to the replay time (never ahead of it). */
export function RaceControlFeed({ rows, drivers, limit }: { rows: RaceControlRow[]; drivers: Map<string, Driver>; limit?: number }) {
  const t = useReplayTime(2);
  const past = useMemo(() => {
    const p = rows.filter((r) => r.time != null && r.time <= t).reverse();
    return limit ? p.slice(0, limit) : p;
  }, [rows, t, limit]);
  if (!past.length) return <EmptyState title="No messages yet" description="Race-control messages appear as the replay reaches them." className="py-4" />;
  return (
    <ol className="-mx-1 min-h-0 flex-1 overflow-auto" aria-label="Race control messages">
      {past.map((r, i) => {
        const Icon = r.category === 'SafetyCar' ? ShieldAlert : r.flag ? Flag : r.category === 'CarEvent' ? TriangleAlert : Info;
        const d = r.driver_number ? drivers.get(r.driver_number) : undefined;
        return (
          <li key={`${r.time}-${i}`}>
            <button type="button" onClick={() => seek(r.time! - 2)} title="Jump the replay to this message" className="flex w-full items-start gap-2.5 rounded-md px-1 py-1.5 text-left hover:bg-surface-2">
              <Icon className={`mt-0.5 size-3.5 shrink-0 ${r.flag ? (FLAG_COLORS[r.flag] ?? 'text-fg-2') : r.category === 'SafetyCar' ? 'text-warn' : 'text-fg-3'}`} />
              <span className="min-w-0 flex-1 text-[12px] leading-snug text-fg-2">
                {r.message}
                {d && <span className="ml-1 font-mono text-[11px] text-fg-3">({d.abbreviation})</span>}
              </span>
              <span className="num shrink-0 text-[11px] text-fg-3">{r.lap ? `L${r.lap}` : formatClock(r.time!)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
