import * as THREE from "three";
import { PORTRAIT_SHIFT } from "./constants";

/** What was last applied to the camera, so the projection only updates when something changed. */
export type Lens = { width: number; height: number; fov: number; frameX: number; near: number; far: number };

export const makeLens = (): Lens => ({ width: 0, height: 0, fov: 0, frameX: 0, near: 0, far: 0 });

/**
 * Sets the field of view, clip range and a sideways frame shift without moving
 * the camera (a lens shift, so photo backdrops stay undistorted). Portrait
 * screens lift the subject above the page's text; `frameX` slides it right by
 * that share of the screen width.
 */
export function applyLens(
  camera: THREE.PerspectiveCamera,
  lens: Lens,
  width: number,
  height: number,
  fov: number,
  frameX: number,
  near = 0.01,
  far = 12,
) {
  const shift = Math.round(frameX * 10000) / 10000;
  if (
    lens.width === width &&
    lens.height === height &&
    lens.fov === fov &&
    lens.frameX === shift &&
    lens.near === near &&
    lens.far === far
  ) {
    return;
  }
  Object.assign(lens, { width, height, fov, frameX: shift, near, far });
  camera.fov = fov;
  camera.near = near;
  camera.far = far;
  const x = -shift * width;
  const y = width / Math.max(1, height) < 1 ? height * PORTRAIT_SHIFT : 0;
  if (x === 0 && y === 0) camera.clearViewOffset();
  else camera.setViewOffset(width, height, x, y, width, height);
  camera.updateProjectionMatrix();
}
