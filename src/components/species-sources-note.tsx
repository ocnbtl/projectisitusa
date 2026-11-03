"use client";
import Link from "next/link";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";

export function SpeciesSourcesNote() {
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => { if (disclosure.current) disclosure.current.inert = !open; }, [open]);
  const id = useId();
  const disclosure = useRef<HTMLDivElement>(null);
  return <section className="species-sources-note">
    <button type="button" className="species-sources-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <span>Where does this information come from?</span><ChevronDown size={16} aria-hidden="true"/>
    </button>
    <div id={id} className="species-sources-body" data-open={open} aria-hidden={!open} ref={disclosure}>
      <div><div className="species-sources-copy">
        <p>We bring together published research, public records, and observations from agencies, universities, scientific collections, and established observation programs. Each profile links to the sources behind its description, identification tips, and guidance.</p>
        <p>We compare names so records about the same species stay together, then check the place and date behind each finding. A profile helps you learn about the species; its county records show where it has been reported. A missing record doesn’t mean a species is absent. We may not have reviewed that place yet, or an observation may never have been reported. Even a careful survey can miss a species, so showing that it is truly absent takes more evidence than an empty map.</p>
        <nav aria-label="Learn about our research">
          <Link href="/approach">Our approach <ArrowRight size={15} aria-hidden="true"/></Link>
          <Link href="/data-sources">Data sources <ArrowRight size={15} aria-hidden="true"/></Link>
          <Link href="/research">Research progress <ArrowRight size={15} aria-hidden="true"/></Link>
        </nav>
      </div></div>
    </div>
  </section>;
}
