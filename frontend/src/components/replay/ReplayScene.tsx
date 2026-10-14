import { useEffect, useLayoutEffect, useMemo, useRef, type ComponentRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { Driver } from '@/services/api/types';
import { decimetresToScene, metresToScene, type Transform } from '@/replay/coordinates';
import type { MarkerState, ReplayEngine } from '@/replay/engine';
import { replayClock } from '@/replay/clock';
import type { CameraView } from '@/state/settings';

/** Per-frame marker results shared with the DOM label overlay (no React renders). */
export interface MarkerFrame {
  driver: string;
  state: MarkerState;
  /** Scene position actually drawn (last real sample for gaps), null when hidden. */
  world: THREE.Vector3 | null;
  screen: { x: number; y: number } | null;
}

export interface CameraApi {
  reset(): void;
  zoom(factor: number): void;
}

const TRACK_HALF_WIDTH = 7;
const DOT_PX = 7;
const MARKER_LIFT = 0.14;
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const BG = new THREE.Color('#09090b');
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** Four parallel rails (broadcast-style circuit outline), crisp opaque lines. */
const TRACK = {
  rails: ['#eceef2', '#c4c9d4', '#9ca3af', '#6b7280'] as const,
  start: '#f9fafb',
} as const;
const RAIL_FRAC = [0.78, 0.28, -0.28, -0.78] as const;

/** Parallel rail lines and start line from the derived centreline. */
export function TrackMesh({ centreline, transform }: { centreline: [number, number][]; transform: Transform }) {
  const geo = useMemo(() => {
    const n = centreline.length;
    const pts = centreline.map(([x, y]) => metresToScene(transform, x, y));
    const rails: number[][] = RAIL_FRAC.map(() => []);
    const normals: { nx: number; nz: number }[] = [];
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n];
      const b = pts[(i + 1) % n];
      const tx = b.x - a.x;
      const tz = b.z - a.z;
      const len = Math.hypot(tx, tz) || 1;
      normals.push({ nx: -tz / len, nz: tx / len });
    }
    pts.forEach((p, i) => {
      const { nx, nz } = normals[i];
      RAIL_FRAC.forEach((frac, ri) => {
        const w = TRACK_HALF_WIDTH * frac;
        rails[ri].push(p.x + nx * w, 0.06, p.z + nz * w);
      });
    });
    const loop = (arr: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([...arr, arr[0], arr[1], arr[2]], 3));
      return g;
    };
    const { nx, nz } = normals[0];
    const p0 = pts[0];
    const start = new THREE.BufferGeometry();
    start.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [p0.x + nx * (TRACK_HALF_WIDTH + 2.5), 0.07, p0.z + nz * (TRACK_HALF_WIDTH + 2.5), p0.x - nx * (TRACK_HALF_WIDTH + 2.5), 0.07, p0.z - nz * (TRACK_HALF_WIDTH + 2.5)],
        3,
      ),
    );
    return {
      start,
      lines: rails.map((rail, i) => new THREE.Line(loop(rail), new THREE.LineBasicMaterial({ color: TRACK.rails[i] }))),
    };
  }, [centreline, transform]);

  useEffect(
    () => () => {
      geo.start.dispose();
      geo.lines.forEach((l) => (l.geometry.dispose(), (l.material as THREE.Material).dispose()));
    },
    [geo],
  );

  return (
    <group>
      {geo.lines.map((l, i) => (
        <primitive key={i} object={l} />
      ))}
      <lineSegments geometry={geo.start}>
        <lineBasicMaterial color={TRACK.start} />
      </lineSegments>
    </group>
  );
}

/** Recorded debug points and the centreline, both through the same transform. */
export function DebugLayer({ raw, centreline, transform }: { raw: { x: number[]; y: number[] }; centreline: [number, number][]; transform: Transform }) {
  const geo = useMemo(() => {
    const p = { x: 0, z: 0 };
    const pos: number[] = [];
    for (let i = 0; i < raw.x.length; i++) {
      metresToScene(transform, raw.x[i], raw.y[i], p);
      pos.push(p.x, 0.3, p.z);
    }
    const pts = new THREE.BufferGeometry();
    pts.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const cl: number[] = [];
    for (const [x, y] of [...centreline, centreline[0]]) {
      metresToScene(transform, x, y, p);
      cl.push(p.x, 0.4, p.z);
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(cl, 3));
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#e5383b' }));
    const s = metresToScene(transform, centreline[0][0], centreline[0][1]);
    return { pts, line, start: new THREE.Vector3(s.x, 0.5, s.z) };
  }, [raw, centreline, transform]);
  useEffect(() => () => (geo.pts.dispose(), geo.line.geometry.dispose(), (geo.line.material as THREE.Material).dispose()), [geo]);
  return (
    <group>
      <points geometry={geo.pts}>
        <pointsMaterial color="#9fa4ae" size={2} sizeAttenuation={false} />
      </points>
      <primitive object={geo.line} />
      <mesh position={geo.start} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[6, 24]} />
        <meshBasicMaterial color="#3fb37f" />
      </mesh>
    </group>
  );
}

interface DotsProps {
  engine: ReplayEngine | null;
  drivers: Driver[];
  transform: Transform;
  selected: string | null;
  hovered: string | null;
  onHover: (d: string | null) => void;
  onSelect: (d: string) => void;
  frames: RefObject<MarkerFrame[]>;
}

/** Broadcast-style flat markers on the racing line (F1 driver tracker look). */
export function DriverDots({ engine, drivers, transform, selected, hovered, onHover, onSelect, frames }: DotsProps) {
  const fill = useRef<THREE.InstancedMesh>(null);
  const ring = useRef<THREE.InstancedMesh>(null);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;
  const count = drivers.length;
  const geos = useMemo(() => {
    const fillGeo = new THREE.CircleGeometry(0.84, 40);
    const ringGeo = new THREE.RingGeometry(0.84, 1, 40);
    return { fillGeo, ringGeo };
  }, []);
  useEffect(
    () => () => {
      geos.fillGeo.dispose();
      geos.ringGeo.dispose();
    },
    [geos],
  );

  useLayoutEffect(() => {
    frames.current = drivers.map((d) => ({ driver: d.driver_number, state: { kind: 'no-data' }, world: null, screen: null }));
  }, [drivers, frames]);

  useFrame(() => {
    const f = fill.current;
    const r = ring.current;
    if (!f || !r) return;
    const tMs = replayClock.time * 1000;
    const target = controls?.target ?? new THREE.Vector3();
    const dist = camera.position.distanceTo(target);
    const worldPerPx = (2 * dist * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, size.height);
    const p = { x: 0, z: 0 };
    drivers.forEach((d, i) => {
      const fr = frames.current![i];
      const state: MarkerState = engine ? engine.stateAt(d.driver_number, tMs) : { kind: 'loading' };
      fr.state = state;
      let x: number | null = null;
      let y = 0;
      let dim = false;
      if (state.kind === 'ok') {
        decimetresToScene(transform, state.x, state.y, p);
        x = p.x;
        y = p.z;
      } else if (state.kind === 'gap' && state.lastSampleT != null && engine) {
        // Hold at the last genuine sample, drawn faded; never moved to an invented point.
        const prev = engine.stateAt(d.driver_number, state.lastSampleT);
        if (prev.kind === 'ok') {
          decimetresToScene(transform, prev.x, prev.y, p);
          x = p.x;
          y = p.z;
          dim = true;
        }
      }
      if (x === null) {
        f.setMatrixAt(i, HIDDEN);
        r.setMatrixAt(i, HIDDEN);
        fr.world = null;
        fr.screen = null;
        return;
      }
      // Fixed screen size for every driver — selection only changes ring colour, not position or scale.
      const rad = DOT_PX * worldPerPx;
      const lift = MARKER_LIFT + i * 0.0008;
      _v.set(x, lift, y);
      _m.compose(_v, _q, _s.setScalar(rad));
      f.setMatrixAt(i, _m);
      _m.compose(_v, _q, _s.setScalar(rad * 1.12));
      r.setMatrixAt(i, _m);
      _c.set(d.team_color);
      if (dim || (state.kind === 'ok' && !state.onTrack)) _c.lerp(BG, 0.4);
      f.setColorAt(i, _c);
      _c.set(d.driver_number === selected ? '#ffffff' : '#f1f5f9');
      if (dim) _c.lerp(BG, 0.35);
      r.setColorAt(i, _c);
      fr.world = (fr.world ?? new THREE.Vector3()).set(x, lift, y);
      _v.set(x, lift, y).project(camera);
      fr.screen = _v.z < 1 ? { x: ((_v.x + 1) / 2) * size.width, y: ((1 - _v.y) / 2) * size.height } : null;
    });
    f.instanceMatrix.needsUpdate = true;
    r.instanceMatrix.needsUpdate = true;
    if (f.instanceColor) f.instanceColor.needsUpdate = true;
    if (r.instanceColor) r.instanceColor.needsUpdate = true;
    f.computeBoundingSphere();
  });

  const id = (e: { instanceId?: number }) => (e.instanceId != null ? drivers[e.instanceId]?.driver_number : undefined);

  return (
    <group>
      <instancedMesh ref={ring} args={[geos.ringGeo, undefined, count]} frustumCulled={false} renderOrder={1}>
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh
        ref={fill}
        args={[geos.fillGeo, undefined, count]}
        frustumCulled={false}
        renderOrder={2}
        onPointerMove={(e) => {
          e.stopPropagation();
          const d = id(e);
          if (d && d !== hovered) onHover(d);
        }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => {
          e.stopPropagation();
          const d = id(e);
          if (d) onSelect(d);
        }}
      >
        <meshBasicMaterial />
      </instancedMesh>
    </group>
  );
}

interface RigProps {
  mode: CameraView;
  radius: number;
  centre: { x: number; z: number };
  followIndex: number;
  frames: RefObject<MarkerFrame[]>;
  apiRef: RefObject<CameraApi | null>;
  sessionId: string;
}

/** F1-style top-down tracker map, free 3D orbit, or follow the selected driver. */
export function CameraRig({ mode, radius, centre, followIndex, frames, apiRef, sessionId }: RigProps) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const touched = useRef(false);
  const fly = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  const home = () => {
    const fov = (camera.fov * Math.PI) / 180;
    const aspect = size.width / Math.max(1, size.height);
    const dist = (radius / Math.tan(fov / 2)) * Math.max(1.05, mode === 'tracker' ? 1.08 / aspect : 1.22 / aspect);
    const target = new THREE.Vector3(centre.x, 0, centre.z);
    if (mode === 'tracker') {
      return { pos: new THREE.Vector3(centre.x, dist, centre.z), target };
    }
    const dir = new THREE.Vector3(0, 1, 0.42).normalize();
    return { pos: target.clone().addScaledVector(dir, dist), target };
  };

  const followTarget = () => frames.current?.[followIndex]?.world ?? null;

  useEffect(() => {
    if (mode === 'follow' || touched.current) return;
    const h = home();
    camera.position.copy(h.pos);
    camera.far = radius * 20;
    camera.updateProjectionMatrix();
    controls.current?.target.copy(h.target);
    controls.current?.update();
    fly.current = null;
  }, [size.width, size.height, radius, centre.x, centre.z, sessionId, mode]);

  /** Reframe only when the camera mode changes — not when the selected driver changes. */
  useEffect(() => {
    touched.current = false;
    if (mode === 'tracker' || mode === 'orbit') fly.current = home();
  }, [mode]);

  /** In follow mode, snap to the selected driver when entering follow or picking another driver. */
  useEffect(() => {
    if (mode !== 'follow') return;
    const w = followTarget();
    if (!w) return;
    fly.current = { pos: w.clone().add(new THREE.Vector3(0, radius * 0.35, radius * 0.25)), target: w.clone() };
  }, [mode, followIndex]);

  apiRef.current = {
    reset() {
      touched.current = false;
      const w = followTarget();
      fly.current = mode === 'follow' && w ? { pos: w.clone().add(new THREE.Vector3(0, radius * 0.35, radius * 0.25)), target: w.clone() } : home();
    },
    zoom(factor) {
      const c = controls.current;
      if (!c) return;
      touched.current = true;
      fly.current = null;
      _v.copy(camera.position).sub(c.target);
      _v.setLength(Math.min(radius * 8, Math.max(40, _v.length() * factor)));
      camera.position.copy(c.target).add(_v);
      c.update();
    },
  };

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const k = 1 - Math.exp(-dt * 4);
    if (mode === 'follow') {
      const w = followTarget();
      if (w) {
        if (fly.current) fly.current.target.copy(w);
        else {
          _v.copy(w).sub(c.target);
          c.target.add(_v);
          camera.position.add(_v);
        }
      }
    }
    if (fly.current) {
      camera.position.lerp(fly.current.pos, k);
      c.target.lerp(fly.current.target, k);
      if (camera.position.distanceTo(fly.current.pos) < 1 && c.target.distanceTo(fly.current.target) < 1) fly.current = null;
    }
    c.update();
  });

  const tracker = mode === 'tracker';

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      enableRotate
      enablePan
      minDistance={tracker ? radius * 0.35 : 40}
      maxDistance={radius * 8}
      minPolarAngle={0.08}
      maxPolarAngle={Math.PI * 0.48}
      screenSpacePanning
      onStart={() => {
        touched.current = true;
        fly.current = null;
      }}
    />
  );
}
