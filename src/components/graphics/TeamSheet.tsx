import styles from "./charts.module.css";

/*
 * The match channel's graphic: a football team sheet with a few short lines
 * from the About paragraphs. Hidden from screen readers, since the paragraphs
 * right after it say the same. Static and hook-free.
 */
export default function TeamSheet({ rows }: { rows: { label: string; value: string }[] }) {
  if (rows.length === 0) return null;
  return (
    <figure className={styles.teamSheet} aria-hidden="true">
      <figcaption className={styles.chartCaption}>
        <span className={styles.matchChip}>Team sheet</span> off the track
      </figcaption>
      <dl className={styles.sheetRows}>
        {rows.map((row) => (
          <div key={row.label} className={styles.sheetRow}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}
