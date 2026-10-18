"use client";

import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useStage } from "@/lib/stage-store";
import { BASE } from "./constants";

const BACKDROP = "#05070f";

/** A soft pool of light on a seamless dark floor, like a spot in a product studio. */
function useFloorCanvas() {
  return useMemo(() => {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const pool = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      pool.addColorStop(0, "#181d31");
      pool.addColorStop(0.08, "#0e1224");
      pool.addColorStop(0.22, BACKDROP);
      pool.addColorStop(1, BACKDROP);
      ctx.fillStyle = pool;
      ctx.fillRect(0, 0, size, size);
    }
    return canvas;
  }, []);
}

/**
 * Product-photography studio: softboxes rendered into the environment map
 * (they're what the clear coat reflects), a seamless floor and contact
 * shadows. The studio sits dim while the start lights are on and lights up
 * at lights out.
 */
export default function Studio() {
  const phase = useStage((s) => s.phase);
  const instant = useStage((s) => s.reducedMotion || s.skipIntro);
  const key = useRef<THREE.DirectionalLight>(null);
  const floorMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const level = useRef(0);
  const floor = useFloorCanvas();

  useFrame((state, dt) => {
    const target = phase === "loading" ? 0 : 1;
    level.current = instant ? target : THREE.MathUtils.damp(level.current, target, 2.2, dt);
    state.scene.environmentIntensity = 0.12 + 0.88 * level.current;
    if (key.current) key.current.intensity = 0.15 + 1.35 * level.current;
    floorMaterial.current?.color.setScalar(0.3 + 0.7 * level.current);
  });

  // Shadows only need re-rendering while things move (the case lifting).
  const shadowFrames = phase === "live" ? 1 : Infinity;

  return (
    <>
      <Environment resolution={256} frames={1}>
        {/* Overhead softbox, two side strips, a low front fill and two colour accents. */}
        <Lightformer form="rect" intensity={4} scale={[1.6, 0.5, 1]} position={[0, 1.4, 0]} rotation-x={Math.PI / 2} />
        <Lightformer form="rect" intensity={2} scale={[1.2, 0.34, 1]} position={[-1.1, 0.45, 0.4]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={2} scale={[1.2, 0.34, 1]} position={[1.1, 0.45, -0.4]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.4} scale={[2.2, 0.28, 1]} position={[0, 0.25, 1.4]} target={[0, 0, 0]} />
        <Lightformer form="circle" intensity={1.6} color="#f5c400" scale={0.4} position={[-0.8, 0.9, -1.2]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.2} color="#6f7cff" scale={[1, 0.4, 1]} position={[0.9, 0.6, 1.1]} target={[0, 0, 0]} />
      </Environment>

      <directionalLight ref={key} position={[0.6, 1.2, 0.5]} intensity={0.15} />

      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[3, 64]} />
        <meshBasicMaterial ref={floorMaterial}>
          <canvasTexture attach="map" args={[floor]} colorSpace={THREE.SRGBColorSpace} />
        </meshBasicMaterial>
      </mesh>

      <ContactShadows
        position={[0, 0.0005, 0]}
        scale={0.9}
        far={0.18}
        blur={2.6}
        opacity={0.75}
        resolution={1024}
        frames={shadowFrames}
      />
      <ContactShadows
        position={[0, BASE.height + 0.0006, 0]}
        scale={[BASE.length, BASE.depth]}
        far={0.07}
        blur={1.6}
        opacity={0.8}
        resolution={1024}
        frames={shadowFrames}
      />
    </>
  );
}
