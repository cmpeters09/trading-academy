import type { FieldErrors, UseFormRegister } from "react-hook-form";

import { FormField } from "@/components/FormField";

import type { OrderTicketFormValues } from "../lib/order-ticket-schema";

type SizeByRiskFieldsProps = {
  register: UseFormRegister<OrderTicketFormValues>;
  errors: FieldErrors<OrderTicketFormValues>;
  note: string | null;
  onSizingInputChange: () => void;
};

/**
 * Presenter, split out of `OrderTicket.tsx` (§3.2/§3.3, same reasoning as
 * `CapturedOrderSummary`) -- three inputs (account balance, risk %,
 * planned entry price) that feed `OrderTicket`'s live "size by risk"
 * recompute. `plannedStopPrice` is the fourth input this needs, but it
 * already exists as its own field elsewhere on the ticket -- not
 * duplicated here.
 *
 * These three fields are NOT part of the submitted order
 * (`orderTicketSchema`'s `toOrderTicketSubmission` doesn't carry them) --
 * they exist purely to compute `quantity` via `/lib/engine`'s
 * `computePositionSize`, which `onSizingInputChange` (owned by
 * `OrderTicket`) runs on every change to any of the four sizing inputs.
 */
export function SizeByRiskFields({
  register,
  errors,
  note,
  onSizingInputChange,
}: SizeByRiskFieldsProps) {
  return (
    <fieldset className="grid gap-3 rounded-lg border border-input p-3">
      <legend className="px-1 text-sm font-medium">Size by risk (optional)</legend>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          id="accountBalance"
          label="Account balance ($)"
          error={errors.accountBalance?.message}
          registration={register("accountBalance", { onChange: onSizingInputChange })}
        />
        <FormField
          id="riskPct"
          label="Risk %"
          error={errors.riskPct?.message}
          registration={register("riskPct", { onChange: onSizingInputChange })}
        />
        <FormField
          id="plannedEntryPrice"
          label="Planned entry price ($)"
          error={errors.plannedEntryPrice?.message}
          registration={register("plannedEntryPrice", { onChange: onSizingInputChange })}
        />
      </div>
      {note ? (
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {note}
        </p>
      ) : null}
    </fieldset>
  );
}
