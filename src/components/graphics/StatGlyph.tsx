import type { CSSProperties } from "react";
import type { StatGlyph as Glyph } from "@/content/site";
import styles from "./graphics.module.css";

/*
 * The small mark under a headline number in the stat band: the range behind
 * a factor, a keyspace swept full, or one mark per day, paper or lakh.
 * Static, and hidden from screen readers (the number and label say it).
 */
export default function StatGlyph({ glyph }: { glyph: Glyph }) {
  if (glyph.kind === "range") {
    return (
      <span
        className={styles.statRange}
        style={{ "--a": glyph.from / glyph.max, "--b": glyph.to / glyph.max } as CSSProperties}
        aria-hidden="true"
      >
        <span />
      </span>
    );
  }
  if (glyph.kind === "grid") {
    return <span className={styles.statGrid} aria-hidden="true" />;
  }
  return (
    <span className={styles.statMarks} data-mark={glyph.mark} aria-hidden="true">
      {Array.from({ length: glyph.count }, (_, i) => (
        <span key={i}>{glyph.mark === "coin" ? "₹" : null}</span>
      ))}
    </span>
  );
}
