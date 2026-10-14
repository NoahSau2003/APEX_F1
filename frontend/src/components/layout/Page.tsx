import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/** Standard page frame: consistent margins and a compact header row. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto flex w-full max-w-[1680px] flex-col gap-gap p-3 md:p-4', className)}>{children}</div>;
}

export function PageHeader({ title, description, meta, actions }: { title: ReactNode; description?: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[17px] font-semibold tracking-tight">{title}</h1>
          {meta}
        </div>
        {description && <p className="mt-0.5 max-w-3xl text-[12.5px] text-fg-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Thin explanatory strip used for demo / illustrative disclosures. */
export function Notice({ icon, children, tone = 'warn', className }: { icon: ReactNode; children: ReactNode; tone?: 'warn' | 'info'; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-[12px] leading-snug [&>svg]:mt-px [&>svg]:size-3.5 [&>svg]:shrink-0',
        tone === 'warn' ? 'border-[rgb(224_165_46/0.25)] bg-[rgb(224_165_46/0.06)] text-fg-2 [&>svg]:text-warn' : 'border-[rgb(91_147_245/0.25)] bg-[rgb(91_147_245/0.06)] text-fg-2 [&>svg]:text-info',
        className,
      )}
    >
      {icon}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
