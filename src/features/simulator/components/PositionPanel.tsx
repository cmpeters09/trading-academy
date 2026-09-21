"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fromMoneyUnits, fromPriceUnits, fromQuantityUnits } from "@/lib/engine/units";

import { OrderTicket } from "./OrderTicket";
import { computeUnrealizedPnl } from "../lib/unrealized-pnl";
import { useSimulatorStore } from "../store";

/** `+$50.00`/`-$30.00` -- sign BEFORE the currency symbol, never doubled with toFixed's own "-". */
function signedCurrency(value: number): string {
  return `${value < 0 ? "-" : "+"}$${Math.abs(value).toFixed(2)}`;
}

/** `+1.50R`/`-0.60R`. */
function signedR(value: number): string {
  return `${value < 0 ? "-" : "+"}${Math.abs(value).toFixed(2)}R`;
}

/** Green for profit, red (danger) for loss, default text for exactly zero -- paired with the +/- sign above, never color alone (§11). */
function pnlColorClass(value: number): string {
  if (value > 0) return "text-success";
  if (value < 0) return "text-danger";
  return "";
}

/**
 * The simulator's other half of the order-ticket flow (M-9 Session 3):
 * shows exactly one of four states, switching automatically as
 * `useSimulatorStore` changes --
 *
 * 1. **Open position** -- direction, quantity, avg entry, the bracket if
 *    one was set, unrealized PnL/R (Session 4) marked against the latest
 *    revealed bar's close (`lastPrice`) -- gross, labeled "before exit
 *    costs" (Q3: no exit commission has actually been paid yet) -- and
 *    either a "Close position" button or a "closing at the next bar's
 *    open" status once that button's been clicked (TD-10). The ticket is
 *    hidden; this session still doesn't support adding to an open
 *    position (README: known limitation).
 * 2. **Order pending** -- submitted, waiting for the next revealed bar.
 *    The ticket is hidden so a second order can't be queued behind it.
 * 3. **Flat** -- the ticket is shown so a new order can be placed,
 *    alongside the last closed trade's result and/or a rejected-order
 *    error, if either happened last cycle (§7: inline, not a toast).
 */
export function PositionPanel() {
  const pendingOrder = useSimulatorStore((state) => state.pendingOrder);
  const position = useSimulatorStore((state) => state.position);
  const lastPrice = useSimulatorStore((state) => state.lastPrice);
  const closeRequested = useSimulatorStore((state) => state.closeRequested);
  const lastClosedTrade = useSimulatorStore((state) => state.lastClosedTrade);
  const orderError = useSimulatorStore((state) => state.orderError);
  const submitOrder = useSimulatorStore((state) => state.submitOrder);
  const requestClose = useSimulatorStore((state) => state.requestClose);

  if (position) {
    // lastPrice is only ever null before the first bar reveals -- and a
    // position can't exist yet at that point (it's created inside the
    // same onBarRevealed update that sets lastPrice), so this is
    // defensive, not a real "position with no mark price" state.
    const unrealized = lastPrice !== null ? computeUnrealizedPnl(position, lastPrice) : null;
    const unrealizedPnl = unrealized ? fromMoneyUnits(unrealized.grossPnl) : null;

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
            {unrealizedPnl !== null ? (
              <>
                <dt className="text-muted-foreground">Unrealized PnL (before exit costs)</dt>
                <dd className={pnlColorClass(unrealizedPnl)}>{signedCurrency(unrealizedPnl)}</dd>
              </>
            ) : null}
            {unrealized?.rMultiple != null ? (
              <>
                <dt className="text-muted-foreground">Unrealized R</dt>
                <dd className={pnlColorClass(unrealized.rMultiple)}>
                  {signedR(unrealized.rMultiple)}
                </dd>
              </>
            ) : null}
          </dl>
          {closeRequested ? (
            <p role="status" aria-live="polite" className="mt-3 text-sm text-muted-foreground">
              Closing at the next bar&apos;s open…
            </p>
          ) : (
            <Button type="button" variant="outline" className="mt-3 w-full" onClick={requestClose}>
              Close position
            </Button>
          )}
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
