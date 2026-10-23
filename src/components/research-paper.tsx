import { EditorialArt, IllustratedIntro, type EditorialSubject } from "@/components/editorial-art";
import type { ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import s from "./research-paper.module.css";

export type PaperSection = { id: string; title: string; content: ReactNode; artwork?: EditorialSubject };
export const methodologyRevision = "f68ff185397fa6fd850a7cd9fc7ded851767e877";
export function MethodReference({ path, children }: { path: string; children: ReactNode }) {
  return <a href={`https://github.com/ocnbtl/projectisitusa/blob/${methodologyRevision}/${path}`}>{children}</a>;
}

export function ResearchPaper({ title, description, sections, related, artwork }: {
  artwork: EditorialSubject; title: string; description: string; sections: PaperSection[]; related: { href: Route; label: string };
}) {
  return <main id="main-content" className={s.page}>
    <IllustratedIntro subject={artwork}><header className={s.intro}>
      <h1>{title}</h1>
      <p className={s.dek}>{description}</p>
      <p className={s.meta}>An ISITUSA white paper · Version 1.0 · <time dateTime="2026-10-18">October 18, 2026</time></p>
    </header></IllustratedIntro>
    <div className={s.layout}>
      <nav className={s.contents} aria-label="Paper contents">
        <p>In this paper</p>
        {sections.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}
        <Link className={s.companion} href={related.href}>{related.label}</Link>
      </nav>
      <article className={s.article} aria-label={title}>
        {sections.map(section => <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`}>
          {section.artwork ? <div className={s.sectionOpening}><EditorialArt subject={section.artwork}/><h2 id={`${section.id}-heading`}>{section.title}</h2></div> : <h2 id={`${section.id}-heading`}>{section.title}</h2>}{section.content}
        </section>)}
        <aside className={s.revision} aria-label="Document history">
          <h2>About this edition</h2>
          <p>Version 1.0 documents the implementation reviewed on October 18, 2026. Code references point to a fixed repository revision so you can inspect the basis of this explanation. Source availability, research coverage, and published findings can change independently of this paper.</p>
          <p>For current findings, open <Link href="/research">Research</Link>. For a correction to this document, <a href="mailto:contact@isitusa.com">contact ISITUSA</a> with the section and supporting reference. This is a project methodology document, not an independently peer-reviewed scientific publication.</p>
          <Link href={related.href}>{related.label}</Link>
        </aside>
      </article>
    </div>
  </main>;
}
