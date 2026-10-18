"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useState } from "react";
import * as THREE from "three";
import { isPhotoBackdrop } from "@/lib/backdrops";
import { stage, useStage, type SetId } from "@/lib/stage-store";
import CameraRig from "./CameraRig";
import Circuit, { CIRCUIT_FOG, preloadCircuit } from "./circuit/Circuit";
import { BASE_FOV, INTRO_CAMERA } from "./constants";
import Display from "./Display";
import Effects from "./Effects";
import Figurine from "./Figurine";
import FlowDirector from "./FlowDirector";
import PhotoBackdrop from "./PhotoBackdrop";
import Studio from "./Studio";

/** How long the page's dip to black takes to cover the screen before the set changes underneath it. */
const CUT_DELAY_MS = 170;

function StudioSet() {
  return (
    <>
      <Studio />
      <Display />
    </>
  );
}

/** The opening shot: the car in the studio on its display base, or on a photo backdrop. */
function HeroSet({ photo, backdrop }: { photo: boolean; backdrop: string }) {
  return (
    <>
      <Suspense fallback={null}>
        <Figurine />
        {photo ? (
          <Suspense fallback={<StudioSet />}>
            <PhotoBackdrop key={backdrop} id={backdrop as never} />
          </Suspense>
        ) : (
          <StudioSet />
        )}
      </Suspense>
      <CameraRig />
    </>
  );
}

/** The 3D stage. Loaded lazily after the page has painted. */
export default function Scene() {
  const [quality, setQuality] = useState<"high" | "low">("high");
  const backdrop = useStage((s) => s.backdrop);
  const backdropReady = useStage((s) => s.backdropReady);
  const phase = useStage((s) => s.phase);
  const reduced = useStage((s) => s.reducedMotion);
  // While the coverage is being read, the scene only renders when something
  // moves (a scroll, an easing shot, the car) instead of 60 times a second.
  const onDemand = useStage((s) => s.scrolled && s.phase === "live");
  const wanted = useStage((s) => s.set);
  // The set swaps a moment after it's asked for, once the page's cut has gone dark.
  const [set, setSet] = useState<SetId>("hero");
  const photo = isPhotoBackdrop(backdrop);
  const circuit = set === "circuit";
  // Until a photo has loaded, the studio stands in (fog and all).
  const photoShowing = photo && backdropReady;

  useEffect(() => {
    stage.set({ sceneReady: true });
    return () => {
      stage.set({ sceneReady: false, loaded: false, progress: 0, phase: "loading", drsOpen: false });
      document.body.style.cursor = "";
    };
  }, []);

  useEffect(() => {
    if (wanted === set) return;
    const timer = setTimeout(() => setSet(wanted), reduced ? 0 : CUT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [wanted, set, reduced]);

  // Fetch the circuit's lighting once the opening shot is up, so the cut to the lap is instant.
  useEffect(() => {
    if (phase === "live") preloadCircuit();
  }, [phase]);

  return (
    <Canvas
      // PCF shadows: what three already falls back to now that soft PCF is gone, without the console warning.
      shadows="percentage"
      frameloop={onDemand ? "demand" : "always"}
      dpr={quality === "high" ? [1, 2] : [1, 1.25]}
      gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
      camera={{ fov: BASE_FOV, near: 0.01, far: 12, position: INTRO_CAMERA.position }}
      onCreated={({ gl }) => {
        // Tone mapping happens in the post-processing chain.
        gl.toneMapping = THREE.NoToneMapping;
      }}
    >
      <color attach="background" args={[circuit ? CIRCUIT_FOG.color : "#05070f"]} />
      {circuit ? (
        <fog attach="fog" args={[CIRCUIT_FOG.color, CIRCUIT_FOG.near, CIRCUIT_FOG.far]} />
      ) : (
        !photoShowing && <fog attach="fog" args={["#05070f", 0.9, 3.2]} />
      )}
      {/* Measures frame rate, so it only runs while frames are continuous. */}
      {!onDemand && <PerformanceMonitor onDecline={() => setQuality("low")} />}
      <FlowDirector />
      {circuit ? (
        <Suspense fallback={null}>
          <Circuit />
        </Suspense>
      ) : (
        <HeroSet photo={photo} backdrop={backdrop} />
      )}
      <Effects quality={quality} look={circuit ? "circuit" : photoShowing ? "photo" : "studio"} />
    </Canvas>
  );
}
