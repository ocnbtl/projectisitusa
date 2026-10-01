import type { SVGProps } from "react";

export type NatureKind = "bird" | "butterfly" | "leaf" | "mushroom";

/** Small field-guide icons, shared by filters, loading and recovery screens. */
export function NatureIcon({ kind, ...props }: SVGProps<SVGSVGElement> & { kind: NatureKind }) {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {kind === "bird" ? <><path d="M4 22c7 0 7-6 11-7-2-3-5-4-7-4 5-3 10-1 13 2 2-1 4-1 5 1l3 1-3 2c0 6-5 9-11 8l-5 3 1-4-7-2Z" /><path d="M14 21c3 0 5-1 6-3" /><circle cx="23.3" cy="14.9" r=".6" fill="currentColor" stroke="none" /></> : null}
    {kind === "butterfly" ? <><path d="M16 13C11 3 3 5 5 13c1 3 4 4 7 4-7 0-8 6-4 8 4 2 7-3 8-7 1 4 4 9 8 7 4-2 3-8-4-8 3 0 6-1 7-4 2-8-6-10-11 0Z" /><path d="M16 12v11M16 12l-3-4m3 4 3-4" /></> : null}
    {kind === "leaf" ? <><path d="M7 24C-1 9 18 10 26 4c2 14-4 23-16 22" /><path d="M5 29 22 12M11 23v-6m5 1 6 1" /></> : null}
    {kind === "mushroom" ? <><path d="M3 17C4 9 9 5 16 5s12 4 13 12H3ZM13 17l-2 9c2 2 8 2 10 0l-2-9" /><path d="M8 13h.01M15 9h.01M22 12h.01" strokeWidth="3" /></> : null}
  </svg>;
}

export const CATEGORY_NATURE = { wildlife: "bird", plants: "leaf", insects: "butterfly", "fungi-diseases": "mushroom" } as const;
export function EnvironmentIcon({ kind, ...props }: SVGProps<SVGSVGElement> & { kind: string }) {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {kind === "land" && <><path d="m3 23 8-13 5 8 4-6 9 11M3 27h26M8 15l3 2 3-2" /><circle cx="24" cy="7" r="3" /></>}
    {kind === "freshwater" && <><path d="M17 3c0 7-11 7-10 13 1 5 16 3 14 8-1 3-6 4-6 5M22 3c0 8-10 8-9 12 1 2 15 2 14 8-1 4-4 6-4 6" /><path d="M3 10h3M2 24h5" /></>}
    {kind === "marine-coastal" && <><path d="M3 18c4-11 16-11 16-3-3-3-6-2-6 1 0 4 8 6 16 2M3 25c5-3 8 3 13 0s8 3 13 0" /><circle cx="25" cy="7" r="3" /></>}
    {kind === "wetlands" && <><path d="M10 24V7m7 17V5m6 19V13M10 18l-5-4m12 2 5-5M3 27c5-3 8 3 13 0s8 3 13 0" /><path d="M8 6v6m11-8v5m6 1v5" strokeWidth="3" /></>}
    {kind === "forest" && <><path d="m11 4-7 9h4l-6 9h18l-6-9h4l-7-9Zm0 18v6M23 10l-4 6h3l-3 7h10l-4-7h3l-5-6Zm1 13v5" /></>}
    {kind === "agriculture" && <><path d="M3 27c4-8 15-10 26-10M12 29c2-5 9-8 17-8M23 29c1-2 3-3 6-3M9 19V4m0 7L4 7m5 9-5-4m5-1 5-4m-5 9 5-4" /></>}
    {kind === "urban" && <><path d="M4 27V12h10v15M14 27V5h12v22M2 27h28M8 16h2m-2 5h2m8-12h4m-4 5h4m-4 5h4m-2 8v-4" /></>}
  </svg>;
}
