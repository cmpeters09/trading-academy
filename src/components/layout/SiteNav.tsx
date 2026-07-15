import Link from "next/link";

import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { LogOutButton } from "@/features/auth";

// SiteNav only renders inside (app)/layout.tsx, which middleware already
// gates to authenticated users — no unauthenticated render path exists, so
// there's nothing to branch on here (checking again would be validating a
// scenario that can't happen).
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
        <div className="flex items-center gap-2">
          <LogOutButton />
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
