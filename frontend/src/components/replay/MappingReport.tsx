import { useMemo, useState } from 'react';
import { Ruler } from 'lucide-react';
import type { Track } from '@/services/api/types';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { TrackBadge } from './TrackBadge';

type AvailableTrack = Extract<Track, { available: true }>;

/**
 * Debug view: recorded points and the derived centreline in the provider's own
 * source frame (no rotation or centring), next to the validation metrics. The 3D
 * debug overlay shows the same points after the scene transform.
 */
export function MappingReport({ track }: { track: AvailableTrack }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="xs" variant="subtle" icon={<Ruler />} onClick={() => setOpen(true)}>
        Mapping report
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Circuit mapping report" width={860}>
        <Report track={track} />
      </Modal>
    </>
  );
}

function Report({ track }: { track: AvailableTrack }) {
  const v = track.validation;
  const { path, pts, box, start } = useMemo(() => {
    const xs = track.centreline.map((p) => p[0]);
    const ys = track.centreline.map((p) => p[1]);
    const minX = Math.min(...xs, ...track.debug_raw_points.x);
    const maxX = Math.max(...xs, ...track.debug_raw_points.x);
    const minY = Math.min(...ys, ...track.debug_raw_points.y);
    const maxY = Math.max(...ys, ...track.debug_raw_points.y);
    const pad = 40;
    // SVG y grows downward; source Y grows upward, so negate to keep the source orientation.
    const d = track.centreline.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${(-y).toFixed(1)}`).join('') + 'Z';
    const raw = track.debug_raw_points.x.map((x, i) => [x, -track.debug_raw_points.y[i]] as const);
    return { path: d, pts: raw, box: `${minX - pad} ${-maxY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`, start: track.centreline[0] };
  }, [track]);
  const rows: [string, string, string][] = [
    ['Clean laps used', `${v.laps_used} from ${v.drivers_used} drivers`, 'Green flag, no pit in/out, accurate timing, not deleted'],
    ['Centreline length', `${(v.length_m / 1000).toFixed(3)} km`, 'Closed polyline length'],
    ['Speed-integrated lap distance', v.speed_distance_m ? `${(v.speed_distance_m / 1000).toFixed(3)} km` : '—', 'Median ∫ speed dt over the same laps (independent of X/Y)'],
    ['Scale ratio', v.scale_ratio?.toFixed(4) ?? '—', 'Must be within 0.97–1.03'],
    ['Residuals (median / p95 / p99)', `${v.residual_median_m} / ${v.residual_p95_m} / ${v.residual_p99_m} m`, `${v.samples_checked.toLocaleString()} samples; p95 must be ≤ 20 m`],
    ['Direction consistency', `${(v.forward_share * 100).toFixed(2)}%`, 'Sample steps advancing along the centreline; must be ≥ 97%'],
    ['Closure gap', `${v.closure_gap_m} m`, 'Distance between first and last vertex; must be ≤ 30 m'],
    ['Lap-start spread', v.start_line_spread_m != null ? `${v.start_line_spread_m} m` : '—', '90th percentile distance of lap-start samples from the centreline start'],
    ['Corner reference', v.corner_reference_median_m != null ? `${v.corner_reference_median_m} m median` : '—', v.reference ?? 'No reference available (informational)'],
  ];
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_320px]">
      <figure className="rounded-md border border-line bg-bg p-2">
        <svg viewBox={box} className="mx-auto h-auto max-h-[56vh] w-full" role="img" aria-label="Recorded samples and centreline in the source frame">
          {pts.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={2.2} fill="#9fa4ae" opacity={0.5} />
          ))}
          <path d={path} fill="none" stroke="#e5383b" strokeWidth={3} strokeLinejoin="round" />
          <circle cx={start[0]} cy={-start[1]} r={14} fill="#3fb37f" />
        </svg>
        <figcaption className="mt-1 text-[10.5px] text-fg-3">
          Source frame (FastF1 X/Y ÷ 10 = metres), unrotated. Grey: every {track.debug_raw_points.stride}th recorded sample from the laps used. Red: derived centreline. Green: centreline start at the timing line. The
          replay applies one rotation of {track.rotation_deg}° ({track.rotation_source ?? 'none'}) and a translation to all of these and to every driver.
        </figcaption>
      </figure>
      <div className="flex flex-col gap-3 text-[12px]">
        <TrackBadge v={v} />
        <p className="text-fg-3">{track.method}</p>
        <dl className="flex flex-col gap-2">
          {rows.map(([k, val, hint]) => (
            <div key={k}>
              <dt className="flex justify-between gap-2">
                <span className="text-fg-2">{k}</span>
                <span className="num font-medium text-fg">{val}</span>
              </dt>
              <dd className="text-[10.5px] text-fg-3">{hint}</dd>
            </div>
          ))}
        </dl>
        {v.failures.length > 0 && (
          <ul className="rounded-md border border-[rgb(224_165_46/0.3)] bg-[rgb(224_165_46/0.06)] p-2 text-[11.5px] text-warn">
            {v.failures.map((f) => (
              <li key={f}>✗ {f}</li>
            ))}
          </ul>
        )}
        <p className="text-[10.5px] text-fg-3">The live-timing position feed reports cars on a racing line, so samples sit very close to the centreline; pit-lane and parked-car samples are excluded from the clean laps.</p>
      </div>
    </div>
  );
}
