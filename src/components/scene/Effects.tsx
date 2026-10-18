"use client";

import { useFrame } from "@react-three/fiber";
import {
  Bloom,
  DepthOfField,
  EffectComposer,
  N8AO,
  Noise,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode, type DepthOfFieldEffect } from "postprocessing";
import { useRef } from "react";
import * as THREE from "three";
import { FOCUS_RANGE, PHOTO_FOCUS_RANGE, SHOWCASE_CAMERA } from "./constants";

const FOCUS_TARGET = new THREE.Vector3(...SHOWCASE_CAMERA.target);
const SHOWCASE_DISTANCE = FOCUS_TARGET.distanceTo(new THREE.Vector3(...SHOWCASE_CAMERA.position));

export type Look = "studio" | "photo" | "circuit";

/**
 * Photographic finish: ambient occlusion in the crevices, depth of field,
 * gentle bloom on highlights, tone mapping, vignette and a trace of grain.
 * The studio uses a macro lens (what makes a small object read as small and
 * real) and AgX. Photo backdrops use a normal lens at car distance, Khronos
 * Neutral tone mapping (it keeps the photo's own colour and contrast, where
 * AgX washes it out), and only the sun's glints bloom, not the bright sky.
 * The circuit keeps everything sharp (the gantry boards have to be readable)
 * and lets the start lights and the sun glow. Low quality drops the two
 * expensive passes.
 */
export default function Effects({ quality, look }: { quality: "high" | "low"; look: Look }) {
  const dof = useRef<DepthOfFieldEffect>(null);
  const bloomThreshold = look === "circuit" ? 1.1 : look === "photo" ? 40 : 0.95;
  const toneMode = look === "studio" ? ToneMappingMode.AGX : ToneMappingMode.NEUTRAL;
  const vignette = look === "circuit" ? 0.5 : 0.72;

  // Studio depth of field deepens with distance, as with a real lens: the
  // wide intro shot is sharp throughout, close-ups are shallow.
  useFrame((state) => {
    const effect = dof.current;
    if (!effect) return;
    if (look === "photo") {
      effect.cocMaterial.focusRange = PHOTO_FOCUS_RANGE;
      return;
    }
    const ratio = state.camera.position.distanceTo(FOCUS_TARGET) / SHOWCASE_DISTANCE;
    effect.cocMaterial.focusRange = THREE.MathUtils.clamp(FOCUS_RANGE * ratio * ratio, 0.07, 1.2);
  });

  if (quality === "low") {
    return (
      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={bloomThreshold} luminanceSmoothing={0.1} intensity={0.3} mipmapBlur />
        <ToneMapping mode={toneMode} />
        <Vignette offset={0.28} darkness={vignette} />
      </EffectComposer>
    );
  }

  if (look === "circuit") {
    return (
      <EffectComposer multisampling={4}>
        <N8AO aoRadius={0.02} distanceFalloff={0.5} intensity={1.8} quality="medium" halfRes />
        <Bloom luminanceThreshold={bloomThreshold} luminanceSmoothing={0.2} intensity={0.6} mipmapBlur />
        <ToneMapping mode={toneMode} />
        <Vignette offset={0.3} darkness={vignette} />
        <Noise opacity={0.022} blendFunction={BlendFunction.OVERLAY} />
      </EffectComposer>
    );
  }

  return (
    <EffectComposer multisampling={4}>
      <N8AO aoRadius={0.018} distanceFalloff={0.4} intensity={2.2} quality="medium" halfRes />
      <DepthOfField
        ref={dof}
        target={SHOWCASE_CAMERA.target}
        focusRange={look === "photo" ? PHOTO_FOCUS_RANGE : FOCUS_RANGE}
        bokehScale={look === "photo" ? 1.3 : 2.2}
      />
      <Bloom luminanceThreshold={bloomThreshold} luminanceSmoothing={0.1} intensity={0.35} mipmapBlur />
      <ToneMapping mode={toneMode} />
      <Vignette offset={0.28} darkness={vignette} />
      <Noise opacity={0.028} blendFunction={BlendFunction.OVERLAY} />
    </EffectComposer>
  );
}
