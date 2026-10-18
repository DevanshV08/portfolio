/**
 * "The lap": a closed circuit the car drives as the page scrolls, with a
 * gantry for each milestone. Pure math with no three.js, so the page (the
 * track map, the captions) and the 3D scene share one definition.
 *
 * Units are the scene's: the car is about 0.3 long (1:18), the track 0.67 wide.
 */

/** Control points (x, z) before scaling: a main straight, a hairpin, esses, a long sweeper, a back hairpin, a chicane and a fast final corner. */
const CONTROL: readonly (readonly [number, number])[] = [
  [-30, 0], [-10, 0], [10, 0], [30, 0],
  [40, 3], [42, 12], [34, 17],
  [22, 16], [14, 22], [16, 31],
  [26, 37], [38, 40], [44, 50], [36, 59],
  [22, 58], [12, 50], [0, 47],
  [-10, 51], [-16, 57], [-26, 55],
  [-36, 46], [-42, 32], [-40, 16], [-34, 5],
];
const SCALE = 0.42;
/** Spacing of the resampled centre line. */
const STEP = 0.08;

export const TRACK_WIDTH = 0.67;

type Track = {
  /** Centre line resampled at equal arc length, x and z interleaved. */
  xz: Float64Array;
  count: number;
  length: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
};

let cached: Track | null = null;

/** Centripetal Catmull-Rom between p1 and p2 (alpha 0.5: no cusps or self-loops). */
function span(
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
  p3: readonly [number, number],
  n: number,
  out: number[],
) {
  const knot = (t: number, a: readonly [number, number], b: readonly [number, number]) =>
    t + Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1])) ** 0.5;
  const t0 = 0;
  const t1 = knot(t0, p0, p1);
  const t2 = knot(t1, p1, p2);
  const t3 = knot(t2, p2, p3);
  for (let i = 0; i < n; i++) {
    const t = t1 + ((t2 - t1) * i) / n;
    const mix = (a: readonly [number, number], b: readonly [number, number], ta: number, tb: number): [number, number] => [
      ((tb - t) / (tb - ta)) * a[0] + ((t - ta) / (tb - ta)) * b[0],
      ((tb - t) / (tb - ta)) * a[1] + ((t - ta) / (tb - ta)) * b[1],
    ];
    const a1 = mix(p0, p1, t0, t1);
    const a2 = mix(p1, p2, t1, t2);
    const a3 = mix(p2, p3, t2, t3);
    const b1 = mix(a1, a2, t0, t2);
    const b2 = mix(a2, a3, t1, t3);
    const c = mix(b1, b2, t1, t2);
    out.push(c[0], c[1]);
  }
}

export function getTrack(): Track {
  if (cached) return cached;
  const pts = CONTROL.map(([x, z]) => [x * SCALE, z * SCALE] as const);
  const dense: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    span(pts[(i - 1 + pts.length) % pts.length], pts[i], pts[(i + 1) % pts.length], pts[(i + 2) % pts.length], 60, dense);
  }
  // Arc length along the dense loop, then resample at equal spacing.
  const n = dense.length / 2;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    cum[i + 1] = cum[i] + Math.hypot(dense[2 * j] - dense[2 * i], dense[2 * j + 1] - dense[2 * i + 1]);
  }
  const length = cum[n];
  const count = Math.ceil(length / STEP);
  const xz = new Float64Array(count * 2);
  let k = 0;
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let s = 0; s < count; s++) {
    const d = (s / count) * length;
    while (cum[k + 1] < d) k++;
    const f = (d - cum[k]) / Math.max(1e-9, cum[k + 1] - cum[k]);
    const j = (k + 1) % n;
    const x = dense[2 * k] + (dense[2 * j] - dense[2 * k]) * f;
    const z = dense[2 * k + 1] + (dense[2 * j + 1] - dense[2 * k + 1]) * f;
    xz[2 * s] = x;
    xz[2 * s + 1] = z;
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minZ = Math.min(bounds.minZ, z);
    bounds.maxZ = Math.max(bounds.maxZ, z);
  }
  cached = { xz, count, length, bounds };
  return cached;
}

const wrap = (u: number) => u - Math.floor(u);

/** Point on the centre line at lap fraction u (any real number; wraps every lap). */
export function pointAt(u: number, out: { x: number; z: number } = { x: 0, z: 0 }) {
  const { xz, count } = getTrack();
  const f = wrap(u) * count;
  const i = Math.floor(f) % count;
  const j = (i + 1) % count;
  const t = f - Math.floor(f);
  out.x = xz[2 * i] + (xz[2 * j] - xz[2 * i]) * t;
  out.z = xz[2 * i + 1] + (xz[2 * j + 1] - xz[2 * i + 1]) * t;
  return out;
}

/** Unit direction of travel at u. */
export function tangentAt(u: number, out: { x: number; z: number } = { x: 0, z: 0 }) {
  const { length } = getTrack();
  const e = 0.15 / length;
  const a = pointAt(u - e);
  const b = pointAt(u + e);
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  out.x = (b.x - a.x) / len;
  out.z = (b.z - a.z) / len;
  return out;
}

/** 1 / corner radius at u (0 on a straight). */
export function curvatureAt(u: number) {
  const { length } = getTrack();
  const e = 0.6 / length;
  const a = tangentAt(u - e);
  const b = tangentAt(u + e);
  const turn = Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);
  return Math.abs(turn) / 1.2;
}

/* ---------- The lap plan: where the gantries stand and where the car pauses ---------- */

/** The car stops this far short of each gantry, so the board is in full view. */
const DWELL_GAP = 1.55;
/** The start gantry stands this far ahead of the grid slot. */
const START_GAP = 1.1;

export type LapPlan = {
  /** Milestone gantries. */
  count: number;
  /** Lap fraction of the start/finish line. */
  startLine: number;
  /** Lap fraction of each gantry. */
  gantries: number[];
  /** Where the car rests at each caption: the grid, before each gantry, past the finish. */
  stops: number[];
};

const plans = new Map<number, LapPlan>();

export function getLapPlan(count: number): LapPlan {
  const hit = plans.get(count);
  if (hit) return hit;
  const { length } = getTrack();
  const startLine = START_GAP / length;
  const spacing = 1 / (count + 1);
  const gantries: number[] = [];
  for (let i = 1; i <= count; i++) {
    // Evenly spaced, nudged to the straightest spot nearby so each board faces the approach squarely.
    const target = startLine + i * spacing;
    let best = target;
    let bestK = Infinity;
    for (let d = -0.35; d <= 0.35; d += 0.05) {
      const u = target + d * spacing;
      const k = curvatureAt(u - DWELL_GAP / length) + curvatureAt(u);
      if (k < bestK) {
        bestK = k;
        best = u;
      }
    }
    gantries.push(best);
  }
  const stops = [0, ...gantries.map((g) => g - DWELL_GAP / length), 1 + startLine + 0.9 / length];
  const plan = { count, startLine, gantries, stops };
  plans.set(count, plan);
  return plan;
}

/**
 * The milestone that scroll progress p (0 to 1 through the lap section) asks
 * for: 0 the grid, 1..count the gantries, count + 1 the flag. Scroll only
 * picks the destination; the scene then drives there on its own clock, so the
 * car always arrives and stops properly however fast or slowly you scroll.
 */
export function lapTarget(plan: LapPlan, p: number) {
  const segments = plan.count + 1;
  // Moving on takes a deliberate half-step of scroll past a gantry's mark, not a nudge.
  return Math.min(segments, Math.max(0, Math.floor(Math.min(1, Math.max(0, p)) * segments + 0.5)));
}

/** Drive time between two stops, seconds: long enough to watch, short enough to keep the pace. */
export function driveSeconds(plan: LapPlan, from: number) {
  const { length } = getTrack();
  const distance = (plan.stops[from + 1] - plan.stops[from]) * length;
  return Math.min(3.4, Math.max(2.4, 1.2 + distance * 0.17));
}

/** Smootherstep: pulls away gently, flat out in the middle, brakes into the stop. */
export const drive = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/** How fast `drive` moves at t: its derivative, so the car's speed is exact rather than measured between frames. */
export const driveRate = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return 30 * x * x * (1 - x) * (1 - x);
};

/** The car's speed for the HUD and the engine sound, km/h: scene units per second eased into a race-car range. */
export const lapKmh = (speed: number) => 330 * (1 - Math.exp(-Math.max(0, speed) / 6));

/** Where the car actually is; written by the 3D scene every frame and read by the track map and HUD. */
export const lapState = {
  u: 0,
  /** Scene units per second. */
  speed: 0,
  /** 0 parked at a gantry, 1 out on a drive: the letterbox and vignette follow it. */
  cine: 0,
};

/** The circuit as an SVG path inside a width x height box, plus a projector for lap fractions. */
export function trackOutline(width: number, height: number, pad: number) {
  const { xz, count, bounds } = getTrack();
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxZ - bounds.minZ;
  const s = Math.min((width - 2 * pad) / w, (height - 2 * pad) / h);
  const ox = (width - w * s) / 2 - bounds.minX * s;
  const oz = (height - h * s) / 2 - bounds.minZ * s;
  const project = (u: number) => {
    const p = pointAt(u);
    return { x: p.x * s + ox, y: p.z * s + oz };
  };
  let d = "";
  for (let i = 0; i < count; i += 6) {
    d += `${i === 0 ? "M" : "L"}${(xz[2 * i] * s + ox).toFixed(1)} ${(xz[2 * i + 1] * s + oz).toFixed(1)}`;
  }
  return { d: `${d}Z`, project };
}
