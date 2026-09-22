// ENGINEERING_PRINCIPLES.md §8 — structured logs only (`{ level, event,
// ...context }`), never string interpolation, never secrets/tokens/content.
//
// This deliberately mirrors src/lib/logger.ts's shape rather than importing
// it — that module runs fine in Node but isn't verified Deno-safe (it types
// against `NodeJS.ErrnoException`), and this function has no build step to
// catch a Deno-incompatible import at deploy time the way Next's bundler
// would at build time. Logged as part of TD-13 alongside the schema
// duplication — same root cause (no shared runtime-agnostic module path
// between src/ and supabase/functions/ yet), one entry covers both.
type LogContext = Record<string, unknown>;

function log(level: "error" | "warn" | "info", event: string, context?: LogContext) {
  console[level](JSON.stringify({ level, event, ...context }));
}

export const logger = {
  error: (event: string, context?: LogContext) => log("error", event, context),
  warn: (event: string, context?: LogContext) => log("warn", event, context),
  info: (event: string, context?: LogContext) => log("info", event, context),
};
