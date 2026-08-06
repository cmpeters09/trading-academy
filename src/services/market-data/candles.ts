import * as z from "zod";

import { createClient } from "@/services/supabase/server";
import type { Candle, Instrument, Timeframe } from "@/types/market.types";

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"] as const satisfies readonly Timeframe[];

export const timeframeSchema = z.enum(TIMEFRAMES);

const getCandlesInputSchema = z.object({
  instrumentId: z.uuid(),
  timeframe: timeframeSchema,
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
});

export type GetCandlesInput = z.infer<typeof getCandlesInputSchema>;

/**
 * Bounded by instrument + timeframe + range, hitting the composite index on
 * (instrument_id, timeframe, ts desc) (DATABASE_SCHEMA §2, migration
 * 20260716050000). An unbounded `select` on candles is a merge blocker
 * (ENGINEERING_PRINCIPLES §12) — every caller must supply all three.
 */
export async function getCandles(input: GetCandlesInput): Promise<Candle[]> {
  const { instrumentId, timeframe, from, to } = getCandlesInputSchema.parse(input);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candles")
    .select("ts, open, high, low, close, volume")
    .eq("instrument_id", instrumentId)
    .eq("timeframe", timeframe)
    .gte("ts", from)
    .lte("ts", to)
    .order("ts", { ascending: true });

  if (error) {
    throw new Error(`Failed to load candles: ${error.message}`, { cause: error });
  }

  return data;
}

/**
 * Returns null for an unknown/inactive symbol — a normal, expected outcome
 * (e.g. a stale or mistyped `?symbol=` query param), not a thrown error.
 */
export async function getInstrumentBySymbol(symbol: string): Promise<Instrument | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("instruments")
    .select("id, symbol, name, asset_class")
    .eq("symbol", symbol)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load instrument: ${error.message}`, { cause: error });
  }
  if (!data) return null;

  return { id: data.id, symbol: data.symbol, name: data.name, assetClass: data.asset_class };
}
