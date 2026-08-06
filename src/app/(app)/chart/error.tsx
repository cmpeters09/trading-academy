"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";

// Route-segment boundary (ENGINEERING_PRINCIPLES §7 — "never one global
// boundary"), not the root src/app/error.tsx: a failed candle read is its
// own recoverable-infrastructure case, not an app-wide crash.
export default function ChartError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    logger.error("chart_route_error_boundary", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-4 py-12">
      <h2 className="text-xl font-semibold tracking-tight">
        Couldn&rsquo;t load this chart.
      </h2>
      <p className="text-muted-foreground text-sm">
        Something went wrong loading candle data. Retry, or head back home.
      </p>
      <div className="flex gap-2">
        <Button onClick={unstable_retry}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/">Back to homepage</Link>
        </Button>
      </div>
    </div>
  );
}
