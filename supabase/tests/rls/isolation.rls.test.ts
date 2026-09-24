import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { rlsEnv } from "./env";
import { SEED, type SeedIds } from "./fixtures";

/**
 * TD-11 -- ENGINEERING_PRINCIPLES §14 / ADR-010: RLS cross-user isolation,
 * mandatory per table, for orders / executions / trades / trade_orders.
 *
 * Runs against the real hosted Supabase project (no Docker / `supabase
 * start`) using only the public anon key and two ordinary password sign-ins
 * -- exactly how the app itself talks to Supabase. READ-ONLY: every row it
 * looks at was created beforehand by `seed.sql` in the SQL Editor, because
 * these tables' SELECT-own-only policies mean a signed-in user cannot insert
 * into them (that is part of what's being proven).
 *
 * Run with `npm run test:rls`. Not part of `npm test` or CI -- see TD-11.
 */

type Table = "orders" | "executions" | "trades" | "trade_orders";

/**
 * How to find each user's seeded row in each table. trade_orders has no
 * `id` column (composite PK), so it's looked up by `trade_id`.
 */
const TABLES: ReadonlyArray<{
  table: Table;
  column: string;
  seedId: (ids: SeedIds) => string;
}> = [
  { table: "orders", column: "id", seedId: (ids) => ids.order },
  { table: "executions", column: "id", seedId: (ids) => ids.execution },
  { table: "trades", column: "id", seedId: (ids) => ids.trade },
  { table: "trade_orders", column: "trade_id", seedId: (ids) => ids.trade },
];

function newClient(): SupabaseClient {
  return createClient(
    rlsEnv.RLS_TEST_SUPABASE_URL,
    rlsEnv.RLS_TEST_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

async function signedInClient(
  email: string,
  password: string,
): Promise<SupabaseClient> {
  const client = newClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(
      `Sign-in failed for ${email}: ${error.message}. Check the test user exists and the password in .env.test.local.`,
    );
  }
  return client;
}

/**
 * Selects `column` from `table`, optionally filtered to one value. Any
 * Supabase error FAILS the test rather than reading as "0 rows" -- a query
 * that errored proves nothing about isolation.
 */
async function selectValues(
  client: SupabaseClient,
  table: Table,
  column: string,
  equals?: string,
): Promise<string[]> {
  let query = client.from(table).select(column);
  if (equals !== undefined) query = query.eq(column, equals);

  const { data, error } = await query;
  if (error)
    throw new Error(`select ${column} from ${table} failed: ${error.message}`);

  return (data as unknown as Record<string, string>[]).map(
    (row) => row[column] as string,
  );
}

describe("RLS cross-user isolation (TD-11)", () => {
  let userA: SupabaseClient;
  let userB: SupabaseClient;
  const signedOut = newClient();

  beforeAll(async () => {
    userA = await signedInClient(
      rlsEnv.RLS_TEST_USER_A_EMAIL,
      rlsEnv.RLS_TEST_USER_A_PASSWORD,
    );
    userB = await signedInClient(
      rlsEnv.RLS_TEST_USER_B_EMAIL,
      rlsEnv.RLS_TEST_USER_B_PASSWORD,
    );
  });

  afterAll(async () => {
    // "local" ends only these test sessions, not the users' other sessions.
    await userA?.auth.signOut({ scope: "local" });
    await userB?.auth.signOut({ scope: "local" });
  });

  const pairs = [
    {
      name: "A",
      other: "B",
      self: () => userA,
      ownIds: SEED.a,
      otherIds: SEED.b,
    },
    {
      name: "B",
      other: "A",
      self: () => userB,
      ownIds: SEED.b,
      otherIds: SEED.a,
    },
  ] as const;

  describe.each(TABLES)("$table", ({ table, column, seedId }) => {
    describe.each(pairs)(
      "as user $name",
      ({ other, self, ownIds, otherIds }) => {
        // Positive control: without it, a failed/missing seed (0 rows
        // anywhere) would make every isolation check below pass vacuously.
        it("sees its own seeded row (exactly 1)", async () => {
          const rows = await selectValues(
            self(),
            table,
            column,
            seedId(ownIds),
          );
          expect(
            rows,
            `own ${table} row missing -- did seed.sql run with the right UUIDs?`,
          ).toHaveLength(1);
        });

        it(`cannot read user ${other}'s row by id`, async () => {
          const rows = await selectValues(
            self(),
            table,
            column,
            seedId(otherIds),
          );
          expect(rows).toEqual([]);
        });

        it(`unfiltered select returns nothing of user ${other}'s`, async () => {
          const rows = await selectValues(self(), table, column);
          expect(rows).toContain(seedId(ownIds));
          expect(rows).not.toContain(seedId(otherIds));
        });
      },
    );

    it("signed-out (anon) client reads no rows at all", async () => {
      const rows = await selectValues(signedOut, table, column);
      expect(rows).toEqual([]);
    });
  });
});
