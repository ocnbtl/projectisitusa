import type { Metadata } from "next";
import Image from "next/image";
import { ArrowDownToLine } from "lucide-react";
export const metadata: Metadata = { title: "Brand kit | ISITUSA", description: "Official ISITUSA artwork for articles, community materials, and project updates.", alternates: { canonical: "/brand" } };
const assets = [
  { file: "/brand/v3/isitusa-symbol.svg", title: "The symbol", description: "For avatars, icons, and compact spaces.", width: 840, height: 840 },
  { file: "/brand/v10/symbol-name.svg", title: "Symbol and name", description: "Our emblem paired with the uppercase ISITUSA name.", width: 840, height: 1080 },
  { file: "/brand/v10/wordmark-green.svg", title: "The wordmark", description: "Custom outlined lettering for headers and horizontal spaces.", width: 3750, height: 760 },
];
export default function BrandPage() {
  return <main id="main-content" className="brand-kit">
    <h1>Made to be shared.</h1>
    <p className="brand-kit-intro">Our identity, with room for your background. Download crisp, single-color vector artwork for your next article or community project.</p>
    <div className="brand-kit-grid">{assets.map(asset => <section key={asset.file} className="brand-kit-card">
      <div className="brand-kit-art"><Image className="brand-art" src={asset.file} width={asset.width} height={asset.height} alt={asset.title} unoptimized /></div>
      <h2>{asset.title}</h2><p>{asset.description}</p>
      <a className="text-link" href={asset.file} download><ArrowDownToLine size={16} aria-hidden="true" /> Download SVG</a>
    </section>)}</div>
    <section className="brand-kit-card" aria-labelledby="full-wordmark-heading">
      <div className="brand-kit-art" style={{height:"auto",maxWidth:"none"}}><Image className="brand-art" src="/brand/v10/full-name.svg" width={11180} height={1874} style={{height:"auto"}} alt="Invasive Species In The United States of America" unoptimized /></div>
      <h2 id="full-wordmark-heading">Our full name, in our own lettering.</h2><p>The same botanical lettering as our wordmark and public headings, supplied as scalable outlines.</p>
      <a className="text-link" href="/brand/v10/full-name.svg" download>Download SVG</a>
    </section>
    <section className="brand-kit-card"><h2>One family. A living identity.</h2><p>Invasive Serif pairs broad, flowing curves with crisp, flared ends. Its sculptural capitals share the same outlines in our logo and headings. The complete Latin display system includes capitals, lowercase, numbers, accents and punctuation, with individually refined spacing. Body copy stays in a clear sans-serif.</p><div className="brand-kit-actions"><a className="text-link" href="/fonts/invasive-serif/InvasiveSerif-Bold.ttf" download>Download Invasive Serif</a><a className="text-link" href="/fonts/invasive-serif/README.txt">Font usage notes</a></div></section>
    <h2>Keep it recognizable.</h2>
    <p className="brand-kit-note">Write our name as <strong>ISITUSA</strong> and our website as <strong>isitusa.com</strong>. Keep the artwork in its original proportions, with clear space around it. Use green on light backgrounds and white on dark backgrounds.</p>
    <p className="brand-kit-note">Use the logo to identify the project accurately. Its use should not suggest an endorsement, partnership, government affiliation, or nonprofit status.</p>
    <div className="brand-kit-actions"><a className="text-link" href="/brand/v10/wordmark-white.svg" download>White wordmark</a><a className="text-link" href="/brand/v10/wordmark-black.svg" download>Black wordmark</a></div>
  </main>;
}
