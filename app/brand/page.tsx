import type { Metadata } from "next";
import Image from "next/image";
import { ArrowDownToLine } from "lucide-react";

export const metadata: Metadata = {
  title: "Brand kit | isitusa",
  description: "Download the transparent isitusa logo as a single-color vector or PNG for articles, community materials, and project updates.",
  alternates: { canonical: "/brand" },
};
const assets = [
  { file: "isitusa-symbol", title: "The symbol", description: "For avatars, icons, and compact spaces.", width: 840, height: 840 },
  { file: "isitusa-symbol-name", title: "Symbol and name", description: "For project materials where the name needs to be clear.", width: 840, height: 1120 },
  { file: "isitusa-symbol-name-website", title: "The full signature", description: "For articles, handouts, and materials that point people to the website.", width: 840, height: 1220 },
];
export default function BrandPage() {
  return <main id="main-content" className="brand-kit">
    <h1>Made to be shared.</h1>
    <p className="brand-kit-intro">Our logo, with room for your background. Download a crisp, single-color vector or a transparent PNG for your next article or community project.</p>
    <div className="brand-kit-grid">{assets.map(asset => <section key={asset.file} className="brand-kit-card">
      <div className="brand-kit-art"><Image className="brand-art" src={`/brand/v3/${asset.file}.svg`} width={asset.width} height={asset.height} alt={asset.title} unoptimized /></div>
      <h2>{asset.title}</h2><p>{asset.description}</p>
      <div className="brand-kit-downloads"><a className="text-link" href={`/brand/v3/${asset.file}.svg`} download><ArrowDownToLine size={16} aria-hidden="true" /> Download SVG</a><a className="text-link" href={`/brand/v3/${asset.file}.png`} download>PNG</a></div>
    </section>)}</div>
    <section className="brand-kit-card" aria-labelledby="full-wordmark-heading">
      <div className="brand-kit-art"><Image className="brand-art" src="/brand/full-name-v1/isitusa-full-name-green.svg" width={2133} height={356} alt="Invasive Species in the United States of America" unoptimized /></div>
      <h2 id="full-wordmark-heading">Our full name, in our own lettering.</h2>
      <p>Custom vector lettering built from the logo's original letter shapes. Two-line and single-line artwork, in green, white, and black. No font installation needed.</p>
      <div className="brand-kit-downloads"><a className="text-link" href="/brand/full-name-v1/isitusa-full-name-green.svg" download><ArrowDownToLine size={16} aria-hidden="true" /> Download SVG</a><a className="text-link" href="/brand/full-name-v1/isitusa-full-name-green.png" download>PNG</a><a className="text-link" href="/brand/full-name-v1/isitusa-full-name-kit.zip" download>All versions</a></div>
    </section>
    <h2>Keep it recognizable.</h2>
    <p className="brand-kit-note">Write our name as <strong>isitusa</strong> and our website as <strong>isitusa.com</strong>, both lowercase. Keep the artwork in its original proportions, with room around it. The files use one color, <code>#00583B</code>, with a transparent background. On dark pages, we display the same shapes in white for contrast.</p>
    <p className="brand-kit-note">Please use the logo to identify the project accurately. Its use should not suggest an endorsement, partnership, or nonprofit status.</p>
    <div className="brand-kit-actions"><a className="primary-button" href="/brand/v3/isitusa-brand-kit.zip" download><ArrowDownToLine size={16} aria-hidden="true" /> Download the kit</a><a className="text-link" href="/brand/v3/email-signature.html" download>Download email signature</a></div>
  </main>;
}
