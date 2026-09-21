import { fromPriceUnits, fromQuantityUnits } from "@/lib/engine/units";

import type { OrderTicketSubmission } from "../lib/order-ticket-schema";

type CapturedOrderSummaryProps = {
  order: OrderTicketSubmission;
};

/**
 * Read-only confirmation shown after OrderTicket captures a valid order.
 * Presenter, split out of OrderTicket.tsx (ENGINEERING_PRINCIPLES §3.2)
 * so the form component stays focused on capture/validation and this one
 * stays focused on displaying the result -- also keeps OrderTicket.tsx
 * under the 150-line soft limit (§3.3).
 *
 * Session 2 doesn't fill anything; this just echoes back what was
 * validated, in human units, via the engine's own `from*Units` converters
 * (ADR-014) rather than re-deriving the conversion.
 */
export function CapturedOrderSummary({ order }: CapturedOrderSummaryProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-4 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success"
    >
      <p className="font-medium">
        Order captured -- not filled yet (Session 3 wires this to the engine).
      </p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt>Direction</dt>
        <dd>{order.direction === "long" ? "Buy (Long)" : "Sell (Short)"}</dd>
        <dt>Order type</dt>
        <dd className="capitalize">{order.orderType}</dd>
        <dt>Quantity</dt>
        <dd>{fromQuantityUnits(order.quantity)} sh</dd>
        {order.limitPrice !== undefined ? (
          <>
            <dt>Limit price</dt>
            <dd>${fromPriceUnits(order.limitPrice).toFixed(2)}</dd>
          </>
        ) : null}
        {order.stopPrice !== undefined ? (
          <>
            <dt>Stop price</dt>
            <dd>${fromPriceUnits(order.stopPrice).toFixed(2)}</dd>
          </>
        ) : null}
        {order.plannedStopPrice !== undefined ? (
          <>
            <dt>Planned stop-loss</dt>
            <dd>${fromPriceUnits(order.plannedStopPrice).toFixed(2)}</dd>
          </>
        ) : null}
        {order.plannedTargetPrice !== undefined ? (
          <>
            <dt>Planned target</dt>
            <dd>${fromPriceUnits(order.plannedTargetPrice).toFixed(2)}</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}
