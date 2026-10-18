"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { flow } from "@/lib/flow";
import { useStage } from "@/lib/stage-store";
import { NARROW_ZOOM, SCROLL_TURN, SHOT_DAMPING, SIDE_FRAME_X, SIDE_ZOOM, isWideFrame } from "./constants";

/**
 * The shot the camera rig and the car follow, derived from the scroll
 * position and eased so it trails the page smoothly instead of snapping.
 * Written here every frame, read by CameraRig and Figurine; never during render.
 */
export const shot = {
  /** Car turn from scrolling, radians. */
  yaw: 0,
  /** Lens widening: 1 is the showcase framing. */
  zoom: 1,
  /** Horizontal framing: the car's offset from centre as a share of the screen width. */
  frameX: 0,
};

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Turns scrolling into camera direction, and keeps frames coming while the shot is still moving. */
export default function FlowDirector() {
  const reduced = useStage((s) => s.reducedMotion);
  const invalidate = useThree((s) => s.invalidate);

  // With on-demand rendering, every scroll asks for a frame.
  useEffect(() => {
    const wake = () => invalidate();
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake);
    return () => {
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", wake);
    };
  }, [invalidate]);

  useFrame((state, delta) => {
    const { width, height } = state.size;
    const wide = isWideFrame(width, height);
    const t = smoothstep(flow.hero);

    const yaw = reduced ? 0 : flow.progress * SCROLL_TURN;
    const zoom = 1 + ((wide ? SIDE_ZOOM : NARROW_ZOOM) - 1) * t;
    const frameX = (wide ? SIDE_FRAME_X : 0) * t;

    // After an idle spell the first delta can be seconds long; cap it so the shot eases, not jumps.
    const k = reduced ? 1 : 1 - Math.exp(-Math.min(delta, 1 / 30) * SHOT_DAMPING);
    shot.yaw += (yaw - shot.yaw) * k;
    shot.zoom += (zoom - shot.zoom) * k;
    shot.frameX += (frameX - shot.frameX) * k;

    const settling =
      Math.abs(yaw - shot.yaw) > 1e-4 || Math.abs(zoom - shot.zoom) > 1e-4 || Math.abs(frameX - shot.frameX) > 1e-4;
    if (settling) state.invalidate();
  }, -2);

  return null;
}
