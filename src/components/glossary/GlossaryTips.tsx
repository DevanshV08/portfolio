"use client";

import { useEffect } from "react";

/**
 * Keeps glossary tooltips on screen: when one opens, it's shifted sideways
 * away from the screen edge, and flipped below its term if there's no room
 * above. One listener for the whole page; without it, tips still show.
 */
export default function GlossaryTips() {
  useEffect(() => {
    const MARGIN = 12;
    const place = (event: Event) => {
      const term = (event.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-term]");
      const tip = term?.lastElementChild as HTMLElement | null;
      if (!term || !tip) return;
      term.style.removeProperty("--tip-shift");
      term.removeAttribute("data-below");
      const t = term.getBoundingClientRect();
      const width = tip.offsetWidth;
      const centre = t.left + t.width / 2;
      const left = centre - width / 2;
      const right = centre + width / 2;
      let shift = 0;
      if (left < MARGIN) shift = MARGIN - left;
      else if (right > window.innerWidth - MARGIN) shift = window.innerWidth - MARGIN - right;
      if (shift) term.style.setProperty("--tip-shift", `${Math.round(shift)}px`);
      // Under the fixed broadcast bar there's no room above: open below instead.
      if (t.top - tip.offsetHeight - 10 < 70) term.setAttribute("data-below", "");
    };
    document.addEventListener("pointerover", place, { passive: true });
    document.addEventListener("focusin", place);
    return () => {
      document.removeEventListener("pointerover", place);
      document.removeEventListener("focusin", place);
    };
  }, []);
  return null;
}
