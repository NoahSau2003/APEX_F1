import { Database, HardDrive } from 'lucide-react';
import type { CacheInfo, Source } from '@/services/api/types';
import { Badge } from './Badge';

/** Where a dataset came from: provider, whether it was calculated, and the cache that served it. */
export function SourceBadge({ source, cache, className }: { source?: Source; cache?: CacheInfo; className?: string }) {
  if (!source) return null;
  const title = [
    source.origin ?? source.provider,
    source.calculated ? 'Calculated from recorded data' : null,
    source.note,
    cache ? `Served from ${cache.served_from}${cache.processed_at ? ` (processed ${new Date(cache.processed_at).toLocaleString()})` : ''}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <Badge tone={source.calculated ? 'purple' : 'info'} icon={cache ? <HardDrive /> : <Database />} className={className} title={title}>
      {source.provider}
      {source.calculated ? ' · calc.' : ''}
    </Badge>
  );
}
