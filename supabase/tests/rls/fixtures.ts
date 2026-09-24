/**
 * Fixed IDs for the TD-11 RLS isolation seed rows.
 *
 * These MUST match `seed.sql` / `teardown.sql` exactly -- SQL can't import
 * this file, so the two are kept in sync by hand. Fixed (not random) IDs so
 * teardown deletes exactly these rows and nothing else, and so a stray seed
 * row is recognizable at a glance in the Table Editor (`...-00000000a0nn` =
 * user A, `...-00000000b0nn` = user B).
 */
export const SEED = {
  a: {
    simAccount: "00000000-0000-4000-8000-00000000a001",
    order: "00000000-0000-4000-8000-00000000a002",
    execution: "00000000-0000-4000-8000-00000000a003",
    trade: "00000000-0000-4000-8000-00000000a004",
  },
  b: {
    simAccount: "00000000-0000-4000-8000-00000000b001",
    order: "00000000-0000-4000-8000-00000000b002",
    execution: "00000000-0000-4000-8000-00000000b003",
    trade: "00000000-0000-4000-8000-00000000b004",
  },
} as const;

export type SeedIds = (typeof SEED)[keyof typeof SEED];
