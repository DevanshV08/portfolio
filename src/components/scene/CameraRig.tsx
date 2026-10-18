"use client";

import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type ComponentRef } from "react";
import * as THREE from "three";
import { isPhotoBackdrop } from "@/lib/backdrops";
import { flow } from "@/lib/flow";
import { stage, useStage } from "@/lib/stage-store";
import {
  FLY_IN_SECONDS,
  INTRO_CAMERA,
  PHOTO_AUTO_SPIN,
  PHOTO_FOV,
  PHOTO_INTRO_ZOOM,
  PHOTO_ZOOM_RANGE,
  SHOWCASE_CAMERA,
  easeInOutCubic,
  fitFov,
  zoomFov,
} from "./constants";
import { shot } from "./FlowDirector";
import { applyLens, makeLens } from "./lens";
import { PHOTO_BACKDROPS, photoCameraPosition } from "./photo-backdrops";
import { turntable } from "./turntable";

const FROM = new THREE.Vector3(...INTRO_CAMERA.position);
const TO = new THREE.Vector3(...SHOWCASE_CAMERA.position);
const FROM_TARGET = new THREE.Vector3(...INTRO_CAMERA.target);
const TO_TARGET = new THREE.Vector3(...SHOWCASE_CAMERA.target);
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Studio: fits the lens to the screen, holds the wide shot during the start
 * lights, flies in at lights out, then hands over to orbit controls. Once the
 * coverage scrolls in, the controls step aside and the camera circles the car
 * with the page.
 */
function OrbitRig() {
  const phase = useStage((s) => s.phase);
  const reduced = useStage((s) => s.reducedMotion);
  const scrolled = useStage((s) => s.scrolled);
  const instant = useStage((s) => s.reducedMotion || s.skipIntro);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const progress = useRef(0);
  const lookTarget = useRef(new THREE.Vector3());
  const orbit = useRef(new THREE.Vector3());
  const lens = useRef(makeLens());
  // Switching back from a photo backdrop after the intro starts from the showcase shot.
  const arrivedLive = useRef(stage.get().phase === "live");

  useFrame((state, dt) => {
    const { camera, size } = state;
    if (!(camera instanceof THREE.PerspectiveCamera)) return;

    if (arrivedLive.current && controls.current) {
      arrivedLive.current = false;
      camera.position.copy(TO);
      controls.current.target.copy(TO_TARGET);
      controls.current.update();
    }

    applyLens(
      camera,
      lens.current,
      size.width,
      size.height,
      zoomFov(fitFov(size.width / Math.max(1, size.height)), shot.zoom),
      shot.frameX,
    );

    if (phase === "live") {
      const ctl = controls.current;
      if (!scrolled || !ctl) return;
      // The coverage is on screen: circle the car at the showcase distance as the page scrolls.
      orbit.current.copy(TO).sub(TO_TARGET).applyAxisAngle(UP, -shot.yaw).add(TO_TARGET);
      const k = reduced ? 1 : 1 - Math.exp(-Math.min(dt, 1 / 30) * 6);
      camera.position.lerp(orbit.current, k);
      ctl.target.lerp(TO_TARGET, k);
      camera.lookAt(ctl.target);
      if (camera.position.distanceToSquared(orbit.current) > 1e-9) state.invalidate();
      return;
    }
    if (phase === "loading") {
      progress.current = 0;
      camera.position.copy(FROM);
      camera.lookAt(FROM_TARGET);
      return;
    }
    progress.current = instant ? 1 : Math.min(1, progress.current + dt / FLY_IN_SECONDS);
    const e = easeInOutCubic(progress.current);
    camera.position.lerpVectors(FROM, TO, e);
    lookTarget.current.lerpVectors(FROM_TARGET, TO_TARGET, e);
    camera.lookAt(lookTarget.current);
    if (progress.current >= 1) {
      controls.current?.target.copy(TO_TARGET);
      controls.current?.update();
      stage.set({ phase: "live" });
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={phase === "live" && !scrolled}
      target={SHOWCASE_CAMERA.target}
      enableDamping
      dampingFactor={0.08}
      enablePan={false}
      // The wheel scrolls the page, never the camera.
      enableZoom={false}
      minDistance={0.24}
      maxDistance={0.75}
      minPolarAngle={0.55}
      maxPolarAngle={1.48}
      autoRotate={phase === "live" && !reduced && !scrolled}
      autoRotateSpeed={0.45}
    />
  );
}

/** Horizontal drag across the full canvas width turns the car this far, radians. */
const DRAG_TURN = Math.PI * 1.6;

/**
 * Photo backdrops: the camera stays where the photo was taken. The start
 * lights hold a wide shot, the lens zooms in at lights out, and dragging
 * turns the car; a trackpad pinch zooms, while the wheel scrolls the page.
 */
function PhotoRig({ eyeHeight }: { eyeHeight: number }) {
  const phase = useStage((s) => s.phase);
  const reduced = useStage((s) => s.reducedMotion);
  const instant = useStage((s) => s.reducedMotion || s.skipIntro);
  const gl = useThree((s) => s.gl);
  // Switching backdrops after the intro skips straight to the showcase framing.
  const progress = useRef(stage.get().phase === "loading" ? 0 : 1);
  const eye = useRef(photoCameraPosition(eyeHeight));
  const lens = useRef(makeLens());

  useEffect(() => {
    eye.current = photoCameraPosition(eyeHeight);
  }, [eyeHeight]);

  useEffect(() => {
    // Horizontal touch drags reach us; vertical swipes scroll the page (touch-action: pan-y).
    const el = gl.domElement;
    let pointer: number | null = null;
    let lastX = 0;
    let lastTime = 0;

    const down = (event: PointerEvent) => {
      if (stage.get().phase !== "live" || pointer !== null) return;
      pointer = event.pointerId;
      lastX = event.clientX;
      lastTime = event.timeStamp;
      turntable.dragging = true;
      turntable.fling = 0;
      el.setPointerCapture(pointer);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      const turn = ((event.clientX - lastX) / Math.max(1, el.clientWidth)) * DRAG_TURN;
      const seconds = Math.max(0.001, (event.timeStamp - lastTime) / 1000);
      turntable.yaw += turn;
      turntable.fling = THREE.MathUtils.lerp(turntable.fling, turn / seconds, 0.5);
      lastX = event.clientX;
      lastTime = event.timeStamp;
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      if (el.hasPointerCapture(pointer)) el.releasePointerCapture(pointer);
      pointer = null;
      turntable.dragging = false;
      // A drag that stopped before release shouldn't fling; nor should any with reduced motion.
      if (stage.get().reducedMotion || event.timeStamp - lastTime > 80) turntable.fling = 0;
    };
    // Browsers report a trackpad pinch as a wheel event with ctrlKey set. Plain wheel scrolls the page.
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey || stage.get().phase !== "live") return;
      event.preventDefault();
      const [min, max] = PHOTO_ZOOM_RANGE;
      turntable.zoom = THREE.MathUtils.clamp(turntable.zoom * Math.exp(event.deltaY * 0.01), min, max);
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      turntable.dragging = false;
      turntable.fling = 0;
    };
  }, [gl]);

  useFrame((state, dt) => {
    const { camera, size } = state;
    if (!(camera instanceof THREE.PerspectiveCamera)) return;

    if (phase === "loading") {
      progress.current = 0;
    } else if (progress.current < 1) {
      progress.current = instant ? 1 : Math.min(1, progress.current + dt / FLY_IN_SECONDS);
    }
    if (phase === "out" && progress.current >= 1) stage.set({ phase: "live" });

    const intro = PHOTO_INTRO_ZOOM + (1 - PHOTO_INTRO_ZOOM) * easeInOutCubic(progress.current);
    const base = fitFov(size.width / Math.max(1, size.height), PHOTO_FOV);
    applyLens(camera, lens.current, size.width, size.height, zoomFov(base, intro * turntable.zoom * shot.zoom), shot.frameX);
    camera.position.copy(eye.current);
    camera.lookAt(TO_TARGET);

    if (phase === "live" && !turntable.dragging) {
      const step = Math.min(dt, 1 / 30);
      turntable.fling *= Math.exp(-2.5 * step);
      // The idle turntable spin fades out as the coverage scrolls in; scrolling turns the car instead.
      const spin = reduced ? 0 : PHOTO_AUTO_SPIN * (1 - flow.hero);
      turntable.yaw += (turntable.fling + spin) * step;
      if (Math.abs(turntable.fling) > 1e-3) state.invalidate();
    }
  });

  return null;
}

export default function CameraRig() {
  const backdrop = useStage((s) => s.backdrop);
  return isPhotoBackdrop(backdrop) ? (
    <PhotoRig eyeHeight={PHOTO_BACKDROPS[backdrop].eyeHeight} />
  ) : (
    <OrbitRig />
  );
}
