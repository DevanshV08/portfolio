import type { Metadata } from "next";
import { CoverageBody, CoverageHero } from "@/components/coverage/Coverage";
import styles from "@/components/coverage/coverage.module.css";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: "Highlights",
  description: `Projects, experience and contact details for ${site.name}.`,
};

/** The fast, plain version of the portfolio for recruiters: the same content, no 3D. */
export default function Highlights() {
  return (
    <main className={styles.page}>
      <span className={styles.topstripe} aria-hidden="true" />
      <CoverageHero />
      <CoverageBody variant="page" />
    </main>
  );
}
