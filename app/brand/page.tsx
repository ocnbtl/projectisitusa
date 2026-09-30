import type { Metadata } from "next";
import Image from "next/image";
import { ArrowDownToLine } from "lucide-react";

export const metadata: Metadata = {
  title: "Brand kit | isitusa",
  description: "Download the approved isitusa logo for articles, community materials, and project updates.",
  alternates: { canonical: "/brand" },
};
const assets = [
  { file: "isitusa-symbol.png", title: "The symbol", description: "For avatars, icons, and compact spaces.", width: 2240, height: 2240 },
  { file: "isitusa-symbol-name.png", title: "Symbol and name", description: "For project materials where the name needs to be clear.", width: 2240, height: 2724 },
  { file: "isitusa-symbol-name-website.png", title: "The full signature", description: "For articles, handouts, and materials that point people to the website.", width: 2240, height: 2944 },
];
export default function BrandPage() {
  return <main id="main-content" className="brand-kit">
    <h1>Made to be shared.</h1>
    <p className="brand-kit-intro">Writing about isitusa or making something for your community? These are our approved logos, ready to download.</p>
    <div className="brand-kit-grid">{assets.map(asset => <section key={asset.file} className="brand-kit-card">
      <div className="brand-kit-art"><Image src={`/brand/v2/${asset.file}`} width={asset.width} height={asset.height} alt={asset.title} unoptimized /></div>
      <h2>{asset.title}</h2><p>{asset.description}</p>
      <a className="text-link" href={`/brand/v2/${asset.file}`} download><ArrowDownToLine size={16} aria-hidden="true" /> Download PNG</a>
    </section>)}</div>
    <h2>Keep it recognizable.</h2>
    <p className="brand-kit-note">Write our name as <strong>isitusa</strong> and our website as <strong>isitusa.com</strong>, both lowercase. Keep the artwork in its original proportions, with room around it. Our green is <code>#00583B</code>; the supplied files have a white background that also keeps them clear on dark pages.</p>
    <p className="brand-kit-note">Please use the logo to identify the project accurately. Its use should not suggest an endorsement, partnership, or nonprofit status.</p>
    <div className="brand-kit-actions"><a className="primary-button" href="/brand/v2/isitusa-brand-kit.zip" download><ArrowDownToLine size={16} aria-hidden="true" /> Download the kit</a><a className="text-link" href="/brand/v2/email-signature.html" download>Download email signature</a></div>
  </main>;
}
