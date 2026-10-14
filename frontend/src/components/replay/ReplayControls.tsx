import { useMemo } from 'react';
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import type { SessionInfo, TrackStatusRow } from '@/services/api/types';
import { pause, play, seek, setSpeed, SPEEDS, useClock, useReplayTime } from '@/replay/clock';
import { initialReplayTime } from '@/replay/useReplay';
import type { LoaderState } from '@/replay/loader';
import { formatClock } from '@/utils/format';
import { cn } from '@/utils/cn';
import { IconButton } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';

const STATUS_BANDS: Record<string, { label: string; color: string }> = {
  '2': { label: 'Yellow flag', color: 'rgb(224 165 46 / 0.35)' },
  '4': { label: 'Safety car', color: 'rgb(224 165 46 / 0.7)' },
  '5': { label: 'Red flag', color: 'rgb(229 72 77 / 0.75)' },
  '6': { label: 'Virtual safety car', color: 'rgb(224 165 46 / 0.5)' },
  '7': { label: 'VSC ending', color: 'rgb(224 165 46 / 0.4)' },
};

interface Props {
  info: SessionInfo;
  lap: number | null;
  trackStatus?: TrackStatusRow[];
  progress: LoaderState | null;
  className?: string;
}

/** Historical replay transport. Scrubbing pauses playback; it resumes only on Play. */
export function ReplayControls({ info, lap, trackStatus, progress, className }: Props) {
  const playing = useClock((s) => s.playing);
  const speed = useClock((s) => s.speed);
  const t = useReplayTime(8);
  const { first_sample: start, last_sample: end } = info.timeline;
  const span = end - start;
  const pct = (v: number) => `${((v - start) / span) * 100}%`;
  const t0 = useMemo(() => new Date(info.t0_utc), [info.t0_utc]);
  const wall = new Date(t0.getTime() + t * 1000);

  const bands = useMemo(() => {
    const rows = (trackStatus ?? []).filter((r) => r.time != null).sort((a, b) => a.time! - b.time!);
    return rows.flatMap((r, i) => {
      const band = r.status ? STATUS_BANDS[r.status] : undefined;
      if (!band) return [];
      const until = rows[i + 1]?.time ?? end;
      return [{ from: r.time!, to: until, ...band }];
    });
  }, [trackStatus, end]);

  const loadedPct = progress && progress.total ? Math.round((progress.loaded / progress.total) * 100) : 0;

  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-surface px-3 py-2', className)}>
      <div className="flex items-center gap-0.5">
        <IconButton size="sm" label="Back 10 seconds" onClick={() => seek(t - 10)}>
          <SkipBack />
        </IconButton>
        <IconButton size="sm" variant="subtle" label={playing ? 'Pause' : 'Play'} onClick={() => (playing ? pause() : play())}>
          {playing ? <Pause /> : <Play />}
        </IconButton>
        <IconButton size="sm" label="Forward 10 seconds" onClick={() => seek(t + 10)}>
          <SkipForward />
        </IconButton>
        <IconButton
          size="sm"
          label={info.kind === 'race' ? 'Reset to lights out' : 'Reset to the first recorded sample'}
          onClick={() => {
            pause();
            seek(initialReplayTime(info));
          }}
        >
          <RotateCcw />
        </IconButton>
      </div>

      <div className="num min-w-[150px] text-[12px] leading-tight">
        <div className="text-fg">
          {lap ? (
            <>
              Lap <span className="font-semibold">{lap}</span>
              {info.total_laps && info.kind === 'race' ? <span className="text-fg-3">/{info.total_laps}</span> : null}
              <span className="mx-1.5 text-fg-3">·</span>
            </>
          ) : null}
          <span title="FastF1 SessionTime (time since the session's data feed started)">{formatClock(t)}</span>
        </div>
        <div className="text-[10.5px] text-fg-3" title="Wall-clock time, UTC">
          {wall.toISOString().slice(11, 19)} UTC
        </div>
      </div>

      <div className="relative order-last flex min-w-[200px] flex-1 items-center sm:order-none">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2">
          {bands.map((b, i) => (
            <span key={i} title={b.label} className="absolute top-0 h-full rounded-sm" style={{ left: pct(b.from), width: `${((b.to - b.from) / span) * 100}%`, background: b.color }} />
          ))}
        </div>
        <input
          type="range"
          className="range relative"
          aria-label="Replay position"
          aria-valuetext={`${formatClock(t)} session time${lap ? `, lap ${lap}` : ''}`}
          min={start}
          max={end}
          step={0.5}
          value={Math.min(end, Math.max(start, t))}
          onPointerDown={() => pause()}
          onKeyDown={() => pause()}
          onChange={(e) => seek(Number(e.target.value))}
          style={{ ['--fill' as string]: pct(t) }}
        />
      </div>

      <Segmented label="Playback speed" size="xs" value={speed} onChange={setSpeed} options={SPEEDS.map((s) => ({ value: s, label: `${s}×`, title: `${s}× real time` }))} />

      {progress && progress.loaded < progress.total && (
        <span className="text-[10.5px] text-fg-3" title="Location samples are downloaded in time windows, nearest to the replay position first">
          {progress.error ? <span className="text-warn">Download paused: {progress.error}</span> : `Loading locations ${loadedPct}%`}
        </span>
      )}
    </div>
  );
}
