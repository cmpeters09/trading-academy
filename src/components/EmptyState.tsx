import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/utils/cn";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

/**
 * Shared, feature-agnostic (§16 composition over configuration — pass an
 * `action` node rather than growing boolean props for every call site).
 * Nothing queries data yet this milestone; this is the component future
 * empty-list states (no trades, no lessons started, ...) will reach for.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "border-border flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <Icon aria-hidden="true" className="text-muted-foreground size-8" />
      ) : null}
      <h3 className="text-sm font-medium">{title}</h3>
      {description ? (
        <p className="text-muted-foreground max-w-sm text-sm">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
