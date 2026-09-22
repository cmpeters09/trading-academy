// validate-trade's input contract — the wire shape of a closed round-trip
// as POSTed from the client, mirroring `ClosedTrade`
// (src/features/simulator/lib/process-bar.ts) field-for-field.
//
// This is NOT an import of that type or of `order-ticket-schema.ts`'s Zod
// schema (ENGINEERING_PRINCIPLES.md §7 asks for "the same Zod schema...
// shared between client and Edge Function"). It is a deliberate, DOCUMENTED
// duplication instead — see TD-13 (docs/engineering/TECHNICAL_DEBT.md) for
// why sharing wasn't attempted this session and what "shared" would actually
// require here.
//
// Branded units (`PriceUnits`/`MoneyUnits`/`QuantityUnits`, ADR-014) are
// TypeScript-only — the brand doesn't survive JSON serialization, so on the
// wire every one of these is a plain integer in the engine's minor units
// (1 PriceUnits/MoneyUnits = 1/10,000; 1 QuantityUnits = 1/100,000,000,
// per src/lib/engine/types.ts). `z.number().int()` enforces that they
// arrived as whole numbers, not decimals a client-side bug forgot to scale.
import { z } from "npm:zod@4.4.3";

/**
 * `clientTradeKey` — the idempotency key (TD-14). Not part of `ClosedTrade`
 * today; this schema defines the wire contract a future session's client
 * change must satisfy (stamp one UUID, once, at the point a trade closes —
 * same "stamped once, never regenerated on retry" discipline `entryTs`
 * already follows). Required here so the contract is correct from the
 * start, even though nothing on the client produces it yet — this request
 * will 400 with VALIDATION_FAILED until that follow-up session wires it up,
 * which is intentional: the skeleton should not accept a payload it cannot
 * later make idempotent.
 */
export const closedTradePayloadSchema = z.object({
  clientTradeKey: z.string().uuid(),

  instrumentId: z.string().uuid(),
  simAccountId: z.string().uuid(),
  direction: z.enum(["long", "short"]),

  // Market time (replay), ISO 8601 — matches `orders.placed_at_ts` /
  // `trades.entry_ts`/`exit_ts`, all `timestamptz`.
  entryTs: z.string().datetime(),
  exitTs: z.string().datetime(),

  avgEntry: z.number().int().positive(),
  avgExit: z.number().int().positive(),
  quantity: z.number().int().positive(),

  grossPnl: z.number().int(),
  fees: z.number().int().nonnegative(),
  netPnl: z.number().int(),

  // Dimensionless ratio (realized R vs. initial risk) — not a scaled
  // engine unit, so no `.int()`. `null` when the position had no planned
  // stop to compute R against (matches `trades.r_multiple`, nullable).
  rMultiple: z.number().finite().nullable(),

  plannedStop: z.number().int().positive().optional(),
  plannedTarget: z.number().int().positive().optional(),

  engineVersion: z.string().min(1),
});

export type ClosedTradePayload = z.infer<typeof closedTradePayloadSchema>;
