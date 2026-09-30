import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Map } from "lucide-react";
import { NatureIcon } from "@/components/atlas/nature-icon";

export const metadata: Metadata = {
  title: "Page not found | isitusa",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return <main id="main-content" className="not-found-page">
    <div className="not-found-landscape" aria-hidden="true">
      <span className="not-found-contour contour-one" /><span className="not-found-contour contour-two" /><span className="not-found-contour contour-three" />
      <span className="not-found-code">404</span>
      <NatureIcon kind="bird" className="not-found-bird" /><NatureIcon kind="butterfly" className="not-found-butterfly" />
      <NatureIcon kind="leaf" className="not-found-leaf" /><NatureIcon kind="mushroom" className="not-found-mushroom" />
    </div>
    <p className="not-found-eyebrow">PAGE NOT FOUND</p>
    <h1>This page is off the map.</h1>
    <p className="not-found-description">The link may have changed, or the address may be incomplete. There is still plenty to explore.</p>
    <div className="not-found-actions"><Link href="/" className="primary-button"><Map size={18} aria-hidden="true" /> Explore your county</Link><Link href="/species" className="text-link">Browse species <ArrowRight size={18} aria-hidden="true" /></Link></div>
  </main>;
}
