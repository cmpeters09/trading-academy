/**
 * Runs once when a new Next.js server instance starts, before it accepts any
 * requests (stable since Next 15). Importing env here — rather than relying
 * on whichever module happens to import it first — is what makes env
 * validation actually happen at boot instead of at first use (ADR-015).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/env");
  }
}
