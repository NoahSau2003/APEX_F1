import type { Driver } from '@/services/api/types';
import type { TimingRow } from '@/replay/timing';
import { formatLapTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import { Badge } from '@/components/ui/Badge';
import { TyreBadge } from '@/components/ui/Racing';

interface Props {
  rows: TimingRow[];
  drivers: Map<string, Driver>;
  selected: string | null;
  onSelect: (d: string) => void;
  mode: 'gap' | 'interval';
  race: boolean;
  className?: string;
}

/**
 * Running order at the replay time. Positions are FastF1's per-lap timing
 * positions; gaps/intervals are calculated from line-crossing times (see replay/timing).
 */
export function TimingTower({ rows, drivers, selected, onSelect, mode, race, className }: Props) {
  return (
    <div className={cn('min-h-0 overflow-auto', className)}>
      <table className="w-full text-[12px]" aria-label="Timing tower">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="text-[10.5px] tracking-wide text-fg-3 uppercase">
            <th className="h-7 w-7 pl-pad text-right font-medium">P</th>
            <th className="px-2 text-left font-medium">Driver</th>
            <th className="px-2 text-right font-medium" title={race ? (mode === 'gap' ? 'Gap to leader at the last timing line (calculated)' : 'Interval to the car ahead at the last timing line (calculated)') : 'Best lap so far'}>
              {race ? (mode === 'gap' ? 'Gap' : 'Int') : 'Best'}
            </th>
            <th className="px-2 text-right font-medium">Last</th>
            <th className="pr-pad text-left font-medium">Tyre</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const d = drivers.get(r.driver);
            const sel = r.driver === selected;
            const v = mode === 'gap' ? r.gap : r.interval;
            return (
              <tr
                key={r.driver}
                tabIndex={0}
                aria-selected={sel}
                onClick={() => onSelect(r.driver)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(r.driver))}
                className={cn('h-row cursor-pointer border-b border-line/60 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none', sel && 'bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]')}
              >
                <td className="num pl-pad text-right font-semibold">
                  {r.out ? <span className="text-fg-3">—</span> : r.position ?? (r.grid != null ? <span className="font-normal text-fg-3" title="Starting grid slot (no lap completed yet)">G{r.grid}</span> : '—')}
                </td>
                <td className="px-2">
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full border border-black/40" style={{ background: d?.team_color ?? '#8b8f99' }} />
                    <span className="font-mono text-[11.5px] font-semibold">{d?.abbreviation ?? r.driver}</span>
                    {r.inPit && <Badge tone="info">PIT</Badge>}
                    {r.out && <Badge tone="bad" title="No further laps recorded">OUT</Badge>}
                  </span>
                </td>
                <td className="num px-2 text-right text-fg-2">
                  {r.out
                    ? ''
                    : race
                      ? r.position === 1
                        ? <span className="text-fg-3">Leader</span>
                        : r.lapsDown > 0 && mode === 'gap'
                          ? `+${r.lapsDown} lap${r.lapsDown > 1 ? 's' : ''}`
                          : v != null
                            ? `+${v.toFixed(3)}`
                            : '—'
                      : formatLapTime(r.bestLapTime)}
                </td>
                <td className="num px-2 text-right">{formatLapTime(r.lastLap?.lap_time)}</td>
                <td className="pr-pad">
                  <TyreBadge compound={r.compound} age={r.tyreLife} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
