"use client";

import { useEffect, useRef, useState } from "react";
import type { Graphic as GraphicSpec } from "@/content/site";
import Graphic, { type Play } from "./Graphic";

/**
 * A graphic that builds in the first time it scrolls into view. Without
 * JavaScript, with reduced motion, or if it's already been scrolled past, it's
 * simply drawn complete.
 */
export default function PlayOnView({ graphic, className }: { graphic: GraphicSpec; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [play, setPlay] = useState<Play>(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let armed = false;
    // The first callback reports where the graphic starts: arm it only if it's still below the screen.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
            if (armed) setPlay(true);
            io.disconnect();
          } else if (!armed && entry.boundingClientRect.top > 0) {
            armed = true;
            setPlay("armed");
          } else if (!armed) {
            io.disconnect();
          }
        }
      },
      { threshold: [0, 0.35] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      <Graphic graphic={graphic} play={play} />
    </div>
  );
}
