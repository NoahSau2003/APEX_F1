import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, RotateCw, WifiOff } from 'lucide-react';
import { ApiError } from '@/services/api/client';
import type { QueryResult } from '@/hooks/useQuery';
import { cn } from '@/utils/cn';
import { Button } from './Button';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton', className)} />;
}

export function LoadingBlock({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-4" />
      ))}
    </div>
  );
}

export function EmptyState({ title, description, icon, action, className }: { title: string; description?: ReactNode; icon?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-4 py-8 text-center', className)}>
      <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-surface-2 text-fg-3 [&_svg]:size-4">{icon ?? <Inbox />}</span>
      <p className="text-[13px] font-medium text-fg">{title}</p>
      {description && <p className="max-w-sm text-[12px] text-fg-3">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error?: Error; onRetry?: () => void; className?: string }) {
  const offline = error instanceof ApiError && error.code === 'backend_unreachable';
  const unavailable = error instanceof ApiError && (error.code === 'data_unavailable' || error.status === 404);
  return (
    <EmptyState
      className={className}
      icon={offline ? <WifiOff /> : <AlertTriangle />}
      title={offline ? 'Backend not reachable' : unavailable ? 'Not available for this session' : 'Could not load this data'}
      description={error?.message}
      action={
        onRetry && (
          <Button size="sm" icon={<RotateCw />} onClick={onRetry}>
            Retry
          </Button>
        )
      }
    />
  );
}

/** Render loading / error / success for a query in one consistent way. */
export function QueryView<T>({ query, children, loading, className }: { query: QueryResult<T>; children: (data: T) => ReactNode; loading?: ReactNode; className?: string }) {
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.status === 'error') return <ErrorState error={query.error} onRetry={query.retry} className={className} />;
  return <>{loading ?? <LoadingBlock className={className} />}</>;
}

/** Error state for the first failed query among several (or nothing). */
export function FirstError({ queries, className }: { queries: QueryResult<unknown>[]; className?: string }) {
  const q = queries.find((x) => x.status === 'error');
  return q ? <ErrorState error={q.error} onRetry={q.retry} className={className} /> : null;
}
