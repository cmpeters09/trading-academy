import Link from "next/link";

import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function SiteNav() {
  return (
    <header className="border-border bg-surface border-b">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8"
      >
        <Link
          href="/"
          className="text-foreground text-sm font-semibold tracking-tight"
        >
          Trading Academy
        </Link>
        <ThemeToggle />
      </nav>
    </header>
  );
}
