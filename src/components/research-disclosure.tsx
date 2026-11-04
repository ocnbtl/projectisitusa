"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Keep content mounted through both directions, and remove closed links from focus. */
export function ResearchDisclosure({ open, children }: { open: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (ref.current) ref.current.inert = !open; }, [open]);
  return <div ref={ref} className="research-disclosure" data-open={open} aria-hidden={!open}><div>{children}</div></div>;
}
