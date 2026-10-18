/**
 * The sectors of the coverage, in page order. Shared by the content itself
 * and by the home page's flow (the top-bar sector label, the sector rail and
 * the channel switch). The "match" channel is the football half of the
 * broadcast: the personal end of the page. Kept free of React and three.js.
 */
export type Channel = "race" | "match";

export const SECTORS = [
  { id: "profile", label: "Profile", title: "Profile", channel: "race" },
  { id: "work", label: "Selected work", title: "Selected work", channel: "race" },
  { id: "experience", label: "Experience", title: "Experience", channel: "race" },
  { id: "research", label: "Research", title: "Research", channel: "race" },
  { id: "awards", label: "Leadership", title: "Leadership & awards", channel: "race" },
  { id: "skills", label: "Skills", title: "Skills", channel: "race" },
  { id: "about", label: "About", title: "About", channel: "match" },
  { id: "contact", label: "Contact", title: "Contact", channel: "match" },
] as const satisfies readonly { id: string; label: string; title: string; channel: Channel }[];

export type SectorId = (typeof SECTORS)[number]["id"];

/** The channel a sector belongs to; the hero (no sector) is the race channel. */
export function channelOf(section: string): Channel {
  return SECTORS.find((s) => s.id === section)?.channel ?? "race";
}
