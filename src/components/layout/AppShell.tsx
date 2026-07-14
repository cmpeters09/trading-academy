import { PageFrame } from "@/components/layout/PageFrame";
import { SiteNav } from "@/components/layout/SiteNav";
import { SkipLink } from "@/components/layout/SkipLink";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-foreground flex min-h-full flex-col">
      <SkipLink />
      <SiteNav />
      <PageFrame>{children}</PageFrame>
    </div>
  );
}
