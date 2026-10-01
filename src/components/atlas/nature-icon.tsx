import { Bird, Bug, Leaf } from "lucide-react";
import type { SVGProps } from "react";

export type NatureKind = "bird" | "butterfly" | "leaf" | "mushroom";

/** Shared category symbols use the navigation icon family's 24px, 2px geometry. */
export function NatureIcon({ kind, ...props }: SVGProps<SVGSVGElement> & { kind: NatureKind }) {
  const Icon = kind === "bird" ? Bird : kind === "butterfly" ? Bug : kind === "leaf" ? Leaf : null;
  if (Icon) return <Icon aria-hidden="true" {...props} />;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M3 13a9 9 0 0 1 18 0H3Z" /><path d="M9 13 8 20a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l-1-7M8 9h.01M12 7h.01M16 9h.01" />
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
