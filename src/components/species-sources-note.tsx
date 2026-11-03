"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";

export function SpeciesSourcesNote() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <section className="species-sources-note">
    <button type="button" className="species-sources-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <span>Where does this information come from?</span><ChevronDown size={16} aria-hidden="true"/>
    </button>
    <div id={id} className="species-sources-body" data-open={open} aria-hidden={!open} inert={!open}>
      <div><div className="species-sources-copy">
        <p>We bring together published research, public records, and observations from agencies, universities, scientific collections, and established observation programs. Each profile links to the sources behind its description, identification tips, and guidance.</p>
        <p>We compare names so records about the same species stay together, then check the place and date behind each finding. A profile helps you learn about the species; its county records show where it has been reported. Missing records do not mean it is absent.</p>
        <nav aria-label="Learn about our research">
          <Link href="/approach">Our approach <ArrowRight size={15} aria-hidden="true"/></Link>
          <Link href="/data-sources">Data sources <ArrowRight size={15} aria-hidden="true"/></Link>
          <Link href="/research">Research progress <ArrowRight size={15} aria-hidden="true"/></Link>
        </nav>
      </div></div>
    </div>
  </section>;
}
