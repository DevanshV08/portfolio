import { Fragment, type CSSProperties } from "react";
import type { Position } from "@/content/site";
import styles from "./charts.module.css";

/*
 * Career as a strategy chart: a row per role, a column per year, a stint
 * across the years each role was held. Year resolution only, like the
 * periods it's drawn from — a lit year means "held that year", not a length
 * of time within it. Static and hook-free.
 */

type Stint = { org: string; title: string; from: number; to: number; ongoing: boolean };

/** "2023 – 2024", "2026", "2026 – present". */
function parse(period: string, latest: number) {
  const [a, b] = period.split(/\s*[–-]\s*/);
  const from = Number(a);
  const ongoing = b?.trim().toLowerCase() === "present";
  const to = ongoing ? latest : b ? Number(b) : from;
  return { from, to, ongoing };
}

export default function StintChart({ positions }: { positions: Position[] }) {
  const years = positions.flatMap((p) => p.period.match(/\d{4}/g)?.map(Number) ?? []);
  if (years.length === 0) return null;
  const first = Math.min(...years);
  const latest = Math.max(...years);
  const stints: Stint[] = positions
    .map((p) => ({ org: p.org, title: p.title, ...parse(p.period, latest) }))
    .filter((s) => Number.isFinite(s.from) && Number.isFinite(s.to))
    // Oldest first, so the chart steps down and to the right.
    .reverse()
    .sort((x, y) => x.from - y.from);
  const columns = Array.from({ length: latest - first + 1 }, (_, i) => first + i);

  return (
    <figure
      className={styles.stints}
      aria-hidden="true"
      style={{ "--years": columns.length, "--rows": stints.length } as CSSProperties}
    >
      <figcaption className={styles.chartCaption}>
        <span>Strategy chart</span> each stint, by year
      </figcaption>
      <div className={styles.stintGrid}>
        {columns.map((y, i) => (
          <span key={`rule-${y}`} className={styles.rule} style={{ gridColumn: i + 2, gridRow: "1 / -1" }} />
        ))}
        <span style={{ gridRow: 1, gridColumn: 1 }} />
        {columns.map((y, i) => (
          <span key={y} className={styles.yearHead} style={{ gridRow: 1, gridColumn: i + 2 }}>
            {y}
          </span>
        ))}
        {stints.map((s, row) => (
          <Fragment key={`${s.org}-${s.from}`}>
            <span className={styles.stintLabel} style={{ gridRow: row + 2 }}>
              <b>{s.org}</b>
              <span>{s.title}</span>
            </span>
            <span
              className={styles.stintBar}
              data-ongoing={s.ongoing}
              style={
                {
                  gridRow: row + 2,
                  gridColumn: `${s.from - first + 2} / ${s.to - first + 3}`,
                  "--row": row,
                } as CSSProperties
              }
            >
              <span className={styles.compound} aria-hidden="true" />
              {s.ongoing ? `${s.from} → now` : s.from === s.to ? s.from : `${s.from}–${String(s.to).slice(2)}`}
            </span>
          </Fragment>
        ))}
      </div>
    </figure>
  );
}
