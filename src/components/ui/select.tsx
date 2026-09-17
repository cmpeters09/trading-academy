import * as React from "react"

import { cn } from "@/utils/cn"

// bg-surface/text-foreground here, not bg-transparent like <Input>: a
// <select>'s dropdown popup is a native, separate rendering surface, not
// layered over the page like an input's box is. Chromium paints that
// popup using the *select's own* resolved background-color/color, so a
// transparent background falls back to the browser's default (white) —
// combined with our inherited near-white dark-mode text color, that made
// every option white-on-white except the one row the OS highlights blue
// (§11 AA contrast bug). The [&>option] overrides reinforce the same
// tokens directly on each <option>, which Chromium and Firefox both honor
// for the popup list; Safari's native popup does not respect per-option
// styling at all (a known cross-browser limit, not fixable from CSS) and
// falls back to the OS's own light/dark appearance instead, which is
// legible either way since it's not our (broken) white default.
//
// Promoted to /components/ui on its third use (ENGINEERING_PRINCIPLES §16
// rule of three) — /chart's page (1st use) and ReplayControls (2nd, which
// noted "not promoted yet") both had their own copy of this className.
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-8 rounded-lg border border-input bg-surface px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-surface [&>option]:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Select }
