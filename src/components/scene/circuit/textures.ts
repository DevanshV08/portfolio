import * as THREE from "three";
import type { Milestone } from "@/content/site";

/*
 * Canvas-drawn textures for the circuit: no downloads, nothing over 1024 px,
 * built once per page and shared by every mount of the circuit.
 */

function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  return { c, ctx };
}

function texture(c: HTMLCanvasElement, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Deterministic noise so the textures look the same on every visit. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, alpha: number, seed: number) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const v = r() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * r()})`;
    ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

const cache = new Map<string, THREE.Texture>();
function once(key: string, make: () => THREE.Texture) {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

/** Mown grass: broad light/dark stripes with a little noise. Tiles across the infield. */
export const grassTexture = () =>
  once("grass", () => {
    const { c, ctx } = canvas(256, 256);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? "#386c2f" : "#427a37";
      ctx.fillRect(0, i * 64, 256, 64);
    }
    speckle(ctx, 256, 256, 9000, 0.12, 7);
    return texture(c);
  });

/** Asphalt: u runs across the track, v along it. A darker rubbered-in line down the middle. */
export const asphaltTexture = () =>
  once("asphalt", () => {
    const { c, ctx } = canvas(256, 256);
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, "#47494e");
    g.addColorStop(0.3, "#3d3f44");
    g.addColorStop(0.5, "#323438");
    g.addColorStop(0.7, "#3d3f44");
    g.addColorStop(1, "#47494e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    speckle(ctx, 256, 256, 9000, 0.1, 11);
    return texture(c);
  });

/** Kerb: red and white blocks along the track. */
export const kerbTexture = () =>
  once("kerb", () => {
    const { c, ctx } = canvas(16, 64);
    ctx.fillStyle = "#d81e2c";
    ctx.fillRect(0, 0, 16, 32);
    ctx.fillStyle = "#f2f2f0";
    ctx.fillRect(0, 32, 16, 32);
    return texture(c);
  });

/** Barrier panels: white with a blue band and panel seams. */
export const wallTexture = () =>
  once("wall", () => {
    const { c, ctx } = canvas(128, 32);
    ctx.fillStyle = "#e9ecef";
    ctx.fillRect(0, 0, 128, 32);
    ctx.fillStyle = "#1d3c8f";
    ctx.fillRect(0, 18, 128, 8);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(126, 0, 2, 32);
    return texture(c);
  });

/** Chequered start/finish line. */
export const checkerTexture = () =>
  once("checker", () => {
    const { c, ctx } = canvas(64, 16);
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 2; y++) {
        ctx.fillStyle = (x + y) % 2 ? "#111" : "#f4f4f4";
        ctx.fillRect(x * 8, y * 8, 8, 8);
      }
    }
    const t = texture(c);
    t.magFilter = THREE.NearestFilter;
    return t;
  });

/** Crowd in the grandstand: dots of colour. */
export const crowdTexture = () =>
  once("crowd", () => {
    const { c, ctx } = canvas(256, 64);
    ctx.fillStyle = "#2a2f3a";
    ctx.fillRect(0, 0, 256, 64);
    const r = rng(23);
    const colours = ["#e10b2f", "#f5c400", "#1b2150", "#f2f3f7", "#a50044", "#004d98", "#19c36b"];
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = colours[Math.floor(r() * colours.length)];
      ctx.fillRect(Math.floor(r() * 128) * 2, Math.floor(r() * 32) * 2, 2, 2);
    }
    return texture(c);
  });

/* ---------- Gantry boards ---------- */

export const BOARD = { width: 1.28, height: 0.43 };
const PX = { width: 1024, height: Math.round((1024 * BOARD.height) / BOARD.width) };

function fontFamily(variable: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || fallback;
}

/** Fits a single line into maxWidth by shrinking the size; returns the size used. */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: string, family: string, size: number, maxWidth: number) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && s > 12) {
    s -= 4;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

/** Wraps text into at most `lines` lines of maxWidth (the last one ellipsised if it overflows). */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, lines: number) {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      out.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) out.push(line);
  if (out.length <= lines) return out;
  const kept = out.slice(0, lines);
  kept[lines - 1] = `${kept[lines - 1]}…`;
  return kept;
}

function drawBoard(ctx: CanvasRenderingContext2D, m: Milestone, turn: string, fonts: { display: string; mono: string }) {
  const { width: W, height: H } = PX;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#111a3f");
  bg.addColorStop(1, "#070b1c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Championship stripe across the top.
  const stripe = ctx.createLinearGradient(0, 0, W, 0);
  stripe.addColorStop(0, "#e10b2f");
  stripe.addColorStop(0.33, "#e10b2f");
  stripe.addColorStop(0.33, "#1b2150");
  stripe.addColorStop(0.66, "#1b2150");
  stripe.addColorStop(0.66, "#f5c400");
  stripe.addColorStop(1, "#f5c400");
  ctx.fillStyle = stripe;
  ctx.fillRect(0, 0, W, 14);

  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, W - 6, H - 6);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#f5c400";
  ctx.font = `600 34px ${fonts.mono}`;
  ctx.fillText(`${turn} · ${m.year}`.toUpperCase(), 40, 74);

  ctx.fillStyle = "#f4f5f8";
  // With a unit, the number sits a little higher and smaller, and the unit says what it counts.
  const unit = m.unit?.toUpperCase();
  fit(ctx, m.headline.toUpperCase(), "700", fonts.display, unit ? 168 : 200, 520);
  ctx.fillText(m.headline.toUpperCase(), 36, unit ? H - 90 : H - 46);
  if (unit) {
    ctx.fillStyle = "#f5c400";
    fit(ctx, unit, "600", fonts.mono, 32, 520);
    ctx.fillText(unit, 40, H - 38);
  }

  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(590, 50, 3, H - 96);

  ctx.fillStyle = "#f4f5f8";
  ctx.font = `600 50px ${fonts.display}`;
  const lines = wrap(ctx, m.title.toUpperCase(), 380, 4);
  const top = H / 2 - ((lines.length - 1) * 56) / 2 + 16;
  lines.forEach((line, i) => ctx.fillText(line, 620, top + i * 56));
}

let boards: Promise<THREE.CanvasTexture[]> | null = null;

/** One board texture per milestone, drawn with the page's own fonts once they've loaded. */
export function boardTextures(milestones: Milestone[]) {
  if (!boards) {
    boards = document.fonts.ready.then(() => {
      const fonts = {
        display: fontFamily("--font-display-face", "sans-serif"),
        mono: fontFamily("--font-mono-face", "monospace"),
      };
      return milestones.map((m, i) => {
        const { c, ctx } = canvas(PX.width, PX.height);
        drawBoard(ctx, m, `T${i + 1}`, fonts);
        const t = texture(c, false);
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        return t;
      });
    });
  }
  return boards;
}
