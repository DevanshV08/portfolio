"use client";

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { Glossed, SkillItem } from "@/components/glossary/Glossed";
import Graphic from "@/components/graphics/Graphic";
import { site, type Milestone } from "@/content/site";
import { createDrivetrain, shiftLights, stepDrivetrain } from "@/lib/drivetrain";
import { radioChirp } from "@/lib/engine-audio";
import { getLapPlan, lapKmh, lapState, trackOutline } from "@/lib/lap";
import { lapDriven, stage, useStage } from "@/lib/stage-store";
import styles from "./home.module.css";

const START = {
  year: "2021 → now",
  headline: "Lights out",
  title: "The lap",
  detail: `${site.lap.length} milestones, one lap. Scroll to drive to the next one.`,
};
/** The opening card when the lap is a plain list: nothing to drive. */
const START_LIST = { ...START, detail: `${site.lap.length} milestones, in order.` };
const FINISH: Milestone = {
  year: "Lap complete",
  headline: "Flag",
  title: "Chequered flag",
  detail: "That's the lap. The full story follows below.",
};

const MAP = { width: 200, height: 150, pad: 12 };

/*
 * Skills on the lap: a milestone "proves" the skills whose `where` list names
 * its place (the same links the proof map draws). Each skill counts as
 * unlocked at the first gantry that proves it.
 */
const LAP_SKILLS = (() => {
  /** Skill indices proven at each milestone. */
  const at = site.lap.map((m) =>
    m.place ? site.skills.flatMap((s, k) => (s.where.includes(m.place!) ? [k] : [])) : [],
  );
  /** Caption index (1 = first milestone) where each skill is first proven. */
  const firstAt = new Map<number, number>();
  at.forEach((list, i) => list.forEach((k) => firstAt.has(k) || firstAt.set(k, i + 1)));
  /** Skills in the order they light up; the ones the lap never reaches go last. */
  const order = site.skills.map((_, k) => k).sort((a, b) => (firstAt.get(a) ?? 99) - (firstAt.get(b) ?? 99));
  return { at, firstAt, order };
})();

/** How many skills are lit by caption `active`. */
const skillsLit = (active: number) => LAP_SKILLS.order.filter((k) => (LAP_SKILLS.firstAt.get(k) ?? Infinity) <= active).length;

/** The skills meter: one segment per skill, lit as the lap proves it. */
function SkillMeter({ active }: { active: number }) {
  const lit = skillsLit(active);
  return (
    <div className={styles.skillMeter} aria-hidden="true">
      <span className={styles.skillMeterHead}>
        <span>Skills proven</span>
        <b>
          {lit}
          <small>/{site.skills.length}</small>
        </b>
      </span>
      <span className={styles.skillSegments}>
        {LAP_SKILLS.order.map((k) => {
          const first = LAP_SKILLS.firstAt.get(k);
          return <i key={k} data-on={first !== undefined && first <= active} data-new={first === active} />;
        })}
      </span>
    </div>
  );
}

/** Skills a caption shows: the ones proven at that milestone (new ones flagged), or all of them at the flag. */
function CaptionSkills({ caption }: { caption: number }) {
  const finish = caption === site.lap.length + 1;
  const list = finish ? LAP_SKILLS.order : (LAP_SKILLS.at[caption - 1] ?? []);
  if (list.length === 0) return null;
  return (
    <div className={styles.lapSkills}>
      <span className={styles.lapSkillsLabel}>
        {finish ? `Skills proven on the lap · ${skillsLit(caption)} of ${site.skills.length}` : "Skills proven here"}
      </span>
      <ul>
        {list.map((k) => {
          const first = LAP_SKILLS.firstAt.get(k);
          const state = first === undefined ? "elsewhere" : !finish && first === caption ? "new" : "known";
          return (
            <li key={k} data-state={state}>
              <SkillItem index={k} />
              {state === "new" && <span className={styles.newTag}>New</span>}
              {state === "elsewhere" && <span className={styles.elsewhereTag}>{site.skills[k].proof}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Scrolls to caption k (0 the grid, then one per milestone, then the flag),
 * landing where the car has just pulled up at that gantry.
 */
function goToCaption(k: number) {
  const lap = document.getElementById("lap");
  if (!lap) return;
  const segments = site.lap.length + 1;
  const x = Math.min(segments, Math.max(0, k)) + 0.05;
  const top = lap.getBoundingClientRect().top + window.scrollY;
  const travel = lap.offsetHeight - window.innerHeight;
  window.scrollTo({ top: top + (travel * Math.min(x, segments)) / segments, behavior: "smooth" });
}

/**
 * Runs `tick` every animation frame, but only while the lap section is on
 * screen, so reading the coverage below leaves the page idle. `stopped` runs
 * whenever the loop pauses.
 */
function runWhileLapOnScreen(tick: (now: number) => void, stopped?: () => void) {
  const lap = document.getElementById("lap");
  let frame = 0;
  const loop = (now: number) => {
    tick(now);
    frame = requestAnimationFrame(loop);
  };
  const io = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !frame) {
      frame = requestAnimationFrame(loop);
    } else if (!entry.isIntersecting && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
      stopped?.();
    }
  });
  if (lap) io.observe(lap);
  return () => {
    io.disconnect();
    cancelAnimationFrame(frame);
    stopped?.();
  };
}

/*
 * Onboard telemetry for the car on the lap: speed, gear, shift lights,
 * throttle and brake, styled like the broadcast's driver graphic. It's the
 * 3D car's own motion (its speed scaled to a race-car range), geared by the
 * same drivetrain model the engine sound runs, so the gear and the shift
 * lights match what you hear. Not a claim about anything. Written straight
 * to the DOM.
 */
function Telemetry() {
  const root = useRef<HTMLDivElement>(null);
  const speed = useRef<HTMLElement>(null);
  const gear = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const lap = document.getElementById("lap");
    const car = createDrivetrain();
    let last = performance.now();
    let cine = 0;
    let painted = "";
    const tick = (now: number) => {
      const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000));
      last = now;
      stepDrivetrain(car, lapKmh(lapState.speed), dt, now / 1000);
      const kmh = Math.round(car.kmh);
      const lights = shiftLights(car);
      // Letterbox in for the drive, out as the car parks at a gantry.
      cine = lapState.cine;
      const next = `${kmh}|${car.gear}|${lights.toFixed(2)}|${car.throttle.toFixed(2)}|${car.brake.toFixed(2)}|${cine.toFixed(3)}`;
      if (next !== painted && root.current && speed.current && gear.current) {
        painted = next;
        speed.current.textContent = String(kmh);
        gear.current.textContent = car.gear === 0 ? "N" : String(car.gear);
        root.current.style.setProperty("--rpm", lights.toFixed(3));
        root.current.style.setProperty("--thr", car.throttle.toFixed(3));
        root.current.style.setProperty("--brk", car.brake.toFixed(3));
        lap?.style.setProperty("--cine", cine.toFixed(3));
      }
    };
    // Off screen: the next start doesn't count the time away.
    return runWhileLapOnScreen(tick, () => {
      last = performance.now();
      Object.assign(car, createDrivetrain());
      cine = 0;
      lap?.style.setProperty("--cine", "0");
    });
  }, []);

  return (
    <div className={styles.telemetry} ref={root} aria-hidden="true">
      <span className={styles.tmLabel}>Car 1 · onboard</span>
      <div className={styles.tmMain}>
        <span className={styles.tmSpeed}>
          <b ref={speed}>0</b>
          <small>km/h</small>
        </span>
        <span className={styles.tmGear} ref={gear}>
          N
        </span>
      </div>
      <span className={styles.tmLeds}>
        <span className={styles.tmLedsLit} />
      </span>
      <span className={styles.tmPedals}>
        <span className={styles.tmPedal} data-pedal="throttle">
          <i />
        </span>
        <span className={styles.tmPedal} data-pedal="brake">
          <i />
        </span>
      </span>
    </div>
  );
}

/** Mini map of the circuit with the car's live position, like the broadcast's track graphic. */
function TrackMap({ active }: { active: number }) {
  const plan = getLapPlan(site.lap.length);
  const { d, project } = useMemo(() => trackOutline(MAP.width, MAP.height, MAP.pad), []);
  const ticks = useMemo(() => plan.gantries.map((u) => project(u)), [plan, project]);
  const start = useMemo(() => project(plan.startLine), [plan, project]);
  const car = useRef<SVGCircleElement>(null);

  // The dot follows the 3D car, written straight to the DOM (only when it has moved).
  useEffect(() => {
    let last = NaN;
    return runWhileLapOnScreen(() => {
      if (lapState.u !== last && car.current) {
        last = lapState.u;
        const p = project(last);
        car.current.setAttribute("cx", p.x.toFixed(1));
        car.current.setAttribute("cy", p.y.toFixed(1));
      }
    });
  }, [project]);

  return (
    <svg
      className={styles.map}
      viewBox={`0 0 ${MAP.width} ${MAP.height}`}
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} className={styles.mapTrack} />
      <path d={d} className={styles.mapLine} />
      <rect x={start.x - 1.5} y={start.y - 5} width={3} height={10} className={styles.mapStart} />
      {ticks.map((t, i) => (
        <circle key={i} cx={t.x} cy={t.y} r={i + 1 === active ? 4 : 2.2} className={styles.mapTick} data-on={i + 1 <= active} />
      ))}
      <circle ref={car} cx={start.x} cy={start.y} r={4.5} className={styles.mapCar} />
    </svg>
  );
}

/**
 * The lap: the car drives the circuit as you scroll, passing a gantry for each
 * milestone. Captions are plain HTML, one per milestone; when the lap can't be
 * driven (no WebGL, reduced motion, before hydration) they're a simple list.
 */
export default function Lap() {
  const driven = useStage(lapDriven);
  /** Caption on screen (-1 while the car drives) and the gantry it's parked at or heading for. */
  const active = useStage((s) => s.lapIndex);
  const heading = useStage((s) => s.lapHeading);
  /** Skills count up to the last gantry reached. */
  const reached = active >= 0 ? active : Math.max(0, heading - 1);
  const items: Milestone[] = [driven ? START : START_LIST, ...site.lap, FINISH];
  const segments = site.lap.length + 1;

  // ← and → step between milestones while the lap is on screen.
  useEffect(() => {
    if (!driven) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const { section, lapHeading } = stage.get();
      if (section !== "lap") return;
      e.preventDefault();
      goToCaption(lapHeading + (e.key === "ArrowRight" ? 1 : -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [driven]);

  // A team-radio blip as each new caption comes up (only with the onboard audio on).
  const shownIndex = useRef(active);
  useEffect(() => {
    if (shownIndex.current === active) return;
    shownIndex.current = active;
    if (driven && active > 0) radioChirp();
  }, [active, driven]);

  return (
    <section
      id="lap"
      className={styles.lap}
      data-mode={driven ? "drive" : "list"}
      // Out on the lap, the title steps aside so it never sits over a gantry board.
      data-racing={heading > 0 && heading <= site.lap.length}
      style={{ "--segments": segments } as CSSProperties}
      aria-labelledby="lap-title"
    >
      <div className={styles.lapStage}>
        {driven && <div className={styles.lapCine} aria-hidden="true" />}
        <header className={styles.lapHead}>
          <p className={styles.lapKicker}>The lap · 2021 → now</p>
          <h2 id="lap-title" className={styles.lapTitle}>
            {site.lap.length} milestones, one lap
          </h2>
          <a className={styles.lapSkip} href="#coverage">
            Skip to the details ↓
          </a>
        </header>

        <ol className={styles.lapCards}>
          {items.map((item, i) => (
            <li
              key={`${item.title}-${i}`}
              className={styles.lapCard}
              data-active={i === active}
              data-edge={i === 0 || i === items.length - 1}
            >
              <span className={styles.lapTurn}>
                {i === 0 ? "Grid" : i === items.length - 1 ? "Finish" : `T${i}`}
                <b>{item.year}</b>
              </span>
              <span className={styles.lapHeadline}>
                {item.headline}
                {item.unit && <span className={styles.lapUnit}>{item.unit}</span>}
              </span>
              <h3 className={styles.lapCardTitle}>
                <Glossed text={item.title} />
              </h3>
              <p className={styles.lapDetail}>
                <Glossed text={item.detail} />
              </p>
              {item.graphic && (
                <div className={styles.lapGraphic}>
                  <Graphic graphic={item.graphic} play={driven && i === active} />
                </div>
              )}
              <CaptionSkills caption={i} />
            </li>
          ))}
        </ol>

        {driven && (
          <div className={styles.lapMapBox}>
            <Telemetry />
            <SkillMeter active={reached} />
            <TrackMap active={heading} />
            <div className={styles.lapCounterRow}>
              <button
                type="button"
                className={styles.lapStep}
                aria-label="Previous milestone"
                title="Previous milestone (←)"
                disabled={heading <= 0}
                onClick={() => goToCaption(heading - 1)}
              >
                ‹
              </button>
              <span className={styles.lapCounter}>
                {heading === 0 ? "Grid" : heading > site.lap.length ? "Finish" : `T${heading} / ${site.lap.length}`}
              </span>
              <button
                type="button"
                className={styles.lapStep}
                aria-label="Next milestone"
                title="Next milestone (→)"
                disabled={heading > site.lap.length}
                onClick={() => goToCaption(heading + 1)}
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
