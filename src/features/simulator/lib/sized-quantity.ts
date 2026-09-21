import { MAX_RISK_PCT } from "@/lib/engine/types";
import { computePositionSize } from "@/lib/engine/position-sizing";
import { fromMoneyUnits, fromQuantityUnits, toMoneyUnits, toPriceUnits } from "@/lib/engine/units";

import { parseDecimalInput, type OrderTicketFormValues } from "./order-ticket-schema";

type SizeByRiskFormValues = Pick<
  OrderTicketFormValues,
  "accountBalance" | "riskPct" | "plannedEntryPrice" | "plannedStopPrice"
>;

export type SizedQuantityOutcome =
  | { status: "incomplete" }
  | { status: "rejected"; note: string }
  | { status: "sized"; quantity: string; note: string };

/**
 * The pure half of `OrderTicket`'s live "size by risk" recompute
 * (GLOSSARY.md "Position sizing") -- given the four raw sizing form
 * values, either nothing (some field still blank), a rejection note
 * (`/lib/engine`'s `computePositionSize` refused the input -- e.g. entry
 * equals stop), or a computed quantity string + an explanatory note
 * ("sized to X sh, risking $Y" / the 5% clamp message). `OrderTicket`
 * itself only wires this to `getValues()`/`setValue("quantity", ...)` --
 * every actual decision lives here, where it's hand-testable without a
 * DOM.
 */
export function computeSizedQuantity(values: SizeByRiskFormValues): SizedQuantityOutcome {
  const accountBalance = parseDecimalInput(values.accountBalance);
  const riskPct = parseDecimalInput(values.riskPct);
  const entryPrice = parseDecimalInput(values.plannedEntryPrice);
  const stopPrice = parseDecimalInput(values.plannedStopPrice);

  if (
    accountBalance === undefined ||
    riskPct === undefined ||
    entryPrice === undefined ||
    stopPrice === undefined
  ) {
    return { status: "incomplete" };
  }

  const result = computePositionSize({
    accountBalance: toMoneyUnits(accountBalance),
    riskPct,
    entryPrice: toPriceUnits(entryPrice),
    stopPrice: toPriceUnits(stopPrice),
  });

  if (!result.ok) {
    return { status: "rejected", note: result.error.message };
  }

  const sizedQuantity = fromQuantityUnits(result.quantity);
  const riskAmountLabel = fromMoneyUnits(result.riskAmount).toFixed(2);
  const note = result.clamped
    ? `Risk capped at ${MAX_RISK_PCT}% (you entered ${riskPct}%) -- sized to ${sizedQuantity} sh, risking $${riskAmountLabel}.`
    : `Sized to ${sizedQuantity} sh, risking $${riskAmountLabel} (${result.appliedRiskPct}% of $${accountBalance.toFixed(2)}).`;

  return { status: "sized", quantity: String(sizedQuantity), note };
}
