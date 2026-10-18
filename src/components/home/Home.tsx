"use client";

import dynamic from "next/dynamic";
import { memo, useEffect } from "react";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import { CoverageBody } from "@/components/coverage/Coverage";
import { parseBackdrop } from "@/lib/backdrops";
import { parseCar } from "@/lib/cars";
import { startFlow } from "@/lib/flow";
import { channelOf } from "@/lib/sectors";
import { stage, useStage } from "@/lib/stage-store";
import { BroadcastBar, ChannelChange, SectorRail, Ticker } from "./Broadcast";
import HeroOverlay from "./HeroOverlay";
import Lap from "./Lap";
import StartLights from "./StartLights";
import styles from "./home.module.css";

// three.js and friends load after the page has painted.
const Scene = dynamic(() => import("@/components/scene/Scene"), { ssr: false });

const INTRO_SEEN_KEY = "intro-seen";

function supportsWebGL2() {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

/** The 3D stage, fixed behind the whole page. Memoised: scrolling never re-renders it. */
const StageLayer = memo(function StageLayer() {
  const webglFailed = useStage((s) => s.webglFailed);
  return (
    <div className={styles.canvas} aria-hidden="true">
      {webglFailed ? (
        <div className={styles.fallback} />
      ) : (
        <ErrorBoundary onError={() => stage.set({ webglFailed: true })}>
          <Scene />
        </ErrorBoundary>
      )}
    </div>
  );
});

const Coverage = memo(function Coverage() {
  return <CoverageBody variant="broadcast" />;
});

/**
 * One continuous broadcast: lights out on the opening shot, then the lap (the
 * car drives the circuit past a gantry for each milestone), then the written
 * coverage scrolls in over the parked car (the race channel: the work),
 * switches to the match channel for the personal half, and finishes at contact.
 */
export default function Home() {
  const phase = useStage((s) => s.phase);
  const scrolled = useStage((s) => s.scrolled);
  const channel = useStage((s) => channelOf(s.section));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    stage.set({
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      webglFailed: !supportsWebGL2(),
      // Returning visitors in the same session skip the start sequence.
      skipIntro: sessionStorage.getItem(INTRO_SEEN_KEY) === "1",
      // Backdrop preview: /?bg=pit, grid, straight or studio.
      backdrop: parseBackdrop(params.get("bg")) ?? "studio",
      // /?car=built shows the logo-free Blender car instead of the downloaded one.
      car: parseCar(params.get("car")) ?? "downloaded",
      hydrated: true,
    });
    return startFlow();
  }, []);

  useEffect(() => {
    if (phase === "live") sessionStorage.setItem(INTRO_SEEN_KEY, "1");
  }, [phase]);

  return (
    <main className={styles.main} data-phase={phase} data-scrolled={scrolled} data-channel={channel}>
      <StageLayer />
      <div className={styles.dim} data-flow aria-hidden="true" />
      <div className={styles.glow} aria-hidden="true" />

      <BroadcastBar />
      <SectorRail />
      <ChannelChange />

      <section id="top" className={styles.hero} aria-label="Opening">
        <StartLights />
        <HeroOverlay />
      </section>

      <Lap />
      <Coverage />
      <Ticker />
    </main>
  );
}
