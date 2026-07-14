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
