import type { EngineOrder } from "@/lib/engine/types";

import type { OrderTicketSubmission } from "./order-ticket-schema";

/**
 * The one place a ticket's `direction` (long/short — the vocabulary a
 * beginner trader thinks in, and the one Session 1's position reducer
 * uses) becomes the engine's `side` (buy/sell — the vocabulary a fill
 * actually executes in). Opening a long is a buy; opening a short is a
 * sell (ADR-007's fill model has no separate "short-selling" order type —
 * a sell order that isn't closing an existing long simply opens a short).
 */
export function toEngineOrder(order: OrderTicketSubmission): EngineOrder {
  return {
    side: order.direction === "long" ? "buy" : "sell",
    type: order.orderType,
    quantity: order.quantity,
    ...(order.limitPrice !== undefined ? { limitPrice: order.limitPrice } : {}),
    ...(order.stopPrice !== undefined ? { stopPrice: order.stopPrice } : {}),
  };
}
