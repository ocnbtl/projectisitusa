import type { SVGProps } from "react";

export type NatureKind = "bird" | "butterfly" | "leaf" | "mushroom";

/** Small field-guide silhouettes, shared by loading and recovery screens. */
export function NatureIcon({ kind, ...props }: SVGProps<SVGSVGElement> & { kind: NatureKind }) {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {kind === "bird" ? <><path d="M4 22c7 0 7-6 11-7-2-3-5-4-7-4 5-3 10-1 13 2 2-1 4-1 5 1l3 1-3 2c0 6-5 9-11 8l-5 3 1-4-7-2Z" /><path d="M14 21c3 0 5-1 6-3" /><circle cx="23.3" cy="14.9" r=".6" fill="currentColor" stroke="none" /></> : null}
    {kind === "butterfly" ? <><path d="M16 13C11 3 3 5 5 13c1 3 4 4 7 4-7 0-8 6-4 8 4 2 7-3 8-7 1 4 4 9 8 7 4-2 3-8-4-8 3 0 6-1 7-4 2-8-6-10-11 0Z" /><path d="M16 12v11M16 12l-3-4m3 4 3-4" /></> : null}
    {kind === "leaf" ? <><path d="M7 24C-1 9 18 10 26 4c2 14-4 23-16 22" /><path d="M5 29 22 12M11 23v-6m5 1 6 1" /></> : null}
    {kind === "mushroom" ? <><path d="M3 17C4 9 9 5 16 5s12 4 13 12H3ZM13 17l-2 9c2 2 8 2 10 0l-2-9" /><path d="M8 13h.01M15 9h.01M22 12h.01" strokeWidth="3" /></> : null}
  </svg>;
}
