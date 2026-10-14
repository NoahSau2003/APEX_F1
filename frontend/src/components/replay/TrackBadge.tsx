import { CircleCheck, CircleAlert } from 'lucide-react';
import type { TrackValidation } from '@/services/api/types';
import { Badge } from '@/components/ui/Badge';

/** Track-mapping validation status with the measured metrics in its tooltip. */
export function TrackBadge({ v }: { v: TrackValidation }) {
  const lines = [
    `${v.status === 'validated' ? 'Validated' : 'Unverified'} circuit geometry`,
    `Built from ${v.laps_used} clean laps by ${v.drivers_used} drivers`,
    `Length ${(v.length_m / 1000).toFixed(3)} km vs ${v.speed_distance_m ? (v.speed_distance_m / 1000).toFixed(3) : '—'} km speed-integrated (ratio ${v.scale_ratio ?? '—'})`,
    `95% of ${v.samples_checked.toLocaleString()} samples within ${v.residual_p95_m} m`,
    `${(v.forward_share * 100).toFixed(2)}% of steps advance in the recorded direction`,
    ...v.failures.map((f) => `✗ ${f}`),
  ];
  return (
    <Badge tone={v.status === 'validated' ? 'good' : 'warn'} icon={v.status === 'validated' ? <CircleCheck /> : <CircleAlert />} title={lines.join('\n')}>
      {v.status === 'validated' ? 'Track validated' : 'Track unverified'}
    </Badge>
  );
}
