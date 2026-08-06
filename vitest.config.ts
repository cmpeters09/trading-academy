import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * ADR-010 — unit tests only (fill engine, stats, XP, position sizing).
 * E2E stays on Playwright; component tests aren't in scope yet (no complex
 * interactive components exist to test per ADR-010 §4).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // ENGINEERING_PRINCIPLES §14 — coverage thresholds are per-directory,
      // not global: /lib/engine targets ~100% branches (pure domain logic),
      // and nothing else is held to that bar yet. Enforced here rather than
      // left as an unmeasured aspiration.
      thresholds: {
        "src/lib/engine/**": {
          branches: 100,
          statements: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
});
