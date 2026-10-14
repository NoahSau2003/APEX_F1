import type { Driver } from '@/services/api/types';
import { cn } from '@/utils/cn';

/** Team-colour stripe + real three-letter abbreviation from the session's driver list. */
export function DriverChip({ driver, number, variant = 'code', className }: { driver?: Driver; number?: string; variant?: 'code' | 'name' | 'full'; className?: string }) {
  if (!driver) return <span className={cn('font-mono text-[11.5px] text-fg-3', className)}>#{number ?? '—'}</span>;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <span
        aria-hidden
        className="h-3.5 w-[3px] shrink-0 rounded-full"
        style={{ background: driver.team_color }}
        title={driver.team_color_official ? undefined : 'Neutral fallback colour: no official team colour was published for this session'}
      />
      <span className="font-mono text-[11.5px] font-semibold tracking-wide text-fg">{driver.abbreviation ?? `#${driver.driver_number}`}</span>
      {variant !== 'code' && (
        <span className="min-w-0 truncate text-fg-2">
          {variant === 'full' ? driver.full_name : driver.last_name}
          {variant === 'full' && driver.team_name && <span className="text-fg-3"> · {driver.team_name}</span>}
        </span>
      )}
    </span>
  );
}
