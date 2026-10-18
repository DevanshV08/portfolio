import { useSyncExternalStore } from "react";
import type { BackdropId } from "./backdrops";
import type { CarId } from "./cars";

/**
 * Shared state between the HTML overlay and the 3D scene. The scene is loaded
 * lazily, so the overlay can't rely on React context from inside the canvas.
 *
 * Phases:
 *   loading  start lights come on as the 3D code and the figurine load
 *   out      lights out: studio lights up, case lifts, camera flies in
 *   live     interactive
 */
export type Phase = "loading" | "out" | "live";

export type StageState = {
  /** The 3D code has loaded and the canvas is mounted. */
  sceneReady: boolean;
  /** Figurine download progress, 0..1. */
  progress: number;
  /** Figurine parsed and shaders compiled. */
  loaded: boolean;
  phase: Phase;
  drsOpen: boolean;
  webglFailed: boolean;
  skipIntro: boolean;
  reducedMotion: boolean;
  /** What stands behind the car. */
  backdrop: BackdropId;
  /** A photo backdrop has finished loading (the studio needs no download). */
  backdropReady: boolean;
  /** Which car model is shown. */
  car: CarId;
  /** The coverage sector in the middle of the screen; "" while the hero is showing. */
  section: string;
  /** Scrolled past the opening shot into the coverage. */
  scrolled: boolean;
  /** Which set the 3D scene should show: the opening shot, or the circuit for the lap. */
  set: SetId;
  /** Caption on screen during the lap: 0 the grid, then one per milestone, then the flag; -1 while the car is driving. */
  lapIndex: number;
  /** The stop the car is parked at or driving to (same numbering as lapIndex). */
  lapHeading: number;
  /** React has hydrated: the page can switch from its plain HTML layout to the driven lap. */
  hydrated: boolean;
  /** Onboard audio switched on (it never starts by itself). */
  audio: boolean;
};

export type SetId = "hero" | "circuit";

const initial: StageState = {
  sceneReady: false,
  progress: 0,
  loaded: false,
  phase: "loading",
  drsOpen: false,
  webglFailed: false,
  skipIntro: false,
  reducedMotion: false,
  backdrop: "studio",
  backdropReady: false,
  car: "downloaded",
  section: "",
  scrolled: false,
  set: "hero",
  lapIndex: 0,
  lapHeading: 0,
  hydrated: false,
  audio: false,
};

let state = initial;
const listeners = new Set<() => void>();

export const stage = {
  get: () => state,
  set(patch: Partial<StageState>) {
    const next = { ...state, ...patch };
    const changed = (Object.keys(patch) as (keyof StageState)[]).some((k) => next[k] !== state[k]);
    if (!changed) return;
    state = next;
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** Subscribe to one primitive slice of the stage state. */
export function useStage<T extends string | number | boolean>(select: (s: StageState) => T): T {
  return useSyncExternalStore(
    stage.subscribe,
    () => select(state),
    () => select(initial),
  );
}

/** Everything behind the car is ready to show. */
export const sceneryReady = (s: StageState) => s.backdrop === "studio" || s.backdropReady;

/** The lap is driven in 3D (rather than shown as a plain list): hydrated, WebGL works, motion is welcome. */
export const lapDriven = (s: StageState) => s.hydrated && !s.webglFailed && !s.reducedMotion;
