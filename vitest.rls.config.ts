import { defineConfig } from "vitest/config";

/**
 * TD-11 -- RLS cross-user isolation test, run against the real hosted
 * Supabase project (`npm run test:rls`). Kept separate from
 * vitest.config.ts so `npm test` / CI never make network calls or need
 * credentials. Missing env fails the run loudly (supabase/tests/rls/env.ts)
 * -- it never skips.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["supabase/tests/rls/**/*.rls.test.ts"],
    // Real network round-trips to the hosted project, not in-memory calls.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
