import * as THREE from "three";
import type { PhotoBackdropId } from "@/lib/backdrops";
import { BASE, FULL_SIZE, PHOTO_CAMERA_DISTANCE, SHOWCASE_CAMERA } from "./constants";

/**
 * Real 360° photos of Zwartkops Raceway by Poly Haven (CC0), built into
 * public/backdrops/<id> by scripts/build_backdrops.py.
 */
type PhotoBackdrop = {
  /** Panorama column, 0 (left edge) to 1, to frame behind the car. */
  look: number;
  /** Where the sun is in the panorama, or null when it's out of sight (the covered pit). */
  sun: { u: number; v: number } | null;
  /** Brightness of both the lighting and the photo. */
  exposure: number;
  /** Darkness of the soft shadow right under the car. */
  contactShadow: number;
  /** Height the photo was taken from, metres. */
  eyeHeight: number;
};

export const PHOTO_BACKDROPS: Record<PhotoBackdropId, PhotoBackdrop> = {
  pit: {
    look: 0.236,
    sun: null,
    exposure: 0.8,
    contactShadow: 0.85,
    eyeHeight: 1.7,
  },
  grid: {
    look: 0.51,
    sun: { u: 0.6005, v: 0.2058 },
    exposure: 0.9,
    contactShadow: 0.55,
    eyeHeight: 1.7,
  },
  straight: {
    look: 0.33,
    sun: { u: 0.6003, v: 0.2058 },
    exposure: 0.9,
    contactShadow: 0.55,
    eyeHeight: 1.7,
  },
};

/** 1K HDR (1024x512): lighting and reflections on the car. */
export const lightUrl = (id: PhotoBackdropId) => `/backdrops/${id}/light.hdr`;

/** Cube map faces in three.js's order (+x, -x, +y, -y, +z, -z): the photo you see. */
export const skyUrls = (id: PhotoBackdropId, size: number) =>
  ["px", "nx", "py", "ny", "pz", "nz"].map((face) => `/backdrops/${id}/${size}/${face}.webp`);

/** 1536 px faces on larger screens; phones get 1024 px (less memory and download). */
export const skyFaceSize = () => (window.innerWidth >= 900 && window.innerHeight >= 600 ? 1536 : 1024);

const TARGET = new THREE.Vector3(...SHOWCASE_CAMERA.target);
const UP = new THREE.Vector3(0, 1, 0);

/** Level direction from the car towards the camera: the studio's showcase angle. */
const TOWARDS_CAMERA = new THREE.Vector3(
  SHOWCASE_CAMERA.position[0] - TARGET.x,
  0,
  SHOWCASE_CAMERA.position[2] - TARGET.z,
).normalize();

/** The camera stands where the photo was taken. */
export function photoCameraPosition(eyeHeight: number) {
  return new THREE.Vector3(
    TARGET.x + TOWARDS_CAMERA.x * PHOTO_CAMERA_DISTANCE,
    BASE.height + eyeHeight / FULL_SIZE,
    TARGET.z + TOWARDS_CAMERA.z * PHOTO_CAMERA_DISTANCE,
  );
}

/** Panorama column to longitude, in three.js's convention: the centre faces +X, turning towards +Z. */
const longitude = (u: number) => (u - 0.5) * Math.PI * 2;

/** Turn about the vertical that puts the chosen panorama column straight behind the car. */
export function photoYaw(look: number) {
  const view = Math.atan2(-TOWARDS_CAMERA.z, -TOWARDS_CAMERA.x);
  return longitude(look) - view;
}

/** Unit vector towards the sun, after the backdrop's turn. */
export function sunDirection(sun: { u: number; v: number }, yaw: number) {
  const lon = longitude(sun.u);
  const lat = (0.5 - sun.v) * Math.PI;
  return new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).applyAxisAngle(
    UP,
    yaw,
  );
}
