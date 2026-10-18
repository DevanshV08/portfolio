import type { ReactNode } from "react";
import { GLOSSARY, glossarize, glossaryId, lookupTerm } from "@/content/glossary";
import { site } from "@/content/site";
import styles from "./glossary.module.css";

/*
 * Jargon explained on hover or focus. Static and hook-free, so it renders in
 * the HTML for both pages; GlossaryTips (client) only nudges a tooltip back on
 * screen. Each term points at a hidden definition (GlossaryDefs) through
 * aria-describedby, so screen readers get the same explanation.
 */

/** Stable id for a skill's hidden description. */
export const skillId = (index: number) => `skill-about-${index}`;

/** One explained term inside a sentence. */
export function Term({ index, children }: { index: number; children: ReactNode }) {
  return (
    <span className={styles.term} tabIndex={0} data-term="" aria-describedby={glossaryId(index)}>
      {children}
      <span className={styles.tip} aria-hidden="true">
        <b>{children}</b> {GLOSSARY[index].text}
      </span>
    </span>
  );
}

/** Text with its jargon marked: the first mention of each glossary term gets a tooltip. */
export function Glossed({ text }: { text: string }) {
  return (
    <>
      {glossarize(text).map((part, i) =>
        typeof part === "string" ? (
          part
        ) : (
          <Term key={i} index={part.index}>
            {part.text}
          </Term>
        ),
      )}
    </>
  );
}

/** A stack chip ("Docker", "AES-GCM") explained by the glossary, when it has an entry. */
export function StackItem({ label }: { label: string }) {
  const hit = lookupTerm(label);
  if (!hit) return <>{label}</>;
  return (
    <span className={styles.chipTerm} tabIndex={0} data-term="" aria-describedby={glossaryId(hit.index)}>
      {label}
      <span className={styles.tip} aria-hidden="true">
        <b>{label}</b> {hit.entry.text}
      </span>
    </span>
  );
}

/** A skill chip: what the skill is, and where it was proven. */
export function SkillItem({ index }: { index: number }) {
  const skill = site.skills[index];
  return (
    <span className={styles.chipTerm} tabIndex={0} data-term="" aria-describedby={skillId(index)}>
      {skill.name}
      <span className={styles.tip} aria-hidden="true">
        <b>{skill.name}</b> {skill.about}
        <em className={styles.tipExtra}>Proven at: {skill.proof}</em>
      </span>
    </span>
  );
}

/** The hidden definitions every term and skill chip points at. Render once per page. */
export function GlossaryDefs() {
  return (
    <div hidden>
      {GLOSSARY.map((entry, i) => (
        <span key={`g${i}`} id={glossaryId(i)}>
          {entry.text}
        </span>
      ))}
      {site.skills.map((skill, i) => (
        <span key={`s${i}`} id={skillId(i)}>
          {skill.about} Proven at: {skill.proof}.
        </span>
      ))}
    </div>
  );
}
