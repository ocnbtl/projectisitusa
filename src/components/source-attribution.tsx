import type { SourceLink } from "@/lib/data/types";

export function SourceAttribution({ sources }: { sources: SourceLink[] }) {
  return (
    <section className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6">
      <p className="text-xs uppercase tracking-[0.28em] text-[var(--muted)]">
        Sources
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        {sources.map((source) => (
          <a
            key={source.url}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--foreground)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)]"
          >
            {source.label}
          </a>
        ))}
      </div>
    </section>
  );
}
