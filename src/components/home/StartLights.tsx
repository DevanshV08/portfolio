"use client";

import { useEffect, useState } from "react";
import { sceneryReady, stage, useStage } from "@/lib/stage-store";
import styles from "./home.module.css";

const PODS = [0, 1, 2, 3, 4];
const LIGHT_INTERVAL_MS = 280;

/**
 * Five start lights that track real loading: the first comes on when the 3D
 * code has loaded, the next three as the figurine downloads, the fifth once
 * it (and a photo backdrop, if chosen) is ready to render. Then a random
 * hold, like a real start, and lights out.
 */
export default function StartLights() {
  const phase = useStage((s) => s.phase);
  const sceneReady = useStage((s) => s.sceneReady);
  const progress = useStage((s) => s.progress);
  const carReady = useStage((s) => s.loaded);
  const trackReady = useStage(sceneryReady);
  const skip = useStage((s) => s.skipIntro);
  const reduced = useStage((s) => s.reducedMotion);
  const failed = useStage((s) => s.webglFailed);
  const [lit, setLit] = useState(0);

  const loaded = carReady && trackReady;
  const earned = !sceneReady ? 0 : loaded ? 5 : Math.min(4, 1 + Math.floor(progress * 4));
  const shown = Math.min(lit, earned);
  const instant = skip || reduced;

  // One light at a time, so the sequence reads even on a cached load.
  useEffect(() => {
    if (phase !== "loading" || lit >= earned) return;
    const timer = setTimeout(() => setLit((n) => n + 1), instant ? 0 : LIGHT_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [phase, lit, earned, instant]);

  // All five on and the car is ready: hold, then lights out.
  useEffect(() => {
    if (phase !== "loading" || shown < 5) return;
    const hold = instant ? 0 : 400 + Math.random() * 900;
    const timer = setTimeout(() => stage.set({ phase: "out" }), hold);
    return () => clearTimeout(timer);
  }, [phase, shown, instant]);

  if (failed || phase === "live") return null;

  const out = phase === "out";
  const percent = Math.round((sceneReady ? 0.2 + 0.8 * progress : 0) * 100);
  const caption = out
    ? "Lights out"
    : shown >= 5
      ? "Ready"
      : carReady && !trackReady
        ? "Loading the track"
        : progress >= 1 && !carReady
          ? "Warming up the tyres"
          : `Loading the car · ${percent}%`;

  // Decorative: the name and buttons are usable before the 3D loads, so
  // screen readers aren't told about loading progress.
  return (
    <div className={styles.lights} data-state={out ? "out" : "on"} data-instant={instant} data-overlay>
      <div className={styles.gantry} aria-hidden="true">
        {PODS.map((i) => (
          <div key={i} className={styles.pod}>
            <span className={styles.lamp} data-on={!out && i < shown} />
            <span className={styles.lamp} data-on={!out && i < shown} />
          </div>
        ))}
      </div>
      <p className={styles.caption} aria-hidden="true">
        {caption}
      </p>
      {!out && !instant && (
        <button type="button" className={styles.skip} onClick={() => stage.set({ skipIntro: true })}>
          Skip intro
        </button>
      )}
    </div>
  );
}
