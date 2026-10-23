import type { CSSProperties } from "react";
import "./editorial-art.css";

type EditorialSubject = "field" | "specimen" | "participate" | "research" | "support";

/** Decorative plates use transparent ink masks, so the page itself is their paper. */
export function EditorialArt({ subject, className = "" }: { subject: EditorialSubject; className?: string }) {
  return <div aria-hidden="true" className={`editorial-art editorial-art-${subject} ${className}`} style={{ "--art-source": `url('/artwork/editorial-${subject}-r6.png')` } as CSSProperties} />;
}
