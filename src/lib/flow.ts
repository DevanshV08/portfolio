import { SECTORS } from "./sectors";
import { stage, type SetId } from "./stage-store";

/**
 * Continuous scroll state for the one-page broadcast. A passive scroll
 * listener writes it and the 3D scene reads it every frame, so scrolling
 * never re-renders React. Discrete changes (which sector is on screen, which
 * 3D set to show, which lap caption) go through the stage store.
 */
export const flow = {
  /** 0 at the top of the page, 1 at the very bottom. */
  progress: 0,
  /** 0 with the opening shot fully on screen, 1 once it has scrolled away. */
  hero: 0,
  /** Scroll speed in px/s, smoothed; falls back to 0 when scrolling stops. */
  speed: 0,
  /** Progress through the lap section, 0 (on the grid) to 1 (past the flag). */
  lap: 0,
  /** How far the scene is dimmed behind the written coverage, 0 to 1. */
  dim: 0,
};

/** The opening shot counts as gone after this share of a screen height. */
const HERO_SPAN = 0.85;
/** The sector whose top has passed this line (share of the screen height) is the active one. */
const READ_LINE = 0.45;
/** The scene cuts from the opening shot to the circuit once this share of a screen has scrolled. */
const CUT_AT = 0.45;

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Starts tracking. Elements marked `data-flow` get `--hero`, `--progress` and
 * `--dim` as CSS custom properties: set on those few elements rather than the
 * root, so a scroll frame doesn't restyle the whole page. Returns a cleanup.
 */
export function startFlow(): () => void {
  const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-flow]"));
  // -1 forces the first paint (a NaN start would never compare as changed).
  let painted = { hero: -1, progress: -1, dim: -1 };
  let frame = 0;
  let lastY = window.scrollY;
  let lastTime = performance.now();

  const measure = () => {
    const y = window.scrollY;
    const vh = window.innerHeight;
    const max = Math.max(1, document.documentElement.scrollHeight - vh);
    flow.progress = clamp(y / max);
    flow.hero = clamp(y / (vh * HERO_SPAN));

    let set: SetId = "hero";
    flow.lap = 0;
    flow.dim = flow.hero;
    const lap = document.getElementById("lap");
    if (lap?.dataset.mode === "drive") {
      const top = lap.getBoundingClientRect().top + y;
      const travel = Math.max(1, lap.offsetHeight - vh);
      flow.lap = clamp((y - top) / travel);
      // The scene stays clear for the whole lap and dims once the written coverage arrives.
      flow.dim = clamp((y - top - travel) / (vh * 0.6));
      set = y > vh * CUT_AT ? "circuit" : "hero";
      // Which caption is up is the scene's call: it drives to the gantry scroll asks for and stops there.
    }

    let section = "";
    if (lap && lap.getBoundingClientRect().top <= vh * READ_LINE) section = "lap";
    for (const sector of SECTORS) {
      const el = document.getElementById(sector.id);
      if (el && el.getBoundingClientRect().top <= vh * READ_LINE) section = sector.id;
    }
    stage.set({ section, scrolled: flow.hero > 0.5, set });

    const moved =
      Math.abs(painted.hero - flow.hero) > 0.0005 ||
      Math.abs(painted.progress - flow.progress) > 0.0005 ||
      Math.abs(painted.dim - flow.dim) > 0.0005;
    if (moved) {
      painted = { hero: flow.hero, progress: flow.progress, dim: flow.dim };
      for (const el of targets) {
        el.style.setProperty("--hero", flow.hero.toFixed(4));
        el.style.setProperty("--progress", flow.progress.toFixed(4));
        el.style.setProperty("--dim", flow.dim.toFixed(4));
      }
    }
  };

  // Runs while the page is moving, then stops: speed decays to 0 after scrolling ends.
  const tick = (now: number) => {
    const y = window.scrollY;
    const dt = Math.min(0.1, Math.max(0.001, (now - lastTime) / 1000));
    flow.speed += (Math.abs(y - lastY) / dt - flow.speed) * (1 - Math.exp(-dt * 10));
    lastY = y;
    lastTime = now;
    measure();
    if (flow.speed > 4) {
      frame = requestAnimationFrame(tick);
    } else {
      flow.speed = 0;
      frame = 0;
    }
  };

  const wake = () => {
    if (frame) return;
    lastTime = performance.now();
    frame = requestAnimationFrame(tick);
  };

  measure();
  window.addEventListener("scroll", wake, { passive: true });
  window.addEventListener("resize", measure);
  // The lap section changes height when it switches from its plain list to the driven layout.
  const resized = new ResizeObserver(() => measure());
  resized.observe(document.body);
  return () => {
    cancelAnimationFrame(frame);
    resized.disconnect();
    window.removeEventListener("scroll", wake);
    window.removeEventListener("resize", measure);
  };
}
