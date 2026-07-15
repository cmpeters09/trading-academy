/**
 * ENGINEERING_PRINCIPLES.md §8 — structured logs only, one sink to swap
 * later. v1 sink is Vercel/Supabase's own console capture; callers MUST NOT
 * pass secrets, tokens, or raw user content — log IDs, not content.
 */
type LogContext = Record<string, unknown>;

function log(
  level: "error" | "warn" | "info" | "debug",
  event: string,
  context?: LogContext,
) {
  if (level === "debug" && process.env.NODE_ENV === "production") {
    return;
  }

  // The one sanctioned console use (§8) — every other module MUST go
  // through this logger instead.
  // eslint-disable-next-line no-console
  console[level]({ level, event, ...context });
}

export const logger = {
  error: (event: string, context?: LogContext) => log("error", event, context),
  warn: (event: string, context?: LogContext) => log("warn", event, context),
  info: (event: string, context?: LogContext) => log("info", event, context),
  debug: (event: string, context?: LogContext) => log("debug", event, context),
};

type ErrorDetails = {
  message: string;
  name?: string;
  code?: string;
  cause?: ErrorDetails | string;
  errors?: ErrorDetails[];
};

function describeError(err: unknown): ErrorDetails | string {
  if (!(err instanceof Error)) {
    return String(err);
  }

  const details: ErrorDetails = { message: err.message, name: err.name };

  // Node's fetch (undici) wraps the real network/TLS error in .code on the
  // cause, not the top-level error — logging err.message alone for a
  // failed fetch just says "fetch failed" and hides the actual reason
  // (e.g. UNABLE_TO_VERIFY_LEAF_SIGNATURE).
  const code = (err as NodeJS.ErrnoException).code;
  if (code) details.code = code;

  if (err.cause !== undefined) {
    details.cause = describeError(err.cause);
  }

  if (err instanceof AggregateError) {
    details.errors = err.errors.map(describeError) as ErrorDetails[];
  }

  return details;
}

/**
 * Use in a catch block instead of `err instanceof Error ? err.message : ...`
 * — that pattern silently discards the .cause chain, which is where the
 * actually useful information lives for network/TLS failures.
 */
export function serializeError(err: unknown): LogContext {
  const described = describeError(err);
  return typeof described === "string" ? { message: described } : described;
}
