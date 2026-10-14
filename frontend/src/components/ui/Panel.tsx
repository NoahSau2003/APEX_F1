import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface PanelProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Remove body padding (tables, canvases). */
  flush?: boolean;
  id?: string;
}

/** The single container used for every dashboard module. */
export function Panel({ title, subtitle, icon, actions, children, className, bodyClassName, flush, id }: PanelProps) {
  return (
    <section
      id={id}
      className={cn('flex min-w-0 flex-col rounded-lg border border-line bg-surface shadow-[0_1px_0_rgb(0_0_0/0.3)]', className)}
    >
      {(title || actions) && (
        <header className="flex min-h-10 shrink-0 items-center gap-2 border-b border-line px-pad py-2">
          {icon && <span className="text-fg-3 [&>svg]:size-3.5">{icon}</span>}
          <div className="min-w-0 flex-1">
            {title && <h2 className="truncate text-[12.5px] font-semibold tracking-tight text-fg">{title}</h2>}
            {subtitle && <p className="truncate text-[11px] text-fg-3">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cn('min-h-0 flex-1', !flush && 'p-pad', bodyClassName)}>{children}</div>
    </section>
  );
}
