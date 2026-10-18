"use client";

import { useFrame, useLoader, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { CarId } from "@/lib/cars";
import { flow } from "@/lib/flow";
import { stage, useStage } from "@/lib/stage-store";
import { BASE, DRS_OPEN_ANGLE, DRS_SPEED, FIGURINE_OFFSET_X, FULL_SIZE, REAR_WING_HIT } from "./constants";
import { shot } from "./FlowDirector";
import { createFigurineMaterials } from "./materials";
import { turntable } from "./turntable";

export type CarModel = {
  url: string;
  /** Node that moves when DRS opens, the axis it turns about (its own) and the direction that opens it. */
  flap: { node: string; axis: THREE.Vector3; sign: 1 | -1 };
  /** Swap in the tuned web materials by material name (only the built car's names match). */
  tunedMaterials: boolean;
  /**
   * How the file sits in the scene. "built" is already a 1:18 figurine, nose
   * to +x. "real-size" is a full-size car in metres, nose to +z: it's turned,
   * scaled to 1:18 and stood on the base.
   */
  units: "figurine" | "real-size";
  /** Wheel nodes for the lap: each spins about its own `axis` (sign gives forward rolling); radius in the model's own units. */
  wheels: { nodes: string[]; axis: THREE.Vector3; sign: 1 | -1; radius: number };
};

export const CAR_MODELS: Record<CarId, CarModel> = {
  built: {
    url: "/models/rb9.glb",
    flap: { node: "drs_flap", axis: new THREE.Vector3(0, 0, 1), sign: 1 },
    tunedMaterials: true,
    units: "figurine",
    wheels: { nodes: ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"], axis: new THREE.Vector3(0, 0, 1), sign: -1, radius: 0.334 },
  },
  // "Red Bull RB9" by JUST GAME on Sketchfab, used exactly as downloaded.
  downloaded: {
    url: "/models/rb9-sketchfab.glb",
    flap: { node: "x1_rearwingmoving_top", axis: new THREE.Vector3(1, 0, 0), sign: -1 },
    tunedMaterials: false,
    units: "real-size",
    wheels: { nodes: ["WHEEL_LF", "WHEEL_RF", "WHEEL_LR", "WHEEL_RR"], axis: new THREE.Vector3(1, 0, 0), sign: 1, radius: 0.33 },
  },
};

/** Turn, scale and offset that put a real-size model (nose to +z) on the base like the figurine. */
function fitRealSize(model: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(model);
  const s = 1 / FULL_SIZE;
  return {
    scale: s,
    // After a quarter turn about y, the model's z becomes x and its x becomes -z.
    position: [-s * (box.min.z + box.max.z) * 0.5, -s * box.min.y, s * (box.min.x + box.max.x) * 0.5] as [
      number,
      number,
      number,
    ],
  };
}

/** The RB9 on its display: loads the chosen model and animates the DRS flap. */
export default function Figurine() {
  const car = useStage((s) => s.car);
  return <CarOnStage key={car} spec={CAR_MODELS[car]} />;
}

function CarOnStage({ spec }: { spec: CarModel }) {
  const gltf = useLoader(
    GLTFLoader,
    spec.url,
    (loader) => {
      loader.setMeshoptDecoder(MeshoptDecoder);
    },
    (event) => {
      if (event.total) stage.set({ progress: event.loaded / event.total });
    },
  );
  const model = gltf.scene;
  const materials = useMemo(() => createFigurineMaterials(), []);
  const fit = useMemo(() => (spec.units === "real-size" ? fitRealSize(model) : null), [model, spec.units]);
  const flap = useRef<{ node: THREE.Object3D; closed: THREE.Quaternion } | null>(null);
  const flapAngle = useRef(0);

  useLayoutEffect(() => {
    const node = model.getObjectByName(spec.flap.node);
    flap.current = node ? { node, closed: node.quaternion.clone() } : null;
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Only the sunlit photo backdrops have a shadow-casting light.
      mesh.castShadow = true;
      if (!spec.tunedMaterials) return;
      const name = (mesh.material as THREE.Material).name;
      if (materials[name]) mesh.material = materials[name];
    });
  }, [model, materials, spec]);

  // No explicit dispose: the materials live as long as the canvas, and
  // disposing them in an effect cleanup breaks React's development double
  // mount (the scene keeps using them).

  // Compile shaders before the reveal so the fly-in doesn't stutter.
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    let cancelled = false;
    gl.compileAsync(scene, camera)
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) stage.set({ loaded: true, progress: 1 });
      });
    return () => {
      cancelled = true;
    };
  }, [gl, scene, camera]);

  const drsOpen = useStage((s) => s.drsOpen);
  const reduced = useStage((s) => s.reducedMotion);
  const live = useStage((s) => s.phase === "live");
  const onTurntable = useStage((s) => s.backdrop !== "studio");
  const heading = useRef<THREE.Group>(null);
  const turn = useMemo(() => new THREE.Quaternion(), []);

  useFrame((state, dt) => {
    // In the studio the car stays square to its display base (the camera circles
    // it instead); on a photo backdrop it turns on the spot, by hand and with the page.
    if (heading.current) heading.current.rotation.y = onTurntable ? turntable.yaw + shot.yaw : 0;

    const drs = flap.current;
    if (!drs) return;
    // DRS zone: the flap also opens while the page is scrolled fast.
    const open = drsOpen || (!reduced && flow.speed > DRS_SPEED);
    const target = open ? DRS_OPEN_ANGLE : 0;
    const k = reduced ? 1 : 1 - Math.exp(-14 * Math.min(dt, 1 / 30));
    flapAngle.current += (target - flapAngle.current) * k;
    turn.setFromAxisAngle(spec.flap.axis, spec.flap.sign * flapAngle.current);
    drs.node.quaternion.copy(drs.closed).multiply(turn);
    if (Math.abs(target - flapAngle.current) > 1e-3) state.invalidate();
  });

  const hitMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    [],
  );

  const toggleDrs = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    // A drag that started on the wing turns the car; it isn't a tap.
    if (event.delta > 4) return;
    stage.set({ drsOpen: !stage.get().drsOpen });
  };

  return (
    <group ref={heading} position={[0, BASE.height, 0]}>
      <group position-x={fit ? 0 : FIGURINE_OFFSET_X}>
        {fit ? (
          <group position={fit.position}>
            <group rotation-y={Math.PI / 2} scale={fit.scale}>
              <primitive object={model} />
            </group>
          </group>
        ) : (
          <primitive object={model} />
        )}
        {live && (
          <mesh
            position={REAR_WING_HIT.position}
            material={hitMaterial}
            onClick={toggleDrs}
            onPointerOver={() => {
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
              document.body.style.cursor = "";
            }}
          >
            <boxGeometry args={REAR_WING_HIT.size} />
          </mesh>
        )}
      </group>
    </group>
  );
}
