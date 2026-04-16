export function AboutMission() {
  return (
    <section className="glass-panel rounded-[32px] p-8">
      <h1 className="max-w-5xl font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-[var(--foreground)] sm:text-5xl">
        <span className="block">Make invasive species information</span>
        <span className="block">understandable, local, and useful</span>
        <span className="block">
          to protect ecosystems across the{" "}
          <span className="patriotic-glow inline-block">USA</span>
        </span>
      </h1>
      <p className="mt-5 max-w-4xl text-base leading-8 text-[var(--muted)]">
        <span className="block">
          <span className="project-name-glow group relative inline-flex items-baseline gap-0.5 font-semibold text-[var(--foreground)]">
            <span>Invasive Species in the USA</span>
            <span className="project-name-alias whitespace-nowrap text-sm font-medium">
              (Is it USA?)
            </span>
          </span>
          {" "}turns county-level data into a map people can actually use.
        </span>
        <span className="block lg:whitespace-nowrap">
          Instead of forcing people through scattered PDFs, agency pages, or state lists, the project enables
        </span>
        <span className="block lg:whitespace-nowrap">
          invasive species detection & mitigation for the people who live, work, hike, fish, farm, and restore.
        </span>
      </p>
    </section>
  );
}
