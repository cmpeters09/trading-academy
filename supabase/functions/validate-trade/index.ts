// validate-trade — ADR-007's server-side re-validation entry point.
//
// THIS SESSION (M-11 Session 3) is a skeleton only:
//   - JWT verification + deriving `userId` from the token (this file)
//   - Zod validation of the closed-trade payload (./schema.ts)
//   - typed error responses (./errors.ts)
//   - a success STUB that echoes back what the eventual `trades` insert
//     would look like — no engine re-run, no orders/executions/trades
//     writes, no Docker/local-stack dependency.
// The actual re-run-the-engine-against-real-candles-and-write step is
// ADR-007's job for a later session; this function does not do it yet.
//
// ENGINEERING_PRINCIPLES.md §20 — every Edge Function MUST:
//   1. Verify the JWT and derive `userId` FROM THE TOKEN, never the body.
//   2. Validate input with the shared Zod schema.
//   3. Return the typed error shape (§7) with a stable `code`.
//   4. Be idempotent where the operation can repeat.
//   5. Log its outcome structurally (§8).
// Numbered comments below point back to each of these.

import { createClient } from "npm:@supabase/supabase-js@2.110.3";

import { closedTradePayloadSchema } from "./schema.ts";
import { errorResponse } from "./errors.ts";
import { logger } from "./log.ts";

// Permissive by design: this function is called from the Next.js app's
// origin via `supabase.functions.invoke`, which runs entirely client-side
// (browser fetch to the Supabase project's functions domain, a different
// origin than the app) — so a preflight OPTIONS request needs an answer.
// Locking this to a specific origin is a config-time decision (which
// origins: local dev, Vercel preview URLs, production) deferred to
// deployment, not something to hardcode guessing at this session.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse(
      "METHOD_NOT_ALLOWED",
      "validate-trade only accepts POST.",
      undefined,
      corsHeaders,
    );
  }

  // --- 1. Verify the JWT, derive userId FROM THE TOKEN ---------------------
  // Never trust a `userId` in the request body (§20 — "the open database
  // footgun"). `getUser()` validates the caller's JWT against Supabase Auth
  // and hands back the authenticated user it belongs to; there is no path
  // in this function that reads a user id anywhere else.
  //
  // Uses the ANON key, not the service role — this function performs no
  // privileged write yet, so it needs no elevated credential. When a later
  // session adds the actual insert, that insert (and only that insert)
  // is what justifies switching to the service-role client (ADR-002/012).
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    logger.warn("trade_validation_rejected", { code: "UNAUTHORIZED", reason: "missing_auth_header" });
    return errorResponse(
      "UNAUTHORIZED",
      "Missing Authorization header.",
      undefined,
      corsHeaders,
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    logger.warn("trade_validation_rejected", {
      code: "UNAUTHORIZED",
      reason: "invalid_or_expired_token",
    });
    return errorResponse(
      "UNAUTHORIZED",
      "Invalid or expired session.",
      undefined,
      corsHeaders,
    );
  }
  const userId = user.id;

  // --- 2. Validate input with the shared Zod schema -------------------------
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    logger.warn("trade_validation_rejected", { code: "INVALID_JSON", userId });
    return errorResponse(
      "INVALID_JSON",
      "Request body must be valid JSON.",
      undefined,
      corsHeaders,
    );
  }

  const parsed = closedTradePayloadSchema.safeParse(json);
  if (!parsed.success) {
    // §8 — log every trade validation rejection.
    logger.warn("trade_validation_rejected", {
      code: "VALIDATION_FAILED",
      userId,
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
    });
    return errorResponse(
      "VALIDATION_FAILED",
      "Trade payload failed validation.",
      parsed.error.flatten(),
      corsHeaders,
    );
  }
  const trade = parsed.data;

  // --- 4. Idempotency (TD-14 — designed, not implemented this session) -----
  // `trade.clientTradeKey` is the key: stamped ONCE on the client at the
  // moment a trade closes (same discipline as `entryTs`), sent on every
  // retry unchanged. The real check — "does a trades row for
  // (user_id, client_trade_key) already exist? if so, return it instead of
  // inserting again" — needs a DB column + unique constraint that doesn't
  // exist yet (no migration this session; see TD-14). Accepting and
  // logging the key now, even though nothing is done with it yet, is
  // deliberate: it proves the contract end-to-end so the write session
  // only has to add the lookup, not renegotiate the payload shape.

  // --- 3./5. Success stub: echo what WOULD be written, log the outcome -----
  // No `orders`/`executions`/`trades` insert happens here — see file header.
  // Shape mirrors the `trades` row exactly (DATABASE_SCHEMA.md §4) so the
  // write session can lift this object close to as-is into a real insert.
  const wouldWriteTrade = {
    user_id: userId,
    sim_account_id: trade.simAccountId,
    replay_session_id: null, // TD-06 — replay_sessions doesn't exist yet
    instrument_id: trade.instrumentId,
    direction: trade.direction,
    entry_ts: trade.entryTs,
    exit_ts: trade.exitTs,
    avg_entry: trade.avgEntry,
    avg_exit: trade.avgExit,
    quantity: trade.quantity,
    gross_pnl: trade.grossPnl,
    fees: trade.fees,
    net_pnl: trade.netPnl,
    r_multiple: trade.rMultiple,
    planned_stop: trade.plannedStop ?? null,
    planned_target: trade.plannedTarget ?? null,
    engine_version: trade.engineVersion,
  };

  logger.info("trade_validation_stub_accepted", {
    userId,
    clientTradeKey: trade.clientTradeKey,
    instrumentId: trade.instrumentId,
  });

  return new Response(
    JSON.stringify({
      ok: true,
      stub: true,
      note:
        "validate-trade skeleton (M-11 Session 3): input verified and validated, nothing persisted. No engine re-run, no orders/executions/trades writes yet.",
      wouldWrite: { trades: wouldWriteTrade },
    }),
    { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } },
  );
});
