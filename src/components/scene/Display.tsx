"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { site } from "@/content/site";
import { useStage } from "@/lib/stage-store";
import { BASE, CASE, easeInOutCubic } from "./constants";

const PLAQUE = { width: 0.13, height: 0.017 };

/** The case's edges catch a little light; kept faint so they don't read as a wireframe. */
const EDGE_OPACITY = 0.16;

/** Brushed-aluminium plaque drawn with the page's own display font. */
function usePlaqueTexture(title: string, subtitle: string) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: THREE.CanvasTexture | null = null;

    document.fonts.ready.then(() => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = Math.round((1024 * PLAQUE.height) / PLAQUE.width);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const metal = ctx.createLinearGradient(0, 0, 0, canvas.height);
      metal.addColorStop(0, "#dfe2e7");
      metal.addColorStop(0.55, "#b1b5bc");
      metal.addColorStop(1, "#cfd2d8");
      ctx.fillStyle = metal;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let y = 0; y < canvas.height; y += 1) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.07})`;
        ctx.fillRect(0, y, canvas.width, 1);
      }

      const family =
        getComputedStyle(document.documentElement).getPropertyValue("--font-display-face").trim() ||
        "sans-serif";
      ctx.fillStyle = "#23262d";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${Math.round(canvas.height * 0.4)}px ${family}`;
      ctx.fillText(title.toUpperCase(), canvas.width / 2, canvas.height * 0.36);
      ctx.font = `600 ${Math.round(canvas.height * 0.22)}px ${family}`;
      ctx.fillText(subtitle.toUpperCase(), canvas.width / 2, canvas.height * 0.76);

      created = new THREE.CanvasTexture(canvas);
      created.colorSpace = THREE.SRGBColorSpace;
      created.anisotropy = 8;
      setTexture(created);
    });

    return () => {
      cancelled = true;
      created?.dispose();
    };
  }, [title, subtitle]);

  return texture;
}

/** Piano-black display base, engraved plaque and the acrylic case that lifts at lights out. */
export default function Display() {
  const phase = useStage((s) => s.phase);
  const instant = useStage((s) => s.reducedMotion || s.skipIntro);
  const plaque = usePlaqueTexture("2013 · No. 1", `Collection of ${site.name}`);

  const caseGroup = useRef<THREE.Group>(null);
  const acrylic = useRef<THREE.MeshPhysicalMaterial>(null);
  const edges = useRef<THREE.LineBasicMaterial>(null);
  const lift = useRef(0);
  // Only used to derive the edge lines; never rendered, so nothing to free on the GPU.
  const edgeSource = useMemo(() => new THREE.BoxGeometry(CASE.length, CASE.height, CASE.depth), []);

  useFrame((_, dt) => {
    const target = phase === "loading" ? 0 : 1;
    if (instant) lift.current = target;
    else if (target > lift.current) lift.current = Math.min(1, lift.current + dt / 1.6);
    else lift.current = Math.max(0, lift.current - dt * 2);

    const e = easeInOutCubic(lift.current);
    const opacity = 1 - Math.min(1, e * 1.3);
    if (acrylic.current) acrylic.current.opacity = opacity;
    if (edges.current) edges.current.opacity = EDGE_OPACITY * opacity;
    const group = caseGroup.current;
    if (!group) return;
    group.position.y = BASE.height + CASE.height / 2 + 0.002 + e * 0.42;
    group.visible = e < 0.999;
  });

  return (
    <group>
      <RoundedBox
        args={[BASE.length, BASE.height, BASE.depth]}
        radius={0.004}
        smoothness={4}
        position={[0, BASE.height / 2, 0]}
      >
        <meshPhysicalMaterial color="#07080b" roughness={0.16} metalness={0.1} clearcoat={1} clearcoatRoughness={0.04} />
      </RoundedBox>

      <mesh position={[0, BASE.height + 0.0004, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[BASE.length - 0.02, BASE.depth - 0.02]} />
        <meshStandardMaterial color="#0d0f14" roughness={0.62} metalness={0.2} />
      </mesh>

      {plaque && (
        <mesh position={[0, BASE.height / 2, BASE.depth / 2 + 0.0006]}>
          <planeGeometry args={[PLAQUE.width, PLAQUE.height]} />
          <meshPhysicalMaterial map={plaque} metalness={0.85} roughness={0.32} clearcoat={0.3} />
        </mesh>
      )}

      <group ref={caseGroup} position={[0, BASE.height + CASE.height / 2 + 0.002, 0]}>
        <mesh>
          <boxGeometry args={[CASE.length, CASE.height, CASE.depth]} />
          <meshPhysicalMaterial
            ref={acrylic}
            color="#ffffff"
            metalness={0}
            roughness={0.03}
            transmission={1}
            thickness={0.004}
            ior={1.49}
            transparent
          />
        </mesh>
        <lineSegments>
          <edgesGeometry args={[edgeSource]} />
          <lineBasicMaterial ref={edges} color="#dfe6ff" transparent opacity={EDGE_OPACITY} />
        </lineSegments>
      </group>
    </group>
  );
}
