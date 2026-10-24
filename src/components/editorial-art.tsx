import type { CSSProperties, ReactNode } from "react";
import "./editorial-art.css";

const editions = {
  field: "r6", specimen: "r6", participate: "r6", research: "r6", support: "r6",
  atlas: "r7", archive: "r7", volunteer: "r7", sighting: "r7", catalog: "r7",
  correspondence: "r7", stewardship: "r7", acknowledgments: "r7",
  custody: "r8", preferences: "r8", refund: "r8", terms: "r8",
  waypoint: "r8", footsteps: "r8", layers: "r8", time: "r8",
  collections: "r8", survey: "r8", notebook: "r8", revision: "r8",
  bibliography: "r8", skills: "r8", message: "r8",
  prism: "r9", weave: "r9",
} as const;
export type EditorialSubject = keyof typeof editions;

/** Decorative ink only: never a species photograph, evidence, or form control. */
export function EditorialArt({ subject, className = "" }: { subject: EditorialSubject; className?: string }) {
  return <div aria-hidden="true" data-artwork={subject} data-art-edition={editions[subject]} className={`editorial-art editorial-art-${subject} ${className}`} style={{ "--art-source": `url('/artwork/editorial-${subject}-${editions[subject]}.png')` } as CSSProperties} />;
}

export function IllustratedIntro({ subject, compact = false, children }: { subject: EditorialSubject; compact?: boolean; children: ReactNode }) {
  return <div className={`illustrated-intro${compact ? " illustrated-intro-compact" : ""}`}>
    <div className="illustrated-intro-copy">{children}</div>
    <EditorialArt subject={subject} />
  </div>;
}
