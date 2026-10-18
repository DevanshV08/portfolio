"use client";

import { Environment, useEnvironment } from "@react-three/drei";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { site } from "@/content/site";
import { engineInput } from "@/lib/engine-audio";
import { flow } from "@/lib/flow";
import {
  drive,
  driveRate,
  driveSeconds,
  getLapPlan,
  getTrack,
  lapKmh,
  lapState,
  lapTarget,
  pointAt,
  tangentAt,
} from "@/lib/lap";
import { stage, useStage } from "@/lib/stage-store";
import { DRS_OPEN_ANGLE, FIGURINE_OFFSET_X, FULL_SIZE, SIDE_FRAME_X, fitFov, isWideFrame } from "../constants";
import { CAR_MODELS, type CarModel } from "../Figurine";
import { shot as flowShot } from "../FlowDirector";
import { applyLens, makeLens } from "../lens";
import { createFigurineMaterials } from "../materials";
import { lightUrl } from "../photo-backdrops";
import { GANTRY, circuitGeometry, treeLayout } from "./geometry";
import {
  BOARD,
  asphaltTexture,
  boardTextures,
  checkerTexture,
  crowdTexture,
  grassTexture,
  kerbTexture,
  wallTexture,
} from "./textures";

/*
 * The circuit for the lap: a procedural track in daylight with a gantry per
 * milestone. Scrolling drives the car round it; the camera follows like a TV
 * chase cam, shows the start lights on the grid and circles the car in parc
 * fermé once the lap is done. Geometry, materials and textures are built once
 * and shared across mounts (the root has dispose={null}).
 */

const SUN = new THREE.Vector3(-0.42, 0.62, -0.66).normalize();
/** Haze matching the sky's horizon. Scene renders it (fog has to attach to the scene itself). */
export const CIRCUIT_FOG = { color: "#c9dbea", near: 26, far: 150 } as const;
const UP = new THREE.Vector3(0, 1, 0);
/** Vertical field of view in parc fermé (behind the written coverage), degrees. */
const PARKED_FOV = 30;

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/* ---------- Shared assets ---------- */

type Assets = ReturnType<typeof buildAssets>;
let assets: Assets | null = null;

function buildAssets() {
  const plan = getLapPlan(site.lap.length);
  const geo = circuitGeometry(plan.startLine);
  const { bounds } = getTrack();
  const center = new THREE.Vector3((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);

  const grass = grassTexture().clone();
  grass.needsUpdate = true;
  grass.repeat.set(220, 220);
  const checker = checkerTexture();
  checker.repeat.set(2, 1);

  const decal = (offset: number, params: THREE.MeshStandardMaterialParameters) =>
    new THREE.MeshStandardMaterial({ polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset, ...params });

  const materials = {
    grass: new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }),
    asphalt: decal(-1, { map: asphaltTexture(), roughness: 0.92 }),
    lines: decal(-2, { color: "#f4f4f2", roughness: 0.6 }),
    kerbs: decal(-2, { map: kerbTexture(), roughness: 0.7 }),
    checker: decal(-3, { map: checker, roughness: 0.6 }),
    walls: new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.7, side: THREE.DoubleSide }),
    metal: new THREE.MeshStandardMaterial({ color: "#2b2f38", metalness: 0.6, roughness: 0.4 }),
    boardBack: new THREE.MeshStandardMaterial({ color: "#0b1128", roughness: 0.8 }),
    lampOn: new THREE.MeshStandardMaterial({ color: "#120000", emissive: "#ff0000", emissiveIntensity: 0, roughness: 0.4 }),
    tree: new THREE.MeshStandardMaterial({ roughness: 0.95 }),
    stand: new THREE.MeshStandardMaterial({ color: "#59606e", roughness: 0.85 }),
    crowd: new THREE.MeshStandardMaterial({ map: crowdTexture(), roughness: 1 }),
    roof: new THREE.MeshStandardMaterial({ color: "#e8eaee", roughness: 0.6, side: THREE.DoubleSide }),
  };

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(210, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        zenith: { value: new THREE.Color(0.13, 0.3, 0.66) },
        horizon: { value: new THREE.Color(0.58, 0.69, 0.8) },
        sun: { value: SUN },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 zenith;
        uniform vec3 horizon;
        uniform vec3 sun;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(horizon, zenith, pow(h, 0.5));
          float s = max(dot(d, sun), 0.0);
          col += vec3(1.0, 0.93, 0.8) * (pow(s, 1200.0) * 9.0 + pow(s, 14.0) * 0.18);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  );
  sky.position.copy(center);
  sky.frustumCulled = false;
  sky.renderOrder = -1;

  const ground = new THREE.Mesh(new THREE.CircleGeometry(200, 72), materials.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.position.copy(center);
  ground.receiveShadow = true;

  // Trees: one instanced cone mesh.
  const layout = treeLayout();
  const lower = new THREE.ConeGeometry(0.22, 0.5, 8).translate(0, 0.33, 0);
  const upper = new THREE.ConeGeometry(0.15, 0.42, 8).translate(0, 0.62, 0);
  const trunk = new THREE.CylinderGeometry(0.025, 0.035, 0.12, 6).translate(0, 0.06, 0);
  const pine = mergeGeometries([lower, upper, trunk]);
  const trees = new THREE.InstancedMesh(pine, materials.tree, layout.length);
  const m = new THREE.Matrix4();
  const colour = new THREE.Color();
  layout.forEach((t, i) => {
    m.compose(t.position, new THREE.Quaternion(), new THREE.Vector3(t.scale, t.scale * (0.9 + t.tint * 0.5), t.scale));
    trees.setMatrixAt(i, m);
    trees.setColorAt(i, colour.setHSL(0.29 + t.tint * 0.05, 0.38, 0.13 + t.tint * 0.07));
  });
  trees.castShadow = true;

  // Grandstand along the outside of the start straight.
  const stand = new THREE.Group();
  const tiers = 6;
  for (let i = 0; i < tiers; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(9, 0.07 * (i + 1), 0.13), materials.stand);
    step.position.set(-9, 0.035 * (i + 1), -1.62 - i * 0.13);
    const people = new THREE.Mesh(new THREE.PlaneGeometry(9, 0.06), materials.crowd);
    people.position.set(-9, 0.07 * (i + 1) + 0.03, -1.56 - i * 0.13);
    stand.add(step, people);
  }
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 1.05), materials.roof);
  roof.rotation.x = -Math.PI / 2 + 0.12;
  roof.position.set(-9, 0.78, -1.95);
  stand.add(roof);
  for (const x of [-13.4, -9, -4.6]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.78, 0.03), materials.metal);
    col.position.set(x, 0.39, -2.42);
    stand.add(col);
  }
  stand.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });

  const post = new THREE.BoxGeometry(0.035, GANTRY.clearance + BOARD.height + 0.06, 0.035);
  post.translate(0, (GANTRY.clearance + BOARD.height + 0.06) / 2, 0);
  const beam = new THREE.BoxGeometry(GANTRY.postOffset * 2 + 0.04, 0.035, 0.035);
  const frame = new THREE.BoxGeometry(BOARD.width + 0.03, BOARD.height + 0.03, 0.018);
  const board = new THREE.PlaneGeometry(BOARD.width, BOARD.height);
  const lamp = new THREE.SphereGeometry(0.022, 12, 8);
  const pod = new THREE.BoxGeometry(0.07, 0.13, 0.04);

  return { plan, geo, center, materials, sky, ground, trees, stand, shapes: { post, beam, frame, board, lamp, pod } };
}

const getAssets = () => (assets ??= buildAssets());

/** Placement at lap fraction u: position on the centre line and the turn that faces oncoming cars. */
function placeAt(u: number) {
  const p = pointAt(u);
  const t = tangentAt(u);
  return { position: [p.x, 0, p.z] as [number, number, number], facing: Math.atan2(-t.x, -t.z) };
}

/* ---------- Pieces ---------- */

const boardMaterials = new WeakMap<THREE.Texture, THREE.MeshBasicMaterial>();
function boardMaterial(texture: THREE.Texture) {
  let m = boardMaterials.get(texture);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: texture });
    boardMaterials.set(texture, m);
  }
  return m;
}

/** The board lights up (overbright, so it blooms) as its caption comes on screen, then settles. */
const FLASH_MS = 700;
const FLASH_PEAK = 0.6;

function Gantry({ index, u, texture }: { index: number; u: number; texture: THREE.Texture | null }) {
  const { materials, shapes } = getAssets();
  const { position, facing } = useMemo(() => placeAt(u), [u]);
  const face = texture ? boardMaterial(texture) : materials.boardBack;
  const y = GANTRY.clearance + BOARD.height / 2;
  const invalidate = useThree((s) => s.invalidate);
  /** When the flash started (ms), or -1. */
  const flash = useRef(-1);

  useEffect(() => {
    let caption = stage.get().lapIndex;
    return stage.subscribe(() => {
      const next = stage.get().lapIndex;
      if (next === caption) return;
      caption = next;
      if (next === index + 1) {
        flash.current = performance.now();
        invalidate();
      }
    });
  }, [index, invalidate]);

  useFrame(() => {
    if (flash.current < 0 || !texture) return;
    const board = boardMaterial(texture);
    const t = (performance.now() - flash.current) / FLASH_MS;
    if (t >= 1) {
      board.color.setScalar(1);
      flash.current = -1;
      return;
    }
    board.color.setScalar(1 + FLASH_PEAK * (1 - t) ** 2);
    invalidate();
  });

  return (
    <group position={position} rotation-y={facing}>
      {[-GANTRY.postOffset, GANTRY.postOffset].map((x) => (
        <mesh key={x} geometry={shapes.post} material={materials.metal} position-x={x} castShadow />
      ))}
      <mesh geometry={shapes.beam} material={materials.metal} position-y={GANTRY.clearance + BOARD.height + 0.04} castShadow />
      <mesh geometry={shapes.frame} material={materials.metal} position-y={y} castShadow />
      <mesh geometry={shapes.board} material={face} position={[0, y, 0.0105]} />
      <mesh geometry={shapes.board} material={materials.boardBack} position={[0, y, -0.0105]} rotation-y={Math.PI} />
    </group>
  );
}

/** The start/finish gantry: five pods of red lights that go out as the lap begins. */
function StartGantry({ u }: { u: number }) {
  const { materials, shapes } = getAssets();
  const { position, facing } = useMemo(() => placeAt(u), [u]);

  useFrame((state) => {
    // Red while the car waits on the grid; out the moment it launches.
    const on = lapState.u < 0.002 ? 1.25 : 0;
    // Read the shared material here rather than mutating a render-time value.
    const lamp = getAssets().materials.lampOn;
    if (lamp.emissiveIntensity !== on) {
      lamp.emissiveIntensity = on;
      state.invalidate();
    }
  });

  const y = GANTRY.clearance + 0.18;
  return (
    <group position={position} rotation-y={facing}>
      {[-GANTRY.postOffset, GANTRY.postOffset].map((x) => (
        <mesh key={x} geometry={shapes.post} material={materials.metal} position-x={x} castShadow />
      ))}
      <mesh geometry={shapes.beam} material={materials.metal} position-y={GANTRY.clearance + BOARD.height + 0.04} castShadow />
      {[-2, -1, 0, 1, 2].map((i) => (
        <group key={i} position={[i * 0.12, y, 0]}>
          <mesh geometry={shapes.pod} material={materials.metal} castShadow />
          <mesh geometry={shapes.lamp} material={materials.lampOn} position={[0, 0.03, 0.022]} />
          <mesh geometry={shapes.lamp} material={materials.lampOn} position={[0, -0.03, 0.022]} />
        </group>
      ))}
    </group>
  );
}

/** Fit for the lap: scale and offset so the car's nose points along +z with its wheels on the ground. */
function lapFit(spec: CarModel, model: THREE.Object3D) {
  if (spec.units === "figurine") {
    return { scale: 1, position: [FIGURINE_OFFSET_X, 0, 0] as [number, number, number], noseTurn: -Math.PI / 2 };
  }
  const box = new THREE.Box3().setFromObject(model);
  const s = 1 / FULL_SIZE;
  return {
    scale: s,
    position: [-s * (box.min.x + box.max.x) * 0.5, -s * box.min.y, -s * (box.min.z + box.max.z) * 0.5] as [
      number,
      number,
      number,
    ],
    noseTurn: 0,
  };
}

/** The car on the circuit: a copy of the hero car, placed at the lap position with spinning wheels and DRS. */
function LapCar() {
  const car = useStage((s) => s.car);
  const spec = CAR_MODELS[car];
  const gltf = useLoader(GLTFLoader, spec.url, (loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
  });
  const { model, fit, wheels, flap } = useMemo(() => {
    const model = gltf.scene.clone(true);
    if (spec.tunedMaterials) {
      const materials = createFigurineMaterials();
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          const name = (mesh.material as THREE.Material).name;
          if (materials[name]) mesh.material = materials[name];
        }
      });
    }
    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    const wheels = spec.wheels.nodes
      .map((n) => model.getObjectByName(n))
      .filter((o): o is THREE.Object3D => !!o)
      .map((node) => ({ node, base: node.quaternion.clone() }));
    const flapNode = model.getObjectByName(spec.flap.node);
    return {
      model,
      fit: lapFit(spec, model),
      wheels,
      flap: flapNode ? { node: flapNode, closed: flapNode.quaternion.clone() } : null,
    };
  }, [gltf, spec]);

  const root = useRef<THREE.Group>(null);
  const spin = useRef(0);
  const flapAngle = useRef(0);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const lastU = useRef<number | null>(null);

  useFrame((state, delta) => {
    const g = root.current;
    if (!g) return;
    const p = pointAt(lapState.u);
    const t = tangentAt(lapState.u);
    g.position.set(p.x, 0, p.z);
    g.rotation.y = Math.atan2(t.x, t.z) + fit.noseTurn;

    // Wheels roll with the distance covered (in the model's own units).
    const { length } = getTrack();
    const travelled = lastU.current === null ? 0 : (lapState.u - lastU.current) * length;
    lastU.current = lapState.u;
    spin.current += (travelled * FULL_SIZE * spec.wheels.sign) / spec.wheels.radius;
    for (const w of wheels) w.node.quaternion.copy(w.base).multiply(q.setFromAxisAngle(spec.wheels.axis, spin.current));

    // DRS opens on the fast stretches.
    if (flap) {
      const target = lapState.speed > 7 ? DRS_OPEN_ANGLE : 0;
      flapAngle.current += (target - flapAngle.current) * (1 - Math.exp(-12 * Math.min(delta, 1 / 30)));
      flap.node.quaternion.copy(flap.closed).multiply(q.setFromAxisAngle(spec.flap.axis, spec.flap.sign * flapAngle.current));
      if (Math.abs(target - flapAngle.current) > 1e-3) state.invalidate();
    }
  });

  return (
    <group ref={root}>
      <group position={fit.position} scale={fit.scale}>
        <primitive object={model} />
      </group>
    </group>
  );
}

type Drive = { from: number; to: number; start: number; duration: number };
type Director = {
  at: number;
  drive: Drive | null;
  /** When the car parked at `at` (s): it holds there before driving on. */
  parked: number;
  caption: number;
  heading: number;
};
/** Minimum time parked at a gantry before driving on to the next one, s: time to read. */
const DWELL = 2.4;
/** Lens for the parked reading frame and for the drive, vertical degrees on a wide screen. */
const READ_FOV = 36;
const DRIVE_FOV = 42;

const smoothstep = (a: number, b: number, x: number) => smooth((x - a) / (b - a));

/**
 * Directs the lap. Scroll only says which gantry to go to; the car then
 * drives there on its own clock, brakes and parks, and only then does the
 * caption come up. Parked, the camera holds a still reading frame: square-on
 * to the board, the board in the upper third and the car below it, clear of
 * the caption. Each drive is one continuous crane move: the camera holds and
 * pans as the car pulls away, swings out to ride alongside it, and settles
 * into the next reading frame as it brakes. Going back, or far ahead, is a
 * jump cut. In parc fermé (the written coverage) it circles the parked car.
 */
function LapRig() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const reduced = useStage((s) => s.reducedMotion);
  const lens = useRef(makeLens());
  const dir = useRef<Director | null>(null);
  /** The camera as it was last frame, for gentle smoothing and instant cuts. */
  const cam = useRef<{ pos: THREE.Vector3; look: THREE.Vector3 } | null>(null);
  const tmp = useMemo(
    () => ({
      car: new THREE.Vector3(),
      fwd: new THREE.Vector3(),
      left: new THREE.Vector3(),
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      fromPos: new THREE.Vector3(),
      fromLook: new THREE.Vector3(),
      toPos: new THREE.Vector3(),
      toLook: new THREE.Vector3(),
    }),
    [],
  );
  const { plan } = getAssets();
  const { length } = getTrack();
  /** The camera to the car last frame, metres at full size, for the engine's Doppler (-1: not yet heard). */
  const ear = useRef({ metres: -1 });

  // Off the lap (back to the opening shot): the engine sound fades out with it.
  useEffect(
    () => () => {
      engineInput.present = 0;
      engineInput.kmh = 0;
      engineInput.closing = 0;
    },
    [],
  );

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const { camera, size } = state;
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const { stops } = plan;
    const flag = stops.length - 1;
    const now = performance.now() / 1000;
    const { car, fwd, left, pos, look, a, b, fromPos, fromLook, toPos, toLook } = tmp;
    const aspect = size.width / Math.max(1, size.height);
    /** 0 on a wide screen, 1 on a phone held upright: the reading frame moves in and tilts down. */
    const portrait = Math.min(1, Math.max(0, (1.3 - aspect) / 0.75));

    /**
     * The still frame for stop k. At a gantry: on the board's own axis, behind the parked car,
     * aimed so the whole board sits in the upper third, square-on. On the grid: the start lights
     * above the car. At the flag: the car from ahead, the start/finish gantry behind it.
     */
    const frameFor = (k: number, outPos: THREE.Vector3, outLook: THREE.Vector3) => {
      const at = pointAt(stops[k]);
      const t = tangentAt(stops[k]);
      if (k === 0) {
        outPos.set(at.x - t.x * 1.2 + t.z * 0.12, 0.35, at.z - t.z * 1.2 - t.x * 0.12);
        outLook.set(at.x + t.x * 1.2, 0.22, at.z + t.z * 1.2);
        return;
      }
      if (k === flag) {
        outPos.set(at.x + t.x * 1.25 + t.z * 0.38, 0.22, at.z + t.z * 1.25 - t.x * 0.38);
        outLook.set(at.x, 0.07, at.z);
        return;
      }
      const g = pointAt(plan.gantries[k - 1]);
      const gt = tangentAt(plan.gantries[k - 1]);
      // Upright phones have little room between the track map and the caption: the camera rises to
      // board height and looks down, so the board sits under the map and the car just above the caption.
      const back = 2.65 - 0.05 * portrait;
      const height = 0.32 + 0.23 * portrait;
      const tilt = Math.tan(((2.5 + 12.5 * portrait) * Math.PI) / 180);
      outPos.set(g.x - gt.x * back, height, g.z - gt.z * back);
      outLook.set(g.x, height - tilt * back, g.z);
    };

    // ---------- Where to go: scroll picks the gantry, the director drives there ----------
    const reading = flow.dim > 0.3;
    const want = reading ? flag : lapTarget(plan, flow.lap);
    let cut = false;
    if (!dir.current) {
      dir.current = { at: want, drive: null, parked: -Infinity, caption: -2, heading: -2 };
      cut = true;
    }
    const d = dir.current;
    const startDrive = (fast: boolean) => {
      d.drive = { from: d.at, to: d.at + 1, start: now, duration: driveSeconds(plan, d.at) * (fast ? 0.6 : 1) };
    };
    if (!d.drive && want !== d.at) {
      if (reduced || reading || want < d.at) {
        // Back down the lap, or straight to the coverage: a jump cut, no reversing.
        d.at = want;
        d.parked = now;
        cut = true;
      } else if (want > d.at + 2) {
        // Far ahead: cut to the gantry before it and drive the last stretch.
        d.at = want - 1;
        cut = true;
        startDrive(false);
      } else if (want > d.at + 1 || now - d.parked >= DWELL) {
        // One gantry on: only once the caption has had time to be read.
        startDrive(want > d.at + 1);
      }
    }
    let t = 0;
    if (d.drive) {
      t = (now - d.drive.start) / d.drive.duration;
      if (t >= 1) {
        d.at = d.drive.to;
        d.drive = null;
        d.parked = now;
        // Scrolled well ahead already: keep going without stopping.
        if (want > d.at + 1 && !reading) {
          startDrive(true);
          t = 0;
        }
      }
    }
    lapState.u = d.drive ? stops[d.drive.from] + (stops[d.drive.to] - stops[d.drive.from]) * drive(t) : stops[d.at];
    // The car only moves on a drive (a cut is a jump, not a move), so its speed comes straight from the drive curve.
    lapState.speed = d.drive ? ((stops[d.drive.to] - stops[d.drive.from]) * length * driveRate(t)) / d.drive.duration : 0;
    lapState.cine += ((d.drive ? 1 : 0) - lapState.cine) * (1 - Math.exp(-dt * 4));
    if (lapState.cine < 0.002 && !d.drive) lapState.cine = 0;

    // The caption comes up once the car has stopped; while it drives, the bar shows where it's heading.
    const caption = d.drive ? -1 : d.at;
    const heading = d.drive ? d.drive.to : d.at;
    if (caption !== d.caption || heading !== d.heading) {
      d.caption = caption;
      d.heading = heading;
      stage.set({ lapIndex: caption, lapHeading: heading });
    }

    const p = pointAt(lapState.u);
    const tan = tangentAt(lapState.u);
    car.set(p.x, 0, p.z);
    fwd.set(tan.x, 0, tan.z);
    left.set(tan.z, 0, -tan.x);

    // ---------- Frame it ----------
    let fovBase = READ_FOV;
    if (!d.drive) {
      frameFor(d.at, pos, look);
      if (d.at === 0) fovBase = 40;
    } else {
      // One continuous move: hold and pan as the car pulls away, ride alongside, land on the next frame.
      frameFor(d.drive.from, fromPos, fromLook);
      frameFor(d.drive.to, toPos, toLook);
      fromLook.lerp(a.copy(car).addScaledVector(UP, 0.05), smoothstep(0, 0.22, t));
      const side = d.drive.from % 2 ? -1 : 1;
      // Riding three-quarters behind, a little out to the side.
      b.copy(car).addScaledVector(fwd, -0.95).addScaledVector(left, 0.42 * side).addScaledVector(UP, 0.24);
      a.copy(car).addScaledVector(fwd, 0.7).addScaledVector(UP, 0.06);
      const leave = smoothstep(0.1, 0.42, t);
      const arrive = smoothstep(0.6, 0.97, t);
      pos.copy(fromPos).lerp(b, leave).lerp(toPos, arrive);
      look.copy(fromLook).lerp(a, leave).lerp(toLook, arrive);
      fovBase = (d.drive.from === 0 ? 40 : READ_FOV) + (DRIVE_FOV - READ_FOV) * leave * (1 - arrive);
    }

    // Parc fermé: once the coverage scrolls in, circle the parked car with the page.
    const parked = smooth(flow.dim);
    if (parked > 0) {
      const angle = Math.PI * 0.8 - flowShot.yaw;
      a.set(Math.sin(angle) * 0.62, 0.17, Math.cos(angle) * 0.62).add(car);
      b.copy(car).addScaledVector(UP, 0.05);
      pos.lerp(a, parked);
      look.lerp(b, parked);
    }

    // Cuts are instant; otherwise a light smoothing takes the edge off.
    if (!cam.current || cut) {
      cam.current = { pos: pos.clone(), look: look.clone() };
    } else {
      const k = reduced ? 1 : 1 - Math.exp(-dt * 12);
      cam.current.pos.lerp(pos, k);
      cam.current.look.lerp(look, k);
    }
    camera.position.copy(cam.current.pos);
    camera.lookAt(cam.current.look);

    const fov = fitFov(aspect, fovBase + (PARKED_FOV - fovBase) * parked);
    const frameX = isWideFrame(size.width, size.height) ? SIDE_FRAME_X * parked : 0;
    applyLens(camera, lens.current, size.width, size.height, fov, frameX, 0.03, 260);

    // What the onboard audio hears: how fast the car is going, how far away it is (metres at full
    // size), whether it's closing on the camera or pulling away, and where it is across the screen.
    camera.updateMatrixWorld();
    const metres = camera.position.distanceTo(car) * FULL_SIZE;
    const heard = ear.current;
    engineInput.kmh = lapKmh(lapState.speed);
    engineInput.present = 1 - parked;
    engineInput.closing = cut || heard.metres < 0 ? 0 : (heard.metres - metres) / Math.max(delta, 1e-3);
    engineInput.distance = metres;
    a.copy(car).addScaledVector(UP, 0.05).project(camera);
    engineInput.pan = a.z < 1 ? Math.min(1, Math.max(-1, a.x)) : 0;
    heard.metres = metres;

    // The sun's shadow box follows the car.
    const light = sun.current;
    if (light) {
      light.position.copy(car).addScaledVector(SUN, 6);
      light.target.position.copy(car);
      light.target.updateMatrixWorld();
    }

    const settling =
      d.drive !== null ||
      // Parked but already asked to move on: keep ticking until the dwell is up.
      want !== d.at ||
      cut ||
      lapState.cine > 0 ||
      cam.current.pos.distanceToSquared(pos) > 1e-9 ||
      cam.current.look.distanceToSquared(look) > 1e-9;
    if (settling) state.invalidate();
  }, -1);

  return (
    <directionalLight
      ref={sun}
      castShadow
      intensity={2.3}
      color="#fff1dc"
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.0004}
      shadow-normalBias={0.015}
    >
      <orthographicCamera attach="shadow-camera" args={[-2.2, 2.2, 2.2, -2.2, 0.5, 14]} />
    </directionalLight>
  );
}

/** The circuit set. */
export default function Circuit() {
  const a = getAssets();
  const env = useEnvironment({ files: lightUrl("straight") });
  const [boards, setBoards] = useState<THREE.Texture[] | null>(null);

  useEffect(() => {
    let live = true;
    boardTextures(site.lap).then((t) => {
      if (live) setBoards(t);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <group dispose={null}>
      <Environment map={env} environmentIntensity={0.55} />
      <hemisphereLight args={["#d4e6ff", "#3f5c2c", 0.7]} />
      <LapRig />

      <primitive object={a.sky} />
      <primitive object={a.ground} />
      <mesh geometry={a.geo.asphalt} material={a.materials.asphalt} receiveShadow />
      <mesh geometry={a.geo.lines} material={a.materials.lines} receiveShadow />
      <mesh geometry={a.geo.kerbs} material={a.materials.kerbs} receiveShadow />
      <mesh geometry={a.geo.checker} material={a.materials.checker} receiveShadow />
      <mesh geometry={a.geo.grid} material={a.materials.lines} receiveShadow />
      <mesh geometry={a.geo.walls} material={a.materials.walls} castShadow receiveShadow />
      <primitive object={a.trees} />
      <primitive object={a.stand} />

      <StartGantry u={a.plan.startLine} />
      {a.plan.gantries.map((u, i) => (
        <Gantry key={i} index={i} u={u} texture={boards?.[i] ?? null} />
      ))}

      <LapCar />
    </group>
  );
}

/** Starts fetching the circuit's lighting before it's needed. */
export function preloadCircuit() {
  useEnvironment.preload({ files: lightUrl("straight") });
}
