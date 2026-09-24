import { createClient } from "@/services/supabase/server";
import type { SimAccount } from "@/types/simulator.types";

/** Matches `sim_accounts.starting_balance`'s DB default (DATABASE_SCHEMA.md §4, `20260917090000_create_sim_accounts.sql`). */
const DEFAULT_STARTING_BALANCE = 100000;

type SimAccountRow = {
  id: string;
  user_id: string;
  name: string;
  starting_balance: number;
  balance: number;
  currency: string;
  is_default: boolean;
};

function toSimAccount(row: SimAccountRow): SimAccount {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    startingBalance: row.starting_balance,
    balance: row.balance,
    currency: row.currency,
    isDefault: row.is_default,
  };
}

const SIM_ACCOUNT_COLUMNS =
  "id, user_id, name, starting_balance, balance, currency, is_default";

/**
 * Returns the signed-in user's default `sim_account`, creating one (M-9's
 * migration comment: account creation isn't a privileged write, ordinary
 * `user_id = auth.uid()` RLS applies, ADR-012) the first time they need it.
 * M-11 Session 2 -- unblocks threading a real `simAccountId` through the
 * simulator (`ReplaySimulator`/`useSimulatorStore`) so a closed trade has
 * somewhere real to be stamped against before persistence (Session 4/5)
 * exists.
 *
 * Returns `null` when nobody is signed in. `/replay` is already
 * route-gated (`src/proxy.ts`, Next.js 16's renamed middleware convention
 * -- see its own comment) so this is normally unreachable by the time a
 * Server Component renders; it stays a returned `null` rather than a
 * thrown error anyway, for the small real race window between the proxy's
 * `getClaims()` check and this render's `getUser()` call (e.g. a session
 * that expires in between) -- same null-for-expected-absence pattern as
 * `getInstrumentBySymbol` (`services/market-data/candles.ts`).
 *
 * Known gap (TD-12): no unique constraint enforces one `is_default` row
 * per user, so two concurrent first-visits from the same user could both
 * insert. Harmless for a single interactive user in a class-window
 * session; logged rather than silently addressed with a same-session
 * migration that wasn't asked for.
 */
export async function getOrCreateDefaultSimAccount(): Promise<SimAccount | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: existing, error: selectError } = await supabase
    .from("sim_accounts")
    .select(SIM_ACCOUNT_COLUMNS)
    .eq("user_id", user.id)
    .eq("is_default", true)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to load sim account: ${selectError.message}`, {
      cause: selectError,
    });
  }
  if (existing) return toSimAccount(existing);

  const { data: created, error: insertError } = await supabase
    .from("sim_accounts")
    .insert({
      user_id: user.id,
      name: "Main",
      starting_balance: DEFAULT_STARTING_BALANCE,
      balance: DEFAULT_STARTING_BALANCE,
      currency: "USD",
      is_default: true,
    })
    .select(SIM_ACCOUNT_COLUMNS)
    .single();

  if (insertError) {
    throw new Error(`Failed to create sim account: ${insertError.message}`, {
      cause: insertError,
    });
  }
  return toSimAccount(created);
}
