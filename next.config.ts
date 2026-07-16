import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16 logs every Server Function call's raw arguments to the dev
  // terminal by default (docs/logging.md) — for auth actions that means
  // passwords and emails in plaintext on disk. ENGINEERING_PRINCIPLES §8
  // bans logging secrets/emails; our own `logger` module already respects
  // that, but this framework-level tracer doesn't know which args are ours.
  logging: {
    serverFunctions: false,
  },
};

export default nextConfig;
