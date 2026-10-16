import type { Metadata } from "next";
import { SiteCredits } from "@/components/site-credits";
import s from "./credits.module.css";

export const metadata: Metadata = {
  title: "Credits | ISITUSA",
  description: "Meet the researchers, photographers, artists, and open-source contributors behind the resources ISITUSA uses. Find source links, attribution, and license notices.",
  alternates: { canonical: "https://isitusa.com/credits" },
};

export default function CreditsPage() {
  return <main id="main-content" className={s.page}>
    <header className={s.intro}>
      <h1>Credits</h1>
      <p>Good work grows from the work of others.</p>
      <p>We draw on the resources, research, and creations of people who help us understand the natural world. Here is what we use, who made it, and where to learn more.</p>
    </header>
    <div className={s.layout}>
      <nav className={s.contents} aria-label="Credit categories">
        <a href="#research">Research &amp; records</a>
        <a href="#maps">Maps &amp; boundaries</a>
        <a href="#photography">Photography</a>
        <a href="#design">Typography &amp; design</a>
        <a href="#software">Open-source tools</a>
        <a href="#flags">Flag artwork</a>
      </nav>
      <SiteCredits />
    </div>
  </main>;
}
