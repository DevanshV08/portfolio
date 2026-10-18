import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { site } from "@/content/site";
import { GlossaryDefs, Glossed, StackItem } from "@/components/glossary/Glossed";
import GlossaryTips from "@/components/glossary/GlossaryTips";
import PlayOnView from "@/components/graphics/PlayOnView";
import ProofMap from "@/components/graphics/ProofMap";
import StintChart from "@/components/graphics/StintChart";
import StatGlyph from "@/components/graphics/StatGlyph";
import TeamSheet from "@/components/graphics/TeamSheet";
import { SECTORS, type SectorId } from "@/lib/sectors";
import styles from "./coverage.module.css";

/*
 * The portfolio content, shared by the home page (where it scrolls over the
 * 3D broadcast) and /highlights (the plain, no-3D version). Static markup with
 * no hooks, so it renders into the HTML and works without JavaScript.
 */

/** A clearly marked empty slot for content that hasn't been provided yet. */
function Slot({ children }: { children: ReactNode }) {
  return <span className={styles.slot}>{children}</span>;
}

function sector(id: SectorId) {
  const index = SECTORS.findIndex((s) => s.id === id);
  return { index: String(index + 1), title: SECTORS[index].title };
}

/** A sector: the section, its scroll anchor and its broadcast-style heading. */
function Sector({ id, className, children }: { id: SectorId; className?: string; children: ReactNode }) {
  const { index, title } = sector(id);
  return (
    <section
      id={id}
      data-sector={id}
      className={`${styles.section} ${className ?? ""}`}
      aria-labelledby={`${id}-title`}
    >
      <div className={styles.head}>
        <span className={styles.headIndex}>S{index}</span>
        <h2 id={`${id}-title`} className={styles.headTitle}>
          {title}
        </h2>
        <span className={styles.headRule} aria-hidden="true" />
      </div>
      {children}
    </section>
  );
}

/** Links styled as a pit board. */
export function PitBoard() {
  return (
    <ul className={styles.pitboard}>
      <li>{site.resumeUrl ? <a href={site.resumeUrl}>Résumé</a> : <Slot>Résumé PDF</Slot>}</li>
      <li>{site.email ? <a href={`mailto:${site.email}`}>Email</a> : <Slot>Email</Slot>}</li>
      <li>{site.links.linkedin ? <a href={site.links.linkedin}>LinkedIn</a> : <Slot>LinkedIn</Slot>}</li>
      <li>{site.links.github ? <a href={site.links.github}>GitHub</a> : <Slot>GitHub</Slot>}</li>
    </ul>
  );
}

/** The opening of /highlights. The home page opens with the 3D broadcast instead. */
export function CoverageHero() {
  return (
    <header className={styles.hero}>
      <Link href="/" className={styles.back}>
        ← Full coverage
      </Link>
      <p className={styles.kicker}>Highlights · the 60-second version</p>
      <div className={styles.heroMain}>
        <span className={styles.ghost} aria-hidden="true">
          1
        </span>
        <div className={styles.heroText}>
          <h1 className={styles.name}>{site.name}</h1>
          <p className={styles.role}>
            {site.role ?? <Slot>Role</Slot>}
            {site.location && <span className={styles.where}> · {site.location}</span>}
          </p>
        </div>
      </div>
      <PitBoard />
    </header>
  );
}

/**
 * Everything after the opening: the numbers, then the eight sectors.
 * `broadcast` lays it out over the 3D scene (a column on the left with the
 * car framed on the right); `page` is the plain centred layout.
 */
export function CoverageBody({ variant }: { variant: "broadcast" | "page" }) {
  return (
    <div className={`${styles.body} ${variant === "broadcast" ? styles.broadcast : styles.plain}`}>
      {site.stats.length > 0 && (
        <section id="coverage" className={styles.stats} aria-label="By the numbers">
          {site.stats.map((stat) => (
            <div key={stat.label} className={styles.stat}>
              <span className={styles.statValue}>{stat.value}</span>
              {stat.glyph && <StatGlyph glyph={stat.glyph} />}
              <span className={styles.statLabel}>{stat.label}</span>
            </div>
          ))}
        </section>
      )}

      <Sector id="profile">
        <p className={styles.lead}>
          {site.summary ?? <Slot>Two or three sentences: what you do and the role you’re after</Slot>}
        </p>
        {site.calls.length > 0 && (
          <ol className={styles.calls} aria-label="Three calls, and where they were made">
            {site.calls.map((call, i) => {
              const index = site.projects.findIndex((p) => p.title === call.project);
              return (
                <li key={call.text} className={styles.call}>
                  <span className={styles.callLabel}>▲ Call {i + 1}</span>
                  <span className={styles.callText}>{call.text}</span>
                  {index >= 0 && (
                    <a className={styles.callLink} href={`#work-p${index + 1}`}>
                      <b>P{index + 1}</b> {call.project} →
                    </a>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Sector>

      <Sector id="work">
        <ol className={styles.grid}>
          {site.projects.map((project, i) => (
            <li
              key={project.title}
              id={`work-p${i + 1}`}
              className={styles.card}
              style={{ "--stagger": `${(i % 2) * 8}%` } as CSSProperties}
            >
              <div className={styles.cardTop}>
                <span className={styles.pos}>P{i + 1}</span>
                <span className={styles.tag}>{project.tag}</span>
              </div>
              <h3 className={styles.cardTitle}>
                {project.href ? <a href={project.href}>{project.title}</a> : project.title}
              </h3>
              <p className={styles.cardSummary}>
                <Glossed text={project.summary} />
              </p>
              {project.call && (
                <div className={styles.radio}>
                  <span className={styles.radioLabel}>▲ Team radio · the call</span>
                  <p>
                    <Glossed text={project.call} />
                  </p>
                </div>
              )}
              {project.result && (
                <p className={styles.readout}>
                  <Glossed text={project.result} />
                </p>
              )}
              {project.graphic && <PlayOnView graphic={project.graphic} className={styles.cardGraphic} />}
              <ul className={styles.stack}>
                {project.stack.map((tech) => (
                  <li key={tech}>
                    <StackItem label={tech} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Sector>

      <Sector id="experience">
        <StintChart positions={site.experience} />
        <ol className={styles.timeline}>
          {site.experience.map((job) => (
            <li key={`${job.org}-${job.period}`} className={styles.stint}>
              <span className={styles.year}>{job.period}</span>
              <div className={styles.stintBody}>
                <h3 className={styles.stintTitle}>
                  {job.title} <span className={styles.org}>· {job.org}</span>
                </h3>
                {job.summary && (
                  <p>
                    <Glossed text={job.summary} />
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Sector>

      <Sector id="research">
        <PlayOnView graphic={{ kind: "papers" }} className={styles.researchGraphic} />
        <ul className={styles.papers}>
          {site.publications.map((pub) => (
            <li key={pub.title} className={styles.paper}>
              <div>
                <h3 className={styles.paperTitle}>
                  <Glossed text={pub.title} />
                </h3>
                <p className={styles.meta}>
                  {pub.venue} · {pub.year}
                </p>
              </div>
              {pub.href && (
                <a className={styles.read} href={pub.href}>
                  Read →
                </a>
              )}
            </li>
          ))}
        </ul>
      </Sector>

      <Sector id="awards">
        <ul className={styles.awards}>
          {site.awards.map((award) => (
            <li key={award.title} className={styles.award}>
              <span className={styles.year}>{award.year}</span>
              <div>
                <h3 className={styles.stintTitle}>{award.title}</h3>
                <p>
                  <Glossed text={award.detail} />
                </p>
                {award.graphic && <PlayOnView graphic={award.graphic} className={styles.awardGraphic} />}
              </div>
            </li>
          ))}
        </ul>
      </Sector>

      <Sector id="skills">
        <ProofMap skills={site.skills} />
        <ul className={styles.skills}>
          {site.skills.map((skill) => (
            <li key={skill.name} className={styles.skill}>
              <span className={styles.skillName}>{skill.name}</span>
              <span className={styles.skillAbout}>{skill.about}</span>
              <span className={styles.proof}>Proven at: {skill.proof}</span>
            </li>
          ))}
        </ul>
      </Sector>

      <Sector id="about" className={styles.about}>
        <TeamSheet rows={site.teamSheet} />
        <div className={styles.aboutBody}>
          {site.about.map((paragraph, i) => (
            <p key={i} className={i === 1 ? styles.aboutLead : undefined}>
              {paragraph}
            </p>
          ))}
        </div>
      </Sector>

      <Sector id="contact" className={styles.contactSector}>
        <p className={styles.finish}>Box, box — let’s talk.</p>
        <ul className={styles.contact}>
          <li>
            <span className={styles.label}>Email</span>
            {site.email ? <a href={`mailto:${site.email}`}>{site.email}</a> : <Slot>Email</Slot>}
          </li>
          <li>
            <span className={styles.label}>LinkedIn</span>
            {site.links.linkedin ? <a href={site.links.linkedin}>{site.links.linkedin}</a> : <Slot>Profile URL</Slot>}
          </li>
          <li>
            <span className={styles.label}>GitHub</span>
            {site.links.github ? <a href={site.links.github}>{site.links.github}</a> : <Slot>Profile URL</Slot>}
          </li>
        </ul>
        <PitBoard />
      </Sector>

      <GlossaryDefs />
      <GlossaryTips />

      <footer className={styles.footer}>
        {variant === "broadcast" ? (
          <Link href="/highlights">Plain version, no 3D →</Link>
        ) : (
          <Link href="/">← Back to the full coverage</Link>
        )}
        <p>3D model: “Red Bull RB9” by JUST GAME (CC BY 4.0). Not affiliated with Red Bull Racing or Formula 1.</p>
      </footer>
    </div>
  );
}
