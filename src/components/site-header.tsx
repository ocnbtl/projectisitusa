import Image from "next/image";
import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <Link href="/" className="group flex items-center gap-3">
          <Image
            src="/isitusa-logo.png"
            alt="Project Isitusa logo"
            width={48}
            height={48}
            priority
            className="h-12 w-12 shrink-0 rounded-full"
          />
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-[var(--muted)]">
              Project Isitusa
            </div>
            <div className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--foreground)] sm:text-xl">
              Invasive Species in the USA
            </div>
          </div>
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/about"
          className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--foreground)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)]"
        >
          About
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
