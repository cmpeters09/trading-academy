/**
 * Cross-cutting simulator-account shape (DATABASE_SCHEMA.md §4
 * `sim_accounts`), used by the simulator service layer and any feature
 * that needs to know which account a trade is against. Same
 * camelCase-at-the-service-boundary convention as `market.types.ts`'s
 * `Candle`/`Instrument` (§4 Serialization).
 */
export type SimAccount = {
  id: string;
  userId: string;
  name: string;
  startingBalance: number;
  balance: number;
  currency: string;
  isDefault: boolean;
};
