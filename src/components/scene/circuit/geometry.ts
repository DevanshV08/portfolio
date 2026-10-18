import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { curvatureAt, getTrack, pointAt, tangentAt, TRACK_WIDTH } from "@/lib/lap";

/*
 * Geometry that follows the centre line. Offsets are lateral distances from
 * the centre, positive to the left of the direction of travel. Built once and
 * shared by every mount of the circuit.
 */

const HALF = TRACK_WIDTH / 2;
export const KERB = { inner: HALF, outer: HALF + 0.065 };
export const WALL = { offset: 1.0, height: 0.07 };
export const GANTRY = { postOffset: 0.69, clearance: 0.33 };

type Range = { from: number; to: number };

/**
 * A flat strip between two offsets. u across (0 at `a`, 1 at `b`), v along
 * the track in scene units times `vScale`, so textures repeat at a fixed size.
 */
export function strip(a: number, b: number, y: number, range: Range = { from: 0, to: 1 }, vScale = 1) {
  const { length } = getTrack();
  const n = Math.max(2, Math.ceil(((range.to - range.from) * length) / 0.08));
  const pos = new Float32Array((n + 1) * 6);
  const nor = new Float32Array((n + 1) * 6);
  const uv = new Float32Array((n + 1) * 4);
  const index: number[] = [];
  const p = { x: 0, z: 0 };
  const t = { x: 0, z: 0 };
  for (let i = 0; i <= n; i++) {
    const u = range.from + ((range.to - range.from) * i) / n;
    pointAt(u, p);
    tangentAt(u, t);
    // Left of travel: up × tangent.
    const nx = t.z;
    const nz = -t.x;
    pos.set([p.x + nx * a, y, p.z + nz * a, p.x + nx * b, y, p.z + nz * b], i * 6);
    nor.set([0, 1, 0, 0, 1, 0], i * 6);
    const v = (u - range.from) * length * vScale;
    uv.set([0, v, 1, v], i * 4);
    if (i < n) {
      const ai = 2 * i;
      index.push(ai, ai + 2, ai + 1, ai + 1, ai + 2, ai + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

/** A vertical strip (a barrier) at one offset. v along the track, u up. */
export function wall(offset: number, height: number, vScale = 1) {
  const { length } = getTrack();
  const n = Math.ceil(length / 0.08);
  const pos = new Float32Array((n + 1) * 6);
  const uv = new Float32Array((n + 1) * 4);
  const index: number[] = [];
  const p = { x: 0, z: 0 };
  const t = { x: 0, z: 0 };
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    pointAt(u, p);
    tangentAt(u, t);
    const x = p.x + t.z * offset;
    const z = p.z - t.x * offset;
    pos.set([x, 0, z, x, height, z], i * 6);
    const v = u * length * vScale;
    uv.set([v, 0, v, 1], i * 4);
    if (i < n) {
      const ai = 2 * i;
      index.push(ai, ai + 2, ai + 1, ai + 1, ai + 2, ai + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Stretches of the lap that turn tighter than `threshold` (1 / radius): where the kerbs go. */
function corners(threshold: number, pad: number): Range[] {
  const { length } = getTrack();
  const samples = Math.ceil(length / 0.2);
  const out: Range[] = [];
  let start = -1;
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const on = i < samples && curvatureAt(u) > threshold;
    if (on && start < 0) start = u;
    if (!on && start >= 0) {
      out.push({ from: start - pad / length, to: u + pad / length });
      start = -1;
    }
  }
  return out;
}

export type CircuitGeometry = {
  asphalt: THREE.BufferGeometry;
  lines: THREE.BufferGeometry;
  kerbs: THREE.BufferGeometry;
  walls: THREE.BufferGeometry;
  checker: THREE.BufferGeometry;
  grid: THREE.BufferGeometry;
};

let built: CircuitGeometry | null = null;

export function circuitGeometry(startLine: number): CircuitGeometry {
  if (built) return built;
  const { length } = getTrack();
  const line = 0.012;
  const lines = mergeGeometries([strip(-HALF, -HALF + line, 0.006), strip(HALF - line, HALF, 0.006)]);
  const kerbParts = corners(0.32, 0.5).flatMap((r) => [
    strip(-KERB.outer, -KERB.inner, 0.007, r, 1 / 0.18),
    strip(KERB.inner, KERB.outer, 0.007, r, 1 / 0.18),
  ]);
  const walls = mergeGeometries([wall(-WALL.offset, WALL.height, 1 / 0.8), wall(WALL.offset, WALL.height, 1 / 0.8)]);
  const checkerRange = { from: startLine - 0.045 / length, to: startLine + 0.045 / length };
  // Grid slot markings behind the line: short white bars either side of the car's slot.
  const slot = (u: number) => [
    strip(-0.24, -0.06, 0.007, { from: u - 0.004 / length, to: u + 0.004 / length }),
    strip(-0.24, -0.226, 0.007, { from: u - 0.004 / length, to: u + 0.32 / length }),
  ];
  built = {
    asphalt: strip(-HALF, HALF, 0.004, { from: 0, to: 1 }, 1 / 2.4),
    lines,
    kerbs: kerbParts.length ? mergeGeometries(kerbParts) : new THREE.BufferGeometry(),
    walls,
    checker: strip(-HALF, HALF, 0.008, checkerRange, 1 / (0.09 / 2)),
    grid: mergeGeometries([...slot(-0.3 / length), ...slot(-1.6 / length)]),
  };
  return built;
}

/** Minimum distance from (x, z) to the centre line, coarse. */
function distanceToTrack(x: number, z: number) {
  const { xz, count } = getTrack();
  let best = Infinity;
  for (let i = 0; i < count; i += 4) {
    const d = (xz[2 * i] - x) ** 2 + (xz[2 * i + 1] - z) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

let trees: { position: THREE.Vector3; scale: number; tint: number }[] | null = null;

/** Tree positions around (not on) the circuit, deterministic. */
export function treeLayout() {
  if (trees) return trees;
  const { bounds } = getTrack();
  let s = 99;
  const r = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  trees = [];
  const pad = 14;
  for (let i = 0; trees.length < 420 && i < 6000; i++) {
    const x = bounds.minX - pad + r() * (bounds.maxX - bounds.minX + 2 * pad);
    const z = bounds.minZ - pad + r() * (bounds.maxZ - bounds.minZ + 2 * pad);
    const d = distanceToTrack(x, z);
    // Clear of the track and its barriers, and thinner close in so sightlines stay open.
    if (d < 2.6 || (d < 5 && r() < 0.6)) continue;
    trees.push({ position: new THREE.Vector3(x, 0, z), scale: 0.75 + r() * 0.7, tint: r() });
  }
  return trees;
}
