import { ShieldAlert, Siren, Wrench } from "lucide-react";

import type { SpeciesAction } from "@/lib/data/types";

const modeLabel = {
  diy: {
    title: "DIY action",
    icon: Wrench,
  },
  report: {
    title: "Report / contact authority",
    icon: Siren,
  },
  both: {
    title: "DIY + report",
    icon: ShieldAlert,
  },
};

export function ActionGuidance({ action }: { action: SpeciesAction }) {
  const ModeIcon = modeLabel[action.mode].icon;

  return (
    <section className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-[var(--muted)]">
            What to do
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--foreground)]">
            {modeLabel[action.mode].title}
          </h2>
        </div>
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent-strong)]">
          <ModeIcon size={18} />
        </div>
      </div>

      <p className="mt-4 text-sm leading-7 text-[var(--foreground)]">
        {action.summary}
      </p>

      <ol className="mt-5 grid gap-3">
        {action.steps.map((step, index) => (
          <li
            key={step}
            className="flex gap-3 rounded-[22px] border border-[var(--border)] px-4 py-4 text-sm leading-6 text-[var(--muted)]"
          >
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--accent)_18%,transparent)] font-medium text-[var(--foreground)]">
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      {action.contactName || action.contactInstructions || action.contactUrl ? (
        <div className="mt-5 rounded-[24px] border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--warning)_10%,transparent)] p-4">
          <div className="text-sm font-medium text-[var(--foreground)]">
            {action.contactName ?? "Program contact"}
          </div>
          {action.contactInstructions ? (
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              {action.contactInstructions}
            </p>
          ) : null}
          {action.contactUrl ? (
            <a
              href={action.contactUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--foreground)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)]"
            >
              Open contact resource
            </a>
          ) : null}
        </div>
      ) : null}

      {action.safetyNotes ? (
        <div className="mt-5 rounded-[24px] border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--danger)_12%,transparent)] p-4 text-sm leading-6 text-[var(--foreground)]">
          <span className="font-medium">Safety note:</span> {action.safetyNotes}
        </div>
      ) : null}
    </section>
  );
}
