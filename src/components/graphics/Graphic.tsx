import type { CSSProperties, ReactNode } from "react";
import { site, type Graphic as GraphicSpec } from "@/content/site";
import styles from "./graphics.module.css";

/*
 * Data graphics in the broadcast's style, one per achievement. Static markup
 * with no hooks, so they render into the HTML and work without JavaScript.
 *
 * Drawn complete by default. `play` runs the build-in animation: the lap
 * plays the graphic of the caption on screen, and <PlayOnView> plays coverage
 * graphics as they scroll in ("armed" holds them at the first frame until then).
 * Hidden from screen readers: the text next to each graphic says the same.
 */

export type Play = boolean | "armed";

/** Passes CSS custom properties through React's style typing. */
const vars = (values: Record<string, string | number>) => values as CSSProperties;
const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

export default function Graphic({ graphic, play = false }: { graphic: GraphicSpec; play?: Play }) {
  return (
    <div className={styles.root} data-kind={graphic.kind} data-play={String(play)} data-tip={graphic.tip} aria-hidden="true">
      {draw(graphic)}
    </div>
  );
}

function draw(g: GraphicSpec): ReactNode {
  switch (g.kind) {
    case "podium":
      return <Podium {...g} />;
    case "units":
      return <Units {...g} />;
    case "papers":
      return <Papers />;
    case "layers":
      return <Layers {...g} />;
    case "flow":
      return <Flow {...g} />;
    case "span":
      return <Span {...g} />;
    case "range":
      return <Range {...g} />;
    case "vault":
      return <Vault {...g} />;
    case "keyspace":
      return <Keyspace {...g} />;
  }
}

type Of<K extends GraphicSpec["kind"]> = Extract<GraphicSpec, { kind: K }>;

/* ---------- Podium ---------- */

function Podium({ place, label }: Of<"podium">) {
  // Broadcast order, 2-1-3; the steps rise third, second, then first.
  const steps = [
    { p: 2, h: 36, order: 1 },
    { p: 1, h: 52, order: 2 },
    { p: 3, h: 26, order: 0 },
  ];
  return (
    <div className={styles.podium}>
      {steps.map((s) => (
        <div
          key={s.p}
          className={cx(styles.step, styles.rise)}
          data-lit={s.p === place}
          style={vars({ "--h": `${s.h}px`, "--d": s.order * 140 })}
        >
          <span className={styles.stepNum}>{s.p}</span>
        </div>
      ))}
      <span className={cx(styles.podiumLabel, styles.pop)} style={vars({ "--d": 520 })}>
        P{place} · {label}
      </span>
    </div>
  );
}

/* ---------- Unit chart ---------- */

/** Marks per row in a dot field. */
const COLS = 50;

function Units({ groups, notes }: Of<"units">) {
  const after = groups.length * 260;
  return (
    <div className={styles.units}>
      {groups.map((g, i) => {
        const start = i * 260;
        return (
          <div key={g.label} className={styles.group}>
            <span className={cx(styles.groupLabel, styles.fadeUp)} style={vars({ "--d": start })}>
              <b>{g.value ?? `${g.count}${g.plus ? "+" : ""}`}</b> {g.label}
              {g.each && <span className={styles.each}> · one mark = {g.each}</span>}
            </span>
            <Marks count={g.count} mark={g.mark ?? "dot"} plus={g.plus} delay={start + 80} />
          </div>
        );
      })}
      {notes && (
        <ul className={styles.notes}>
          {notes.map((n, i) => (
            <li key={n} className={styles.fadeUp} style={vars({ "--d": after + i * 90 })}>
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Marks({ count, mark, plus, delay }: { count: number; mark: "dot" | "cross" | "coin"; plus?: boolean; delay: number }) {
  if (mark === "dot") {
    // Whole rows as one patterned block, then the remainder: exact counts without hundreds of elements.
    const rows = Math.floor(count / COLS);
    const rest = count % COLS;
    return (
      <span className={styles.dotsWrap}>
        <span className={styles.dots}>
          {rows > 0 && (
            <span className={cx(styles.field, styles.wipe)} style={vars({ "--cols": COLS, "--rows": rows, "--d": delay })} />
          )}
          {rest > 0 && (
            <span
              className={cx(styles.field, styles.wipe)}
              style={vars({ "--cols": rest, "--rows": 1, "--d": delay + (rows > 0 ? 500 : 0) })}
            />
          )}
        </span>
        {plus && (
          <span className={cx(styles.plus, styles.pop)} style={vars({ "--d": delay + 700 })}>
            +
          </span>
        )}
      </span>
    );
  }
  return (
    <span className={styles.icons}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={cx(mark === "coin" ? styles.coin : styles.cross, styles.pop)} style={vars({ "--d": delay + i * 110 })}>
          {mark === "coin" ? (
            "₹"
          ) : (
            <svg viewBox="0 0 12 12">
              <path d="M4.2 0h3.6v4.2H12v3.6H7.8V12H4.2V7.8H0V4.2h4.2z" />
            </svg>
          )}
        </span>
      ))}
    </span>
  );
}

/* ---------- Papers ---------- */

function Papers() {
  const papers = [...site.publications].sort((a, b) => a.year - b.year);
  return (
    <ol className={styles.papers}>
      {papers.map((p, i) => (
        <li key={p.title} className={styles.fadeUp} style={vars({ "--d": i * 160 })}>
          <svg className={styles.sheet} viewBox="0 0 22 28">
            <path d="M1 1h13l7 7v19H1z" />
            <path d="M14 1v7h7M5 13h12M5 17h12M5 21h8" />
          </svg>
          <span className={styles.paperYear}>{p.year}</span>
          <span className={styles.paperTopic}>{p.topic}</span>
        </li>
      ))}
    </ol>
  );
}

/* ---------- Layers ---------- */

function Layers({ rows }: Of<"layers">) {
  return (
    <dl className={styles.layers}>
      {rows.map((r, i) => (
        <div key={r.label} className={cx(styles.layer, styles.wipe)} style={vars({ "--d": i * 120 })}>
          <dt>{r.label}</dt>
          <dd>
            {r.items.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------- Flow ---------- */

function Flow({ columns, note }: Of<"flow">) {
  const cells: ReactNode[] = [];
  columns.forEach((column, c) => {
    if (c > 0) cells.push(<Links key={`links-${c}`} from={columns[c - 1].length} to={column.length} delay={c * 260 - 130} />);
    cells.push(
      <div key={`col-${c}`} className={styles.column}>
        {column.map((box) => (
          <div key={box} className={styles.cell}>
            <span
              className={cx(styles.box, styles.pop)}
              // The single box in a middle column is the step everything passes through.
              data-hub={column.length === 1 && c > 0 && c < columns.length - 1}
              style={vars({ "--d": c * 260 })}
            >
              {box}
            </span>
          </div>
        ))}
      </div>,
    );
  });
  return (
    <div>
      <div className={styles.flow} style={vars({ "--h": `${Math.max(...columns.map((c) => c.length)) * 30}px` })}>
        {cells}
      </div>
      {note && (
        <p className={cx(styles.note, styles.fadeUp)} style={vars({ "--d": columns.length * 260 })}>
          {note}
        </p>
      )}
    </div>
  );
}

/** Wires from every box in one column to every box in the next. */
function Links({ from, to, delay }: { from: number; to: number; delay: number }) {
  const paths: string[] = [];
  for (let a = 0; a < from; a++) {
    for (let b = 0; b < to; b++) {
      const y1 = (((a + 0.5) / from) * 100).toFixed(2);
      const y2 = (((b + 0.5) / to) * 100).toFixed(2);
      paths.push(`M0 ${y1}C50 ${y1} 50 ${y2} 100 ${y2}`);
    }
  }
  return (
    <svg className={cx(styles.links, styles.wipe)} viewBox="0 0 100 100" preserveAspectRatio="none" style={vars({ "--d": delay })}>
      {paths.map((d) => (
        <path key={d} d={d} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

/* ---------- Span of years ---------- */

function Span({ from, to, labels }: Of<"span">) {
  const years = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return (
    <div className={styles.span}>
      <div className={styles.spanTrack}>
        <span className={cx(styles.spanFill, styles.growX)} />
        {years.map((y, i) => (
          <span key={y} className={styles.spanTick} style={vars({ "--x": i / (years.length - 1) })}>
            <span>{y}</span>
          </span>
        ))}
        <span className={cx(styles.spanFlag, styles.pop)} style={vars({ "--d": 900 })} />
      </div>
      <div className={styles.spanEnds}>
        <span className={styles.fadeUp}>{labels[0]}</span>
        <span className={styles.fadeUp} style={vars({ "--d": 900 })}>
          {labels[1]}
        </span>
      </div>
    </div>
  );
}

/* ---------- Measured range ---------- */

const two = (v: number) => v.toFixed(2);

function Range({ from, to, max, label, factor }: Of<"range">) {
  const step = max / 3;
  const ticks = [0, 1, 2, 3].map((i) => i * step);
  return (
    <div className={styles.range} style={vars({ "--a": from / max, "--b": to / max })}>
      <div className={styles.rangeHead}>
        <b className={cx(styles.factor, styles.pop)} style={vars({ "--d": 900 })}>
          {factor}
        </b>
        <span>{label}</span>
      </div>
      <div className={styles.axis}>
        <span className={cx(styles.band, styles.growX)} style={vars({ "--d": 200 })} />
        <span className={styles.end} data-end="low">
          {two(from)}
        </span>
        <span className={cx(styles.end, styles.pop)} data-end="high" style={vars({ "--d": 800 })}>
          {two(to)}
        </span>
        {ticks.map((t) => (
          <span key={t} className={styles.tick} style={vars({ "--x": t / max })}>
            {two(t)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- The password vault ---------- */

function Vault({ secret, never, tests }: Of<"vault">) {
  return (
    <div className={styles.vault}>
      <div className={styles.parties}>
        <div className={styles.party}>
          <span className={styles.partyName}>Client</span>
          <span className={styles.secret}>
            <svg viewBox="0 0 16 16">
              <path d="M5 7V5a3 3 0 0 1 6 0v2M3.5 7h9v7h-9z" />
            </svg>
            {secret}
          </span>
        </div>
        <div className={styles.wire}>
          <span className={cx(styles.wireLine, styles.growX)} />
          <span className={cx(styles.blocked, styles.pop)} style={vars({ "--d": 500 })}>
            ✕
          </span>
        </div>
        <div className={styles.party}>
          <span className={styles.partyName}>Server</span>
          <ul className={styles.never}>
            {never.map((n, i) => (
              <li key={n} className={styles.fadeUp} style={vars({ "--d": 600 + i * 120 })}>
                never {n}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className={styles.tests}>
        <span className={styles.testCells}>
          {Array.from({ length: tests.total }, (_, i) => (
            <span key={i} className={styles.pop} data-pass={i < tests.passed} style={vars({ "--d": 900 + i * 60 })} />
          ))}
        </span>
        <span>
          <b>
            {tests.passed}/{tests.total}
          </b>{" "}
          tests pass
        </span>
      </div>
    </div>
  );
}

/* ---------- Keyspace ---------- */

function Keyspace({ bits, before, after }: Of<"keyspace">) {
  return (
    <div className={styles.keyspace}>
      <div className={styles.keyGrid}>
        <span className={cx(styles.sweep, styles.sweepRun)} />
      </div>
      <div className={styles.keyText}>
        <span className={styles.keyCount}>
          <b>
            2<sup>{bits}</sup>
          </b>
          {(2 ** bits).toLocaleString("en-US")} keys to search
        </span>
        <span className={styles.compare}>
          <span className={cx(styles.slow, styles.fadeUp)} style={vars({ "--d": 300 })}>
            {before}
          </span>
          <span className={styles.arrow}>→</span>
          <span className={cx(styles.fast, styles.pop)} style={vars({ "--d": 1500 })}>
            {after}
          </span>
        </span>
      </div>
    </div>
  );
}
