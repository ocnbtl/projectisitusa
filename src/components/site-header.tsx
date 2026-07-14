import Image from "next/image";
import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-4 px-4 py-5 sm:px-6 lg:px-8">
      <Link href="/" className="group flex min-w-0 items-center gap-3">
        <Image
          src="/isitusa-logo.png"
          alt="Project Isitusa logo"
          width={48}
          height={48}
          priority
          className="h-12 w-12 shrink-0 rounded-full"
        />
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)] sm:tracking-[0.28em]">
            Project Isitusa
          </div>
          <div className="hidden truncate font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--foreground)] sm:block sm:text-xl">
            Invasive Species in the USA
          </div>
        </div>
      </Link>
      <nav aria-label="Primary" className="ml-auto flex items-center gap-2">
        <Link
          href="/research"
          className="rounded-full border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)] sm:px-4"
        >
          Research status
        </Link>
        <Link
          href="/about"
          className="rounded-full border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)] sm:px-4"
        >
          About
        </Link>
        <ThemeToggle />
      </nav>
    </header>
  );
}
