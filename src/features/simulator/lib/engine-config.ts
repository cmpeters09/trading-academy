import type { EngineConfig } from "@/lib/engine/types";
import { toPriceUnits } from "@/lib/engine/units";

/**
 * NON_NEGOTIABLES Rule 9 — realistic simulations model slippage and
 * commission; a zero-friction fill would teach a false lesson about how
 * trading actually feels. Modest, defensible v1 numbers (5 bps slippage,
 * half a cent per share commission) — not yet configurable per
 * `sim_account`: DATABASE_SCHEMA.md's `sim_accounts` table has no such
 * column, so this is a fixed app-wide default until a later session makes
 * it one.
 */
export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  slippage: { model: "fixed_bps", bps: 5 },
  commission: { model: "per_unit", ratePerUnit: toPriceUnits(0.005) },
};
