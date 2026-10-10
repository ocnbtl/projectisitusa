"use client";

import Image from "next/image";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type ResearchSource = { name: string; description: string; image: string; width: number; height: number; href: string; style: string };

export function AboutSourceCarousel({ sources }: { sources: ResearchSource[] }) {
  const host = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let visible = false;
    const sync = () => setActive(visible && document.visibilityState === "visible");
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(element);
    document.addEventListener("visibilitychange", sync);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", sync); };
  }, []);
  const rows = [sources.filter((_, i) => i % 2 === 0), sources.filter((_, i) => i % 2 !== 0)];
  return <div ref={host} className="source-carousel" data-running={active && !paused}>
    <div className="source-carousel-window">
      {rows.map((row, i) => <div className="source-carousel-row" key={i}>
        {[0, 1].map(copy => <ul className="source-carousel-set" key={copy} aria-hidden={copy === 1 ? true : undefined}>
          {row.map(source => <li key={source.name}>
            <a href={source.href} target="_blank" rel="noreferrer" tabIndex={copy ? -1 : undefined} title={source.description}>
              <span className={`about-source-mark ${source.style} ${source.width / source.height > 2 ? "source-logo-wide" : ""}`}>
                <Image src={`/source-logos/${source.image}`} alt="" width={source.width} height={source.height} loading="eager" unoptimized />
              </span>
              <span>{source.name}</span>
              <span className="sr-only">{source.description}. Opens in a new tab.</span>
            </a>
          </li>)}
        </ul>)}
      </div>)}
    </div>
    <button type="button" className="source-motion-toggle" onClick={() => setPaused(value => !value)} aria-pressed={paused}>
      {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
      {paused ? "Resume logos" : "Pause logos"}
    </button>
  </div>;
}
