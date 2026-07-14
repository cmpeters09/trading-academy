import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // ENGINEERING_PRINCIPLES.md §1, §8, §17 — project rules layered on top of
    // the Next.js defaults. @typescript-eslint/no-explicit-any is already
    // "error" via eslint-config-next/typescript, so it isn't redeclared here.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-console": "error",
      "react-hooks/exhaustive-deps": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*/**"],
              message:
                "Import only a feature's public surface: '@/features/<name>'. Deep imports into a feature's internals are banned (ENGINEERING_PRINCIPLES.md §1).",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
