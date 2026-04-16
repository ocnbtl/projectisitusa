const stats = [
  {
    title: "National parks",
    value: "52 parks",
    detail:
      "The National Park Service reports invasive plant species in 52 park units and more than 1.4 million infested acres.",
    source: "https://home.nps.gov/subjects/exoticandinvasive/about.htm",
  },
  {
    title: "Habitat competition",
    value: "Early detection matters",
    detail:
      "NPS emphasizes that invasive species often outcompete native species and destroy habitat, which is why early detection and rapid response matters.",
    source: "https://home.nps.gov/subjects/exoticandinvasive/about.htm",
  },
  {
    title: "Agriculture and forests",
    value: "High-risk systems",
    detail:
      "USDA identifies invasive pests and weeds as a direct threat to crops, forests, grazing systems, and plant trade pathways.",
    source: "https://www.usda.gov/farming-and-ranching/plants-and-crops/pest-and-weed-management/invasive-species",
  },
  {
    title: "Waterways and fisheries",
    value: "Rapid spread",
    detail:
      "USFWS highlights how invasive aquatic plants and animals can disrupt food webs, water access, and habitat quality when they spread between waters.",
    source: "https://www.fws.gov/program/invasive-species",
  },
];

export function ImpactStats() {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      {stats.map((stat) => (
        <article
          key={stat.title}
          className="glass-panel rounded-[28px] p-6"
        >
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
            {stat.title}
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--foreground)]">
            {stat.value}
          </h2>
          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
            {stat.detail}
          </p>
          <a
            href={stat.source}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex text-sm text-[var(--accent-strong)] hover:text-[var(--foreground)]"
          >
            View source
          </a>
        </article>
      ))}
    </section>
  );
}
