/** Scene dimensions in metres. The figurine is 1:18, about 28 cm long. */

export type Vec3 = [number, number, number];

export const BASE = { length: 0.36, height: 0.028, depth: 0.15 };
export const CASE = { length: 0.345, height: 0.1, depth: 0.135 };

/** Shift so the car sits centred on the base (model bounds x -0.137..0.147). */
export const FIGURINE_OFFSET_X = -0.005;

export const INTRO_CAMERA = { position: [0.78, 0.2, 0.86] as Vec3, target: [0, 0.09, 0] as Vec3 };
export const SHOWCASE_CAMERA = { position: [0.33, 0.125, 0.37] as Vec3, target: [0, 0.042, 0] as Vec3 };
export const FLY_IN_SECONDS = 2;

/** Vertical field of view, in degrees, on screens at least FIT_ASPECT wide. */
export const BASE_FOV = 26;
const FIT_ASPECT = 1.5;

/**
 * Narrower and portrait screens widen the vertical field of view so the car
 * keeps the same width on screen instead of being cropped.
 */
export function fitFov(aspect: number, baseFov = BASE_FOV) {
  if (aspect >= FIT_ASPECT) return baseFov;
  const halfTan = Math.tan((baseFov / 2) * (Math.PI / 180)) * (FIT_ASPECT / aspect);
  return 2 * Math.atan(halfTan) * (180 / Math.PI);
}

/** Widens (zoom above 1) or narrows a field of view the way a zoom lens does. */
export function zoomFov(fov: number, zoom: number) {
  return 2 * Math.atan(Math.tan((fov / 2) * (Math.PI / 180)) * zoom) * (180 / Math.PI);
}

/*
 * Photo backdrops. The scene keeps the figurine's units, so a full-size car
 * means the 360° photo is scaled down 18 times around it. The camera stands
 * exactly where the photo was taken, the one spot where a projected photo
 * shows no distortion, and the car turns on the spot instead of the camera
 * orbiting.
 */
export const FULL_SIZE = 18;
/** Camera to car: 6.5 m at full size. */
export const PHOTO_CAMERA_DISTANCE = 6.5 / FULL_SIZE;
/** Same framing as the studio's showcase shot from the closer camera. */
export const PHOTO_FOV =
  2 *
  Math.atan(
    Math.tan((BASE_FOV / 2) * (Math.PI / 180)) *
      (Math.hypot(
        SHOWCASE_CAMERA.position[0] - SHOWCASE_CAMERA.target[0],
        SHOWCASE_CAMERA.position[1] - SHOWCASE_CAMERA.target[1],
        SHOWCASE_CAMERA.position[2] - SHOWCASE_CAMERA.target[2],
      ) /
        PHOTO_CAMERA_DISTANCE),
  ) *
  (180 / Math.PI);
/** The start-lights shot is this much wider, then the lens zooms in at lights out. */
export const PHOTO_INTRO_ZOOM = 1.9;
/** Scroll-wheel zoom limits (1 is the showcase framing). */
export const PHOTO_ZOOM_RANGE = [0.55, 1.3] as const;
/** Turntable speed when nobody is dragging, radians per second (one turn in about two minutes). */
export const PHOTO_AUTO_SPIN = 0.05;
/** Depth-of-field range on photo backdrops: a normal lens at car distance, not a macro lens. */
export const PHOTO_FOCUS_RANGE = 0.3;

/*
 * Scroll choreography. As the coverage scrolls in, the car turns with the page
 * (one full turn from top to bottom) and, on wide screens, the lens widens and
 * slides the car to the right of the frame so the coverage sits beside it.
 */
/** Car turn over the whole page, radians. */
export const SCROLL_TURN = Math.PI * 2;
/** Lens widening once the coverage is on screen (1 is the showcase framing). */
export const SIDE_ZOOM = 1.55;
export const NARROW_ZOOM = 1.12;
/** How far the car slides right on wide screens, as a share of the screen width. */
export const SIDE_FRAME_X = 0.27;
/** Wide-screen test; matches the coverage's two-column breakpoint in CSS. */
export const isWideFrame = (width: number, height: number) => width >= 1200 && width / Math.max(1, height) >= 1.2;
/** How quickly the shot catches up with the scroll position (higher is snappier). */
export const SHOT_DAMPING = 4;
/** Scrolling faster than this (px/s) opens the DRS flap: the car's in a DRS zone. */
export const DRS_SPEED = 2600;

/** On portrait screens, lift the car above the name and buttons (fraction of screen height). */
export const PORTRAIT_SHIFT = 0.08;

/** Depth-of-field range at the showcase distance. It widens with distance, like a real lens. */
export const FOCUS_RANGE = 0.16;

/** DRS flap rotation when open, radians. */
export const DRS_OPEN_ANGLE = 0.38;

/** Invisible click target around the rear wing, relative to the figurine. */
export const REAR_WING_HIT = { position: [-0.125, 0.038, 0] as Vec3, size: [0.04, 0.05, 0.056] as Vec3 };

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
