"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  // Synchronizes with something outside React: reports the caught error to
  // the logging sink. Next.js's own documented pattern for error.tsx.
  useEffect(() => {
    logger.error("route_error_boundary", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-4 py-12">
      <h2 className="text-xl font-semibold tracking-tight">
        Something went wrong.
      </h2>
      <p className="text-muted-foreground text-sm">
        This page hit an unexpected error. Try again, or head back to the
        homepage.
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
