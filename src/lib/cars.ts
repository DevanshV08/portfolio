/**
 * Which car stands on the stage. "downloaded" is "Red Bull RB9" by JUST GAME
 * on Sketchfab, used exactly as downloaded (logos and all); "built" is the
 * logo-free car from blender/build_rb9_figurine.py. Kept free of three.js so
 * the page overlay can import it.
 */
export const CARS = ["downloaded", "built"] as const;

export type CarId = (typeof CARS)[number];

export function parseCar(value: string | null): CarId | null {
  return CARS.find((c) => c === value) ?? null;
}

/** Credit for the downloaded model, as its file states it. */
export const DOWNLOADED_CAR_CREDIT = {
  title: "Red Bull RB9",
  author: "JUST GAME",
  url: "https://sketchfab.com/3d-models/red-bull-rb9-3c44792002c94d3887ebdce30cfec797",
  license: "CC BY 4.0",
};
