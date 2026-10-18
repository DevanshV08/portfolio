"use client";

import { useState } from "react";
import { PROOF_PLACES, type ProofPlace, type Skill } from "@/content/site";
import styles from "./charts.module.css";

/*
 * Skills wired to the places that prove them: skills on the left, the jobs
 * and projects on the right, a line for every claim in the skills list. A
 * place's dot grows with the number of skills it proves. Hover a skill to see
 * what it is and where it was used; hover a place to see everything it proves.
 * The skills list stays the accessible version, so this is hidden from screen
 * readers. Renders the same on the server; hovering is the only client state.
 */

const ROW = 36;
const TOP = 22;
const W = 760;
/** Room on the left for each skill's name and, under it, exactly where it was used. */
const LEFT_X = 312;
const RIGHT_X = 566;

type Focus = { skill: number } | { place: ProofPlace } | null;

export default function ProofMap({ skills }: { skills: Skill[] }) {
  const [focus, setFocus] = useState<Focus>(null);
  const used = PROOF_PLACES.filter((p) => skills.some((s) => s.where.includes(p)));
  const height = TOP + Math.max(skills.length, used.length) * ROW;
  const skillY = (i: number) => TOP + (i + 0.5) * ((height - TOP) / skills.length);
  const placeY = (p: ProofPlace) => TOP + (used.indexOf(p) + 0.5) * ((height - TOP) / used.length);
  const proves = (p: ProofPlace) => skills.flatMap((s, i) => (s.where.includes(p) ? [i] : []));
  const link = (i: number, p: ProofPlace) => {
    const y1 = skillY(i);
    const y2 = placeY(p);
    const mid = (LEFT_X + RIGHT_X) / 2;
    return `M${LEFT_X + 8} ${y1.toFixed(1)}C${mid} ${y1.toFixed(1)} ${mid} ${y2.toFixed(1)} ${RIGHT_X - 8} ${y2.toFixed(1)}`;
  };

  // What's lit for the current focus: a skill and its places, or a place and its skills.
  const litSkill = (i: number) =>
    !focus || ("skill" in focus ? focus.skill === i : skills[i].where.includes(focus.place));
  const litPlace = (p: ProofPlace) => !focus || ("skill" in focus ? skills[focus.skill].where.includes(p) : focus.place === p);
  const litLink = (i: number, p: ProofPlace) => !focus || ("skill" in focus ? focus.skill === i : focus.place === p);
  const state = (lit: boolean) => (focus ? (lit ? "lit" : "dim") : undefined);

  return (
    <figure className={styles.proofMap} aria-hidden="true">
      <figcaption className={styles.chartCaption}>
        <span>Proof map</span> every skill, wired to where it was used · hover a skill or a place
      </figcaption>
      <svg viewBox={`0 0 ${W} ${height + 6}`} className={styles.proofSvg} onPointerLeave={() => setFocus(null)}>
        <text x={LEFT_X} y={12} className={styles.colHead} textAnchor="end">
          Skill
        </text>
        <text x={RIGHT_X} y={12} className={styles.colHead}>
          Proven at
        </text>

        {skills.map((s, i) =>
          s.where.map((p) => <path key={`${i}-${p}`} d={link(i, p)} pathLength={1} className={styles.link} data-state={state(litLink(i, p))} />),
        )}

        {used.map((p) => (
          <g key={p} className={styles.place} data-state={state(litPlace(p))} onPointerEnter={() => setFocus({ place: p })}>
            <rect x={RIGHT_X - 14} y={placeY(p) - ROW / 2} width={W - RIGHT_X + 14} height={ROW} className={styles.hit} />
            <circle cx={RIGHT_X} cy={placeY(p)} r={3 + proves(p).length * 1.6} />
            <text x={RIGHT_X + 14} y={placeY(p)} dominantBaseline="central">
              {p}
              <tspan className={styles.degree}> ×{proves(p).length}</tspan>
            </text>
          </g>
        ))}

        {skills.map((s, i) => (
          <g key={s.name} className={styles.skillRow} data-state={state(litSkill(i))} onPointerEnter={() => setFocus({ skill: i })}>
            {/* A wide invisible target, so the whole row reacts to hover. */}
            <rect x={0} y={skillY(i) - ROW / 2} width={LEFT_X + 10} height={ROW} className={styles.hit} />
            <circle cx={LEFT_X} cy={skillY(i)} r={4} className={styles.skillDot} />
            <text x={LEFT_X - 14} y={skillY(i) - 6} textAnchor="end" dominantBaseline="central" className={styles.skillText}>
              {s.name}
            </text>
            <text x={LEFT_X - 14} y={skillY(i) + 9} textAnchor="end" dominantBaseline="central" className={styles.proofText}>
              {s.proof}
            </text>
          </g>
        ))}
      </svg>

      {/* The readout under the map: what the hovered skill or place is about. */}
      <div className={styles.proofPanel} data-open={focus ? "true" : "false"}>
        {!focus && (
          <p className={styles.proofHint}>
            Hover a skill to see what it is and exactly where it was used. Hover a place to see everything it proves; a
            bigger dot proves more.
          </p>
        )}
        {focus && "skill" in focus && (
          <>
            <p className={styles.proofTitle}>
              <b>{skills[focus.skill].name}</b>
              <span>{skills[focus.skill].about}</span>
            </p>
            <p className={styles.proofWhere}>
              Proven at: {skills[focus.skill].proof}
              <span className={styles.proofPlaces}>
                {skills[focus.skill].where.map((p) => (
                  <i key={p}>{p}</i>
                ))}
              </span>
            </p>
          </>
        )}
        {focus && "place" in focus && (
          <>
            <p className={styles.proofTitle}>
              <b>{focus.place}</b>
              <span>
                proves {proves(focus.place).length} skill{proves(focus.place).length === 1 ? "" : "s"}
              </span>
            </p>
            <p className={styles.proofWhere}>
              <span className={styles.proofPlaces}>
                {proves(focus.place).map((i) => (
                  <i key={i}>{skills[i].name}</i>
                ))}
              </span>
            </p>
          </>
        )}
      </div>
    </figure>
  );
}
