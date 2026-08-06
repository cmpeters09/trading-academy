/**
 * Cross-cutting market-data shapes (candles, timeframes) used by the chart
 * component, the market-data service layer, and any feature that composes
 * <PriceChart>. Mirrors the `timeframe` check constraint on the `candles`
 * table (supabase/migrations/20260716050000_create_market_data.sql).
 */
export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w";

export type Candle = {
  /** Bar open time, UTC, ISO 8601 — matches `candles.ts` in Postgres. */
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
