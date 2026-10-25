import type { Metadata } from "next";
import { LogoAssetCard } from "./logo-asset-card";
import { ArrowDown, ArrowDownToLine, ArrowRight } from "lucide-react";
import "./brand-kit.css";

export const metadata: Metadata = { title: "Brand kit | ISITUSA", description: "Official ISITUSA logos, Invasive Serif, and simple guidance for sharing our work.", alternates: { canonical: "/brand" } };
const assets = [
  { id: "symbol", greenFile: "/brand/v3/isitusa-symbol.svg", greenPng: "/brand/v10/symbol-green.png", title: "Symbol", description: "Use the symbol for an avatar, icon, or a small space where our name already appears nearby.", width: 840, height: 840 },
  { id: "symbol-name", greenFile: "/brand/v10/symbol-name.svg?v=1.005", greenPng: "/brand/v10/symbol-name.png", title: "Symbol and name", description: "Choose this version when introducing ISITUSA in an article, presentation, or community resource.", width: 840, height: 1080 },
  { id: "wordmark", greenFile: "/brand/v10/wordmark-green.svg?v=1.005", greenPng: "/brand/v10/wordmark-green.png", title: "Wordmark", description: "Our name on its own, for a horizontal space or a layout that already includes the symbol.", width: 3696, height: 760 },
];

export default function BrandPage() {
  return <main id="main-content" className="brand-kit brand-kit-page">
    <header className="brand-kit-header">
      <h1>Brand kit.</h1>
      <p>Sharing our work? Here are the official logos, lettering, and a few simple guidelines to help you present ISITUSA clearly.</p>
      <nav className="brand-kit-nav" aria-label="Brand kit sections">
        <a href="#logos">Logos <ArrowDown size={17} aria-hidden="true" /></a>
        <a href="#typography">Typography <ArrowDown size={17} aria-hidden="true" /></a>
        <a href="#colors">Colors <ArrowDown size={17} aria-hidden="true" /></a>
        <a href="#using-our-brand">Guidelines <ArrowDown size={17} aria-hidden="true" /></a>
      </nav>
    </header>

    <section id="logos" className="brand-kit-section" aria-labelledby="logos-heading">
      <div className="brand-kit-section-intro"><h2 id="logos-heading">Choose a logo.</h2><p>SVG files stay sharp at any size. Choose PNG when your editor needs an image file. Choose green, dark, or white artwork for each logo. Every download has a transparent background.</p></div>
      <div className="brand-kit-grid">{assets.map(asset => <LogoAssetCard key={asset.id} {...asset} />)}</div>
      <LogoAssetCard id="full-name" greenFile="/brand/v10/full-name.svg?v=1.004" greenPng="/brand/v10/full-name.png" title="The full name" description="Use our full name when readers are meeting the project for the first time. This file keeps the lettering and spacing intact." width={11150} height={1874} fullWidth />
    </section>

    <section id="typography" className="brand-kit-section brand-kit-type" aria-labelledby="type-heading">
      <div><h2 id="type-heading">Invasive Serif.</h2><p>Our custom lettering brings botanical curves to the logo and headings. Keep longer passages in a clear sans-serif so they are comfortable to read.</p><p>The font includes uppercase and lowercase letters, numbers, accents, and punctuation. Use its built-in spacing and upright bold weight.</p><div className="brand-kit-downloads"><a href="/fonts/invasive-serif/InvasiveSerif-Bold.ttf?v=1.005" download><ArrowDownToLine size={17} aria-hidden="true" /> Download font</a><a href="/fonts/invasive-serif/README.txt">Read usage notes <ArrowRight size={17} aria-hidden="true" /></a></div></div>
      <div className="brand-kit-specimen" aria-label="Invasive Serif type sample"><p>For the places<br />we love.</p><span>Aa Bb Cc &amp; 0123456789</span></div>
    </section>

    <section id="colors" className="brand-kit-section" aria-labelledby="colors-heading">
      <h2 id="colors-heading">Our colors.</h2>
      <p>Use these exact colors when reproducing the logo. Choose the version that stands out clearly against your background.</p>
      <dl className="brand-kit-colors"><div><dt><span className="brand-swatch-green" aria-hidden="true" /> Brand green</dt><dd>#00583B</dd></div><div><dt><span className="brand-swatch-white" aria-hidden="true" /> White</dt><dd>#FFFFFF</dd></div><div><dt><span className="brand-swatch-black" aria-hidden="true" /> Black</dt><dd>#111111</dd></div></dl>
    </section>

    <section id="using-our-brand" className="brand-kit-section" aria-labelledby="usage-heading">
      <div className="brand-kit-section-intro"><h2 id="usage-heading">Keep it recognizable.</h2><p>A little care with the name, spacing, and color helps people recognize the project wherever they find it.</p></div>
      <div className="brand-kit-guidance">
        <div><h3>Use our name clearly.</h3><p>Write our name as <strong>ISITUSA</strong> and link to <a href="https://isitusa.com">isitusa.com</a>. Our full name is Invasive Species In The United States of America.</p></div>
        <div><h3>Give the artwork room.</h3><p>Keep its original proportions and leave clear space around it. Avoid stretching, cropping, or adding effects that change the lettering or symbol.</p></div>
        <div><h3>Choose a clear contrast.</h3><p>Use green on a light background and white on a dark one. Keep the artwork easy to distinguish from nearby text and images.</p></div>
      </div>

      <div className="brand-kit-permission"><p>Please use these assets to identify ISITUSA accurately, without suggesting a partnership, endorsement, government affiliation, or nonprofit status.</p><p>Need help choosing an asset, or have a question about using the font? Reach us at <a href="mailto:contact@isitusa.com">contact@isitusa.com</a></p></div>
    </section>
  </main>;
}
