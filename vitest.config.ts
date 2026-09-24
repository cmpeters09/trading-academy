import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * ADR-010 — unit tests (fill engine, stats, XP, position sizing) plus
 * component tests for the complex interactive components ADR-010 §4 names
 * (order ticket). E2E stays on Playwright.
 *
 * The default environment stays "node": pure-logic tests don't pay for a
 * DOM. A component test opts into jsdom per file with a
 * `// @vitest-environment jsdom` docblock (TD-09) — Vitest 4 dropped
 * `environmentMatchGlobs`, and a per-file opt-in keeps the choice visible
 * at the top of the file that needs it.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
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
        "src/features/replay/engine/**": {
          branches: 100,
          statements: 100,
          functions: 100,
          lines: 100,
        },
        "src/features/simulator/lib/**": {
          branches: 100,
          statements: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
});
