import { PageFrame } from "@/components/layout/page-frame";
import { SiteNav } from "@/components/layout/site-nav";
import { SkipLink } from "@/components/layout/skip-link";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-foreground flex min-h-full flex-col">
      <SkipLink />
      <SiteNav />
      <PageFrame>{children}</PageFrame>
    </div>
  );
}
