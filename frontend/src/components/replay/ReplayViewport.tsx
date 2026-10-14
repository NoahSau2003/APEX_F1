import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bug, Crosshair, Eye, Minus, Plus, RotateCcw, Tag } from 'lucide-react';
import type { Driver, Track } from '@/services/api/types';
import { createTransform, sceneBounds } from '@/replay/coordinates';
import type { ReplayEngine } from '@/replay/engine';
import { useReplayTime } from '@/replay/clock';
import type { TimingRow } from '@/replay/timing';
import { updateSettings, useSettings, type CameraView } from '@/state/settings';
import { formatClock, formatLapTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import { IconButton } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { CameraRig, DebugLayer, DriverDots, TrackMesh, type CameraApi, type MarkerFrame } from './ReplayScene';

type AvailableTrack = Extract<Track, { available: true }>;

interface Props {
  sessionId: string;
  track: AvailableTrack;
  drivers: Driver[];
  engine: ReplayEngine | null;
  timing: Map<string, TimingRow>;
  selected: string | null;
  onSelect: (d: string | null) => void;
  hud?: ReactNode;
  className?: string;
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

class Boundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    if (this.state.error)
      return <div className="flex size-full items-center justify-center p-6 text-center text-[12.5px] text-warn">3D rendering failed: {this.state.error}</div>;
    return this.props.children;
  }
}

/** Interactive historical replay: derived circuit + one dot per driver. */
export function ReplayViewport({ sessionId, track, drivers, engine, timing, selected, onSelect, hud, className }: Props) {
  const defaultMode = useSettings((s) => s.cameraView);
  const allLabels = useSettings((s) => s.driverLabels);
  const debug = useSettings((s) => s.debugTrack);
  const [mode, setMode] = useState<CameraView>(defaultMode);
  const [hovered, setHovered] = useState<string | null>(null);
  const frames = useRef<MarkerFrame[]>([]);
  const apiRef = useRef<CameraApi | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const transform = useMemo(() => createTransform(track.centreline, track.rotation_deg), [track]);
  const bounds = useMemo(() => sceneBounds(transform, track.centreline), [transform, track]);
  const webgl = useMemo(webglAvailable, []);
  const followIndex = drivers.findIndex((d) => d.driver_number === selected);
  const effectiveMode: CameraView = mode === 'follow' && followIndex >= 0 ? 'follow' : 'overview';

  useEffect(() => setHovered(null), [sessionId]);

  if (!webgl)
    return (
      <div className={cn('flex items-center justify-center p-6 text-center text-[12.5px] text-fg-3', className)}>
        WebGL is not available in this browser, so the 3D replay cannot be shown. Timing and telemetry panels still work.
      </div>
    );

  return (
    <div ref={container} className={cn('relative isolate min-h-0 overflow-hidden bg-bg', className)} onPointerLeave={() => setHovered(null)}>
      <Boundary>
        <Canvas
          dpr={[1, 2]}
          gl={{ antialias: true }}
          camera={{ fov: 36, near: 1, far: bounds.radius * 20, position: [bounds.cx, bounds.radius * 2.5, bounds.cz + bounds.radius] }}
          onPointerMissed={() => onSelect(null)}
          className="touch-none"
          aria-label="3D historical replay"
        >
          <color attach="background" args={['#0b0c0e']} />
          <mesh rotation-x={-Math.PI / 2} position={[bounds.cx, -0.5, bounds.cz]}>
            <planeGeometry args={[bounds.radius * 12, bounds.radius * 12]} />
            <meshBasicMaterial color="#101215" />
          </mesh>
          <TrackMesh centreline={track.centreline} transform={transform} />
          {debug && <DebugLayer raw={track.debug_raw_points} centreline={track.centreline} transform={transform} />}
          <DriverDots
            engine={engine}
            drivers={drivers}
            transform={transform}
            selected={selected}
            hovered={hovered}
            onHover={setHovered}
            onSelect={(d) => onSelect(d === selected ? null : d)}
            frames={frames}
          />
          <CameraRig mode={effectiveMode} radius={bounds.radius} centre={{ x: bounds.cx, z: bounds.cz }} followIndex={followIndex} frames={frames} apiRef={apiRef} sessionId={sessionId} />
        </Canvas>
      </Boundary>

      <Labels frames={frames} drivers={drivers} selected={selected} hovered={hovered} all={allLabels} container={container} timing={timing} />

      {hud && <div className="pointer-events-none absolute top-2.5 left-2.5 z-10 flex max-w-[70%] flex-col items-start gap-1.5 [&>*]:pointer-events-auto">{hud}</div>}

      <div className="absolute top-2.5 right-2.5 z-10 flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-1 rounded-md border border-line bg-surface/90 p-0.5 shadow-lg backdrop-blur-sm">
          <Segmented
            label="Camera"
            size="xs"
            value={effectiveMode}
            onChange={setMode}
            className="border-0 bg-transparent p-0"
            options={[
              { value: 'overview', label: <Eye />, title: 'Overview camera — orbit, pan, zoom' },
              { value: 'follow', label: <Crosshair />, title: selected ? 'Follow the selected driver' : 'Select a driver to follow', disabled: !selected },
            ]}
          />
        </div>
        <div className="flex flex-col rounded-md border border-line bg-surface/90 p-0.5 shadow-lg backdrop-blur-sm">
          <IconButton size="sm" label="Zoom in" onClick={() => apiRef.current?.zoom(0.75)}>
            <Plus />
          </IconButton>
          <IconButton size="sm" label="Zoom out" onClick={() => apiRef.current?.zoom(1.33)}>
            <Minus />
          </IconButton>
          <IconButton size="sm" label="Reset camera" onClick={() => apiRef.current?.reset()}>
            <RotateCcw />
          </IconButton>
          <IconButton size="sm" label={allLabels ? 'Show abbreviations on hover/selection only' : 'Show all abbreviations'} active={allLabels} onClick={() => updateSettings({ driverLabels: !allLabels })}>
            <Tag />
          </IconButton>
          <IconButton size="sm" label={debug ? 'Hide mapping debug overlay' : 'Show mapping debug overlay (recorded points + centreline)'} active={debug} onClick={() => updateSettings({ debugTrack: !debug })}>
            <Bug />
          </IconButton>
        </div>
      </div>

      {debug && (
        <div className="pointer-events-none absolute bottom-2.5 left-2.5 z-10 rounded-md border border-line bg-surface/90 px-2 py-1.5 text-[10.5px] text-fg-2 backdrop-blur-sm">
          <span className="mr-3 inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-[#9fa4ae]" /> Recorded samples (every {track.debug_raw_points.stride}th, mapped)
          </span>
          <span className="mr-3 inline-flex items-center gap-1">
            <span className="h-0.5 w-3 bg-accent" /> Derived centreline
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-good" /> Centreline start (timing line)
          </span>
        </div>
      )}
    </div>
  );
}

const STATE_TEXT: Record<string, string> = {
  loading: 'Location data for this time is still downloading',
  'no-data': 'No location samples recorded at this time',
};

/** DOM labels positioned from the scene each frame; tooltip kept inside the viewport. */
function Labels({
  frames,
  drivers,
  selected,
  hovered,
  all,
  container,
  timing,
}: {
  frames: React.RefObject<MarkerFrame[]>;
  drivers: Driver[];
  selected: string | null;
  hovered: string | null;
  all: boolean;
  container: React.RefObject<HTMLDivElement | null>;
  timing: Map<string, TimingRow>;
}) {
  const chips = useRef<(HTMLDivElement | null)[]>([]);
  const tip = useRef<HTMLDivElement>(null);
  useReplayTime(4); // refresh tooltip text

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const fs = frames.current ?? [];
      const w = container.current?.clientWidth ?? 0;
      const h = container.current?.clientHeight ?? 0;
      drivers.forEach((d, i) => {
        const el = chips.current[i];
        const s = fs[i]?.screen;
        const show = !!s && (all || d.driver_number === selected || d.driver_number === hovered);
        if (el) {
          el.style.display = show ? '' : 'none';
          if (s) el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)`;
        }
        if (tip.current && d.driver_number === hovered) {
          if (!s) tip.current.style.display = 'none';
          else {
            tip.current.style.display = '';
            const tw = tip.current.offsetWidth;
            const th = tip.current.offsetHeight;
            const x = Math.min(Math.max(8, s.x + 14), w - tw - 8);
            const y = s.y + 14 + th > h - 8 ? s.y - th - 14 : s.y + 14;
            tip.current.style.transform = `translate(${Math.round(x)}px, ${Math.round(Math.max(8, y))}px)`;
          }
        }
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frames, drivers, selected, hovered, all, container]);

  const hd = drivers.find((d) => d.driver_number === hovered);
  const hi = drivers.findIndex((d) => d.driver_number === hovered);
  const st = hi >= 0 ? frames.current?.[hi]?.state : undefined;
  const row = hovered ? timing.get(hovered) : undefined;

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      {drivers.map((d, i) => {
        const sel = d.driver_number === selected;
        return (
          <div key={d.driver_number} ref={(el) => void (chips.current[i] = el)} className="absolute top-0 left-0" style={{ display: 'none' }}>
            <span
              className={cn(
                'absolute -translate-x-1/2 -translate-y-[calc(100%+9px)] rounded-[3px] border px-1 font-mono text-[10.5px] leading-4 font-semibold whitespace-nowrap shadow-md',
                sel ? 'border-white/70 bg-white text-black' : 'border-black/50 bg-[#0d0e10]/90 text-white',
              )}
            >
              {d.abbreviation ?? d.driver_number}
            </span>
          </div>
        );
      })}
      {hd && (
        <div ref={tip} className="absolute top-0 left-0 w-56 rounded-md border border-line-strong bg-surface-2/95 px-2.5 py-2 text-[11.5px] shadow-xl backdrop-blur-sm" style={{ display: 'none' }}>
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full border border-black/40" style={{ background: hd.team_color }} />
            <span className="font-mono font-semibold">{hd.abbreviation}</span>
            <span className="num text-fg-3">#{hd.driver_number}</span>
            {row?.position != null && <span className="num ml-auto font-semibold">P{row.position}</span>}
          </div>
          <div className="mt-0.5 truncate text-fg">{hd.full_name}</div>
          <div className="truncate text-fg-3">
            {hd.team_name}
            {!hd.team_color_official && ' · fallback colour'}
          </div>
          {row && (
            <div className="num mt-1.5 grid grid-cols-2 gap-x-2 text-fg-2">
              <span>Lap {row.lap || '—'}</span>
              <span className="text-right">Last {formatLapTime(row.lastLap?.lap_time)}</span>
            </div>
          )}
          <div className="mt-1.5 border-t border-line pt-1 text-[10.5px] text-fg-3">
            {st?.kind === 'ok'
              ? st.interpolated
                ? `Between recorded samples (last at ${formatClock(st.sampleT / 1000)})`
                : `Recorded sample at ${formatClock(st.sampleT / 1000)}`
              : st?.kind === 'gap'
                ? `No samples since ${st.lastSampleT != null ? formatClock(st.lastSampleT / 1000) : '—'} — shown faded at last recorded position`
                : st
                  ? STATE_TEXT[st.kind]
                  : ''}
            {st?.kind === 'ok' && !st.onTrack && ' · reported off track'}
          </div>
        </div>
      )}
    </div>
  );
}
