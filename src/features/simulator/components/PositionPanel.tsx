"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fromMoneyUnits, fromPriceUnits, fromQuantityUnits } from "@/lib/engine/units";

import { OrderTicket } from "./OrderTicket";
import { useSimulatorStore } from "../store";

/**
 * The simulator's other half of the order-ticket flow (M-9 Session 3):
 * shows exactly one of four states, switching automatically as
 * `useSimulatorStore` changes --
 *
 * 1. **Open position** -- direction, quantity, avg entry, and the bracket
 *    if one was set. The ticket is hidden; this session doesn't support
 *    adding to or manually closing a position from here (README: known
 *    limitation).
 * 2. **Order pending** -- submitted, waiting for the next revealed bar.
 *    The ticket is hidden so a second order can't be queued behind it.
 * 3. **Flat** -- the ticket is shown so a new order can be placed,
 *    alongside the last closed trade's result and/or a rejected-order
 *    error, if either happened last cycle (§7: inline, not a toast).
 *
 * Session 4 adds full P&L/R display and the risk-% sizing helper; this is
 * deliberately minimal -- just enough to SEE a fill and a close happen.
 */
export function PositionPanel() {
  const pendingOrder = useSimulatorStore((state) => state.pendingOrder);
  const position = useSimulatorStore((state) => state.position);
  const lastClosedTrade = useSimulatorStore((state) => state.lastClosedTrade);
  const orderError = useSimulatorStore((state) => state.orderError);
  const submitOrder = useSimulatorStore((state) => state.submitOrder);

  if (position) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Open position</CardTitle>
          <CardDescription>
            {position.direction === "long" ? "Buy (Long)" : "Sell (Short)"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Quantity</dt>
            <dd>{fromQuantityUnits(position.quantity)} sh</dd>
            <dt className="text-muted-foreground">Avg entry</dt>
            <dd>${fromPriceUnits(position.entryPrice).toFixed(2)}</dd>
            {position.plannedStopPrice !== undefined ? (
              <>
                <dt className="text-muted-foreground">Stop-loss</dt>
                <dd>${fromPriceUnits(position.plannedStopPrice).toFixed(2)}</dd>
              </>
            ) : null}
            {position.plannedTargetPrice !== undefined ? (
              <>
                <dt className="text-muted-foreground">Target</dt>
                <dd>${fromPriceUnits(position.plannedTargetPrice).toFixed(2)}</dd>
              </>
            ) : null}
          </dl>
        </CardContent>
      </Card>
    );
  }

  if (pendingOrder) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Order pending</CardTitle>
          <CardDescription role="status" aria-live="polite">
            Waiting for the next bar to{" "}
            {pendingOrder.orderType === "market" ? "fill at its open" : "check for a touch"}.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {orderError ? (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
        >
          Order rejected: {orderError.message}
        </div>
      ) : null}
      {lastClosedTrade ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success"
        >
          Closed -- net PnL ${fromMoneyUnits(lastClosedTrade.netPnl).toFixed(2)}
          {lastClosedTrade.rMultiple !== null ? ` (R: ${lastClosedTrade.rMultiple.toFixed(2)})` : ""}
        </div>
      ) : null}
      <OrderTicket onSubmit={submitOrder} />
    </div>
  );
}
