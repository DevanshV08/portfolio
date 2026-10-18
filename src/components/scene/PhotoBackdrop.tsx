"use client";

import { ContactShadows, Environment, useEnvironment } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GroundedSkybox } from "three/examples/jsm/objects/GroundedSkybox.js";
import type { PhotoBackdropId } from "@/lib/backdrops";
import { stage, useStage } from "@/lib/stage-store";
import { BASE } from "./constants";
import {
  PHOTO_BACKDROPS,
  lightUrl,
  photoCameraPosition,
  photoYaw,
  skyFaceSize,
  skyUrls,
  sunDirection,
} from "./photo-backdrops";

/** 90 m at full size. Has to stay inside the camera's far plane. */
const SKY_RADIUS = 5;

/**
 * The photo on the ground-projected dome. The dome is centred where the photo
 * was taken, so each vertex's position is also its direction in the photo.
 * It writes depth, so depth of field and ambient occlusion treat the
 * projected ground as a real floor: sharp at the car, softer further away.
 */
const SKY_SHADER = {
  vertexShader: /* glsl */ `
    varying vec3 vDirection;
    void main() {
      vDirection = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform samplerCube sky;
    uniform float brightness;
    varying vec3 vDirection;
    void main() {
      vec3 d = normalize(vDirection);
      // The same x flip three.js applies to cube textures; build_backdrops.py matches it.
      // Faces store y = x / (1 + x); decoded radiance is capped at 16.
      vec3 y = min(textureCube(sky, vec3(-d.x, d.y, d.z)).rgb, vec3(16.0 / 17.0));
      gl_FragColor = vec4(y / (1.0 - y) * brightness, 1.0);
    }
  `,
};

/**
 * A real place behind the car: the 360° photo lights and reflects in the car,
 * and is projected onto a ground plane the car stands on, seen from exactly
 * where it was taken. The sunlit photos add the sun's shadow.
 */
export default function PhotoBackdrop({ id }: { id: PhotoBackdropId }) {
  const backdrop = PHOTO_BACKDROPS[id];
  const [faceSize] = useState(skyFaceSize);
  const env = useEnvironment({ files: lightUrl(id) });
  const [sky] = useLoader(THREE.CubeTextureLoader, [skyUrls(id, faceSize)]);

  const phase = useStage((s) => s.phase);
  const instant = useStage((s) => s.reducedMotion || s.skipIntro);
  const level = useRef(0);
  const dome = useRef<THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>>(null);

  const yaw = photoYaw(backdrop.look);
  const eye = useMemo(() => photoCameraPosition(backdrop.eyeHeight), [backdrop.eyeHeight]);
  const geometry = useMemo(() => {
    // Only the geometry: GroundedSkybox's own material expects a flat panorama.
    const grounded = new GroundedSkybox(sky, eye.y - BASE.height, SKY_RADIUS, 128);
    grounded.material.dispose();
    return grounded.geometry;
  }, [sky, eye]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        ...SKY_SHADER,
        uniforms: { sky: { value: sky }, brightness: { value: 0 } },
      }),
    [sky],
  );
  const sun = useMemo(
    () => (backdrop.sun ? sunDirection(backdrop.sun, yaw).multiplyScalar(1.2).toArray() : null),
    [backdrop.sun, yaw],
  );

  useEffect(() => {
    stage.set({ backdropReady: true });
    return () => stage.set({ backdropReady: false });
  }, []);

  // Dim while the start lights are on, full daylight at lights out.
  useFrame((state, dt) => {
    const target = phase === "loading" ? 0 : 1;
    level.current = instant ? target : THREE.MathUtils.damp(level.current, target, 2.2, dt);
    const brightness = backdrop.exposure * (0.12 + 0.88 * level.current);
    state.scene.environmentIntensity = brightness;
    if (dome.current) dome.current.material.uniforms.brightness.value = brightness;
  });

  return (
    <>
      <Environment map={env} environmentRotation={[0, yaw, 0]} />

      <mesh ref={dome} geometry={geometry} material={material} position={eye.toArray()} rotation-y={yaw} />

      <ContactShadows
        position={[0, BASE.height + 0.0004, 0]}
        scale={0.7}
        far={0.06}
        blur={2.2}
        opacity={backdrop.contactShadow}
        resolution={512}
        frames={Infinity}
      />

      {sun && (
        <>
          {/* Shadow only: the photo already carries the sun's light. */}
          <directionalLight castShadow intensity={0} position={sun} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}>
            <orthographicCamera attach="shadow-camera" args={[-0.3, 0.3, 0.3, -0.3, 0.1, 3]} />
          </directionalLight>
          <mesh rotation-x={-Math.PI / 2} position={[0, BASE.height + 0.0002, 0]} receiveShadow>
            <planeGeometry args={[1.2, 1.2]} />
            <shadowMaterial transparent opacity={0.6} depthWrite={false} />
          </mesh>
        </>
      )}
    </>
  );
}
