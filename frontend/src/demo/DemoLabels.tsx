import { catalog } from '@/demo/services';
import type { DriverId, TeamId } from '@/types/domain';
import { cn } from '@/utils/cn';

/* Labels for the fictional demo teams/drivers used only by the Predictions page. */

/** Team colour stripe + driver code, optionally the full name and team. */
export function DriverLabel({ driverId, variant = 'code', className }: { driverId: DriverId; variant?: 'code' | 'name' | 'full'; className?: string }) {
  const d = catalog.driver(driverId);
  const team = catalog.team(d.teamId);
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <span aria-hidden className="h-3.5 w-[3px] shrink-0 rounded-full" style={{ background: team.color }} />
      <span className="font-mono text-[11.5px] font-semibold tracking-wide text-fg">{d.code}</span>
      {variant !== 'code' && (
        <span className="min-w-0 truncate text-fg-2">
          {variant === 'full' ? `${d.firstName} ${d.lastName}` : d.lastName}
          {variant === 'full' && <span className="text-fg-3"> · {team.short}</span>}
        </span>
      )}
    </span>
  );
}

export function TeamLabel({ teamId, short, className }: { teamId: TeamId; short?: boolean; className?: string }) {
  const t = catalog.team(teamId);
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: t.color }} />
      <span className="truncate">{short ? t.short : t.name}</span>
    </span>
  );
}
