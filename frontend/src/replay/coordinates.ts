/**
 * Source → scene coordinate transformation. One transform per session, shared by
 * the track, every driver marker and the debug overlay, so relative positions are
 * preserved exactly.
 *
 * Source frame: FastF1 X/Y position data in decimetres (1/10 m). The transform is
 * a similarity transform only — uniform scale (dm → m), translation to the circuit
 * centre and the circuit's official display rotation — so shape is never distorted.
 * Scene frame (three.js): x = east-ish, y = up, z = −(rotated source y). Elevation
 * (source Z) is ignored: the scene is flat by design.
 */

export interface Transform {
  /** Rotation centre in source metres. */
  cx: number;
  cy: number;
  cos: number;
  sin: number;
  rotationDeg: number;
}

export const DECIMETRES_PER_METRE = 10;

export function createTransform(centrelineMetres: [number, number][], rotationDeg: number): Transform {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of centrelineMetres) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const r = (rotationDeg * Math.PI) / 180;
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, cos: Math.cos(r), sin: Math.sin(r), rotationDeg };
}

export interface ScenePoint {
  x: number;
  z: number;
}

/** Source metres → scene metres. */
export function metresToScene(t: Transform, xm: number, ym: number, out: ScenePoint = { x: 0, z: 0 }): ScenePoint {
  const dx = xm - t.cx;
  const dy = ym - t.cy;
  out.x = dx * t.cos - dy * t.sin;
  out.z = -(dx * t.sin + dy * t.cos);
  return out;
}

/** Source decimetres (raw location samples) → scene metres. */
export function decimetresToScene(t: Transform, xdm: number, ydm: number, out: ScenePoint = { x: 0, z: 0 }): ScenePoint {
  return metresToScene(t, xdm / DECIMETRES_PER_METRE, ydm / DECIMETRES_PER_METRE, out);
}

/** Scene extent of a set of source-metre points, for camera framing. */
export function sceneBounds(t: Transform, pts: [number, number][]) {
  const p = { x: 0, z: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, y] of pts) {
    metresToScene(t, x, y, p);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return { minX, maxX, minZ, maxZ, radius: Math.max(maxX - minX, maxZ - minZ) / 2, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
}
