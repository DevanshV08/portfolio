"use client";

import { site } from "@/content/site";
import { BACKDROPS, isPhotoBackdrop, type BackdropId } from "@/lib/backdrops";
import { DOWNLOADED_CAR_CREDIT } from "@/lib/cars";
import { stage, useStage } from "@/lib/stage-store";
import styles from "./home.module.css";

/** Backdrop preview: switches live and keeps the choice in the address (?bg=) so it can be shared. */
function chooseBackdrop(id: BackdropId) {
  stage.set({ backdrop: id });
  const url = new URL(window.location.href);
  if (id === "studio") url.searchParams.delete("bg");
  else url.searchParams.set("bg", id);
  window.history.replaceState(null, "", url);
}

/**
 * The opening shot's graphics: name, role and the recruiter actions in plain
 * HTML (visible before any 3D has loaded), the backdrop switcher and the DRS
 * HUD. The whole layer lifts away as the coverage scrolls in.
 */
export default function HeroOverlay() {
  const phase = useStage((s) => s.phase);
  const drsOpen = useStage((s) => s.drsOpen);
  const backdrop = useStage((s) => s.backdrop);
  const downloadedCar = useStage((s) => s.car === "downloaded");
  const photo = isPhotoBackdrop(backdrop);

  return (
    <div className={styles.heroLayer} data-flow data-overlay>
      <div className={styles.backdrops} role="group" aria-label="Backdrop preview">
        <span className={styles.backdropsLabel} aria-hidden="true">
          Backdrop
        </span>
        {BACKDROPS.map((b) => (
          <button
            key={b.id}
            type="button"
            className={styles.backdropBtn}
            aria-pressed={backdrop === b.id}
            onClick={() => chooseBackdrop(b.id)}
          >
            {b.label}
          </button>
        ))}
      </div>

      <section className={styles.lowerThird} aria-label="Profile">
        <p className={styles.kicker}>{photo ? "No. 1 · 2013 championship car" : "No. 1 · 1:18 collector’s edition"}</p>
        <h1 className={styles.name}>{site.name}</h1>
        <p className={styles.role}>
          {site.role ?? <span className={styles.slot}>Your role goes here</span>}
        </p>
      </section>

      <nav className={styles.actions} aria-label="Portfolio">
        <a className={styles.primary} href="#lap">
          <span className={styles.wideOnly}>Watch&nbsp;</span>the lap <span aria-hidden="true">↓</span>
        </a>
        {site.resumeUrl ? (
          <a className={styles.secondary} href={site.resumeUrl}>
            Résumé
          </a>
        ) : (
          <button type="button" className={styles.secondary} disabled>
            Résumé <small className={styles.soon}>Soon</small>
          </button>
        )}
        <a className={styles.secondary} href="#contact">
          Contact
        </a>
      </nav>

      <div className={styles.hud} data-visible={phase === "live"}>
        <span className={styles.hint}>Drag to turn the car · tap the rear wing · scroll to drive the lap</span>
        <button
          type="button"
          className={styles.drs}
          aria-pressed={drsOpen}
          onClick={() => stage.set({ drsOpen: !drsOpen })}
        >
          <span className={styles.drsLight} data-open={drsOpen} aria-hidden="true" />
          DRS {drsOpen ? "open" : "closed"}
        </button>
      </div>

      <a className={styles.cue} href="#lap" data-visible={phase === "live"} aria-label="Scroll to the lap">
        <span className={styles.cueLine} aria-hidden="true" />
      </a>

      <p className={styles.disclaimer}>
        {downloadedCar ? (
          <>
            3D model: <a href={DOWNLOADED_CAR_CREDIT.url}>“{DOWNLOADED_CAR_CREDIT.title}”</a> by{" "}
            {DOWNLOADED_CAR_CREDIT.author} ({DOWNLOADED_CAR_CREDIT.license}).
          </>
        ) : photo ? (
          "Fan-made model of the 2013 championship car."
        ) : (
          "Fan-made figurine of the 2013 championship car."
        )}{" "}
        Not affiliated with Red Bull Racing or Formula 1.{photo && " Track photos: Poly Haven (CC0)."}
      </p>
    </div>
  );
}
