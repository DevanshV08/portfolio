"use client";

import { useEffect, useRef } from "react";
import { site } from "@/content/site";
import { setAudio } from "@/lib/engine-audio";
import { SECTORS, channelOf } from "@/lib/sectors";
import { lapDriven, stage, useStage } from "@/lib/stage-store";
import styles from "./home.module.css";

function formatClock(ms: number) {
  const total = Math.floor(ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

/**
 * Bar label during the lap: the gantry the car is parked at, or "→" and the one it's driving to
 * (just the lap when it's a plain list).
 */
function lapLabel(index: number, heading: number, driven: boolean) {
  if (!driven) return { tag: "Lap", text: `${site.lap.length} milestones` };
  const k = index >= 0 ? index : heading;
  const arrow = index < 0 ? "→ " : "";
  if (k <= 0) return { tag: "Lap", text: "Grid" };
  if (k > site.lap.length) return { tag: `${arrow}Lap`, text: "Finish" };
  return { tag: `${arrow}T${k}`, text: site.lap[k - 1].title };
}

/**
 * The broadcast bar pinned to the top for the whole page: the LIVE bug, then
 * the race clock at the start, your name and the current sector once the
 * coverage is rolling, plus the channel switch and a lap-progress line.
 */
export function BroadcastBar() {
  const section = useStage((s) => s.section);
  const lapIndex = useStage((s) => s.lapIndex);
  const lapHeading = useStage((s) => s.lapHeading);
  const driven = useStage(lapDriven);
  const channel = channelOf(section);
  const clock = useRef<HTMLSpanElement>(null);
  const index = SECTORS.findIndex((s) => s.id === section);
  const current =
    section === "lap"
      ? lapLabel(lapIndex, lapHeading, driven)
      : index >= 0
        ? { tag: `S${index + 1}`, text: SECTORS[index].label }
        : null;

  // Session clock, written straight to the DOM so React doesn't re-render.
  useEffect(() => {
    const start = performance.now();
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last > 50 && clock.current) {
        clock.current.textContent = formatClock(now - start);
        last = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <header className={styles.bar} data-overlay>
      <div className={styles.bug}>
        <span className={styles.liveTag}>
          <span className={styles.liveDot} aria-hidden="true" />
          Live
        </span>
        <span className={styles.channel}>
          <span className={styles.atStart}>Race · 2013</span>
          <span className={styles.inCoverage}>{site.name}</span>
        </span>
        {current && (
          <span className={styles.sector} key={`${current.tag}-${current.text}`}>
            <b>{current.tag}</b> {current.text}
          </span>
        )}
        <span className={styles.clock} ref={clock} aria-hidden="true">
          00:00.000
        </span>
      </div>
      <div className={styles.barEnd}>
        {driven && <AudioToggle />}
        <nav className={styles.channels} aria-label="Channels">
          <a className={styles.channelBtn} href="#top" aria-current={channel === "race" ? "true" : undefined}>
            Race
          </a>
          <a className={styles.channelBtn} href="#about" aria-current={channel === "match" ? "true" : undefined}>
            Match
          </a>
        </nav>
      </div>
      <span className={styles.progressLine} data-flow aria-hidden="true" />
    </header>
  );
}

/** Onboard audio on or off. Never on by itself: the click is what's allowed to start sound. */
function AudioToggle() {
  const on = useStage((s) => s.audio);
  return (
    <button
      type="button"
      className={styles.audioBtn}
      aria-pressed={on}
      title="Engine and wind sound while the car drives the lap"
      onClick={() => {
        const next = !stage.get().audio;
        stage.set({ audio: setAudio(next) && next });
      }}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M3 7.5h3.2L11 3.6v12.8l-4.8-3.9H3z" />
        {on ? (
          <path className={styles.audioWaves} d="M13.6 7.2a4 4 0 0 1 0 5.6M15.8 5a7.1 7.1 0 0 1 0 10" />
        ) : (
          <path className={styles.audioWaves} d="m13.5 7.5 5 5m0-5-5 5" />
        )}
      </svg>
      <span className={styles.audioLabel}>Onboard audio</span>
    </button>
  );
}

/**
 * Broadcast transitions, played with the Web Animations API so React doesn't
 * re-render for them: a dip to black while the 3D set changes (opening shot to
 * circuit and back), and a channel change with static when the page crosses
 * from the race half (the work) to the match half (who you are).
 */
export function ChannelChange() {
  const osd = useRef<HTMLDivElement>(null);
  const noise = useRef<HTMLDivElement>(null);
  const cut = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const show = (text: string, withNoise: boolean) => {
      const reduced = stage.get().reducedMotion;
      if (osd.current) {
        osd.current.textContent = text;
        osd.current.animate(
          [
            { opacity: 0, transform: "translateY(-6px)" },
            { opacity: 1, transform: "none", offset: 0.12 },
            { opacity: 1, offset: 0.78 },
            { opacity: 0 },
          ],
          { duration: reduced ? 1200 : 1700, easing: "ease-out" },
        );
      }
      if (withNoise && noise.current && !reduced) {
        noise.current.animate(
          [
            { opacity: 0, transform: "translateY(-4%)" },
            { opacity: 0.55, transform: "translateY(2%)", offset: 0.25 },
            { opacity: 0.2, transform: "translateY(-1%)", offset: 0.6 },
            { opacity: 0, transform: "none" },
          ],
          { duration: 420, easing: "steps(6, end)" },
        );
      }
    };

    let channel = channelOf(stage.get().section);
    let set = stage.get().set;
    return stage.subscribe(() => {
      const s = stage.get();
      if (s.set !== set) {
        set = s.set;
        // Dip to black: dark by the time the scene swaps sets underneath (Scene's cut delay).
        if (cut.current && !s.reducedMotion) {
          cut.current.animate(
            [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }],
            { duration: 620, easing: "ease-in-out" },
          );
        }
        show(set === "circuit" ? "LIVE · THE LAP" : "LIVE · PIT LANE", false);
      }
      const next = channelOf(s.section);
      if (next !== channel) {
        channel = next;
        show(next === "match" ? "CH 2 · MATCH" : "CH 1 · RACE", true);
      }
    });
  }, []);

  return (
    <>
      <div className={styles.cut} ref={cut} aria-hidden="true" />
      <div className={styles.noise} ref={noise} aria-hidden="true" data-overlay />
      <div className={styles.osd} ref={osd} aria-hidden="true" data-overlay />
    </>
  );
}

/** Sector markers down the right edge: where you are on the page, and a jump to any sector. */
export function SectorRail() {
  const section = useStage((s) => s.section);
  const driven = useStage(lapDriven);
  const marks = [...(driven ? [{ id: "lap", label: "The lap", tag: "Lap" }] : []), ...SECTORS.map((s, i) => ({ id: s.id, label: s.label, tag: `S${i + 1}` }))];
  return (
    <nav className={styles.rail} aria-label="Sectors" data-overlay>
      <span className={styles.railTrack} aria-hidden="true">
        <span className={styles.railFill} data-flow />
      </span>
      <ol>
        {marks.map((m) => (
          <li key={m.id}>
            <a href={`#${m.id}`} aria-current={section === m.id ? "true" : undefined}>
              <span className={styles.railDot} aria-hidden="true" />
              <span className={styles.railLabel}>
                {m.tag} · {m.label}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** The news ticker along the bottom for the whole broadcast. */
export function Ticker() {
  if (site.ticker.length === 0) return null;
  return (
    <div className={styles.ticker} aria-hidden="true" data-overlay>
      <div className={styles.tickerTrack}>
        {[0, 1].map((copy) => (
          <ul key={copy} className={styles.tickerRow}>
            {site.ticker.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
