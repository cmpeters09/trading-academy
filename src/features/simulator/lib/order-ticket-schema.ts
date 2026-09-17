import * as z from "zod";

import { toPriceUnits, toQuantityUnits } from "@/lib/engine/units";
import type { PriceUnits, QuantityUnits } from "@/lib/engine/types";

/**
 * ENGINEERING_PRINCIPLES.md §7 -- one Zod schema for the order ticket form,
 * validated at the client boundary (Session 3 will re-validate the same
 * rules again when this submission actually reaches the engine/an Edge
 * Function -- client-side validation is a UX convenience here, never the
 * security boundary).
 *
 * Every text input on the ticket is a raw string (native <input type="text"
 * inputMode="decimal">, not type="number" -- avoids browser-specific
 * number-input quirks like scientific notation and locale separators).
 * Each numeric field parses that string into a decimal number *inside this
 * schema*; unit conversion to the engine's branded PriceUnits/QuantityUnits
 * (ADR-014) happens separately, in `toOrderTicketSubmission` below, not in
 * the schema itself -- keeping the schema's output plain decimal numbers
 * means `useForm`'s field types stay simple (string in, number out), with
 * no zod-transform-into-branded-type generic to fight React Hook Form's
 * resolver typing over.
 */

function requiredPositiveDecimal(message: string) {
  return z.string().transform((raw, ctx) => {
    const parsed = Number(raw.trim());
    if (raw.trim() === "" || !Number.isFinite(parsed) || parsed <= 0) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return parsed;
  });
}

function optionalPositiveDecimal(message: string) {
  return z.string().transform((raw, ctx) => {
    const trimmed = raw.trim();
    if (trimmed === "") return undefined;

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return parsed;
  });
}

const orderTicketFieldsSchema = z.object({
  direction: z.enum(["long", "short"]),
  orderType: z.enum(["market", "limit", "stop"]),
  quantity: requiredPositiveDecimal("Enter a quantity greater than 0"),
  limitPrice: optionalPositiveDecimal("Enter a limit price greater than 0"),
  stopPrice: optionalPositiveDecimal("Enter a stop price greater than 0"),
  plannedStopPrice: optionalPositiveDecimal("Enter a stop-loss price greater than 0"),
  plannedTargetPrice: optionalPositiveDecimal("Enter a target price greater than 0"),
});

/**
 * Cross-field rules, matching Session 1's `validateStop`/`validateTarget`
 * (`lib/position.ts`) extended to the one thing the ticket knows that a
 * position doesn't yet: which price, if any, the trader expects to enter
 * at.
 *
 * - `limit`/`stop` order types name a known reference price (the limit or
 *   stop-trigger price itself) -- the planned stop-loss/target are checked
 *   directly against it, on the correct side for the chosen direction.
 * - `market` orders have NO known entry price at submit time (ADR-007:
 *   a market order fills at the next bar's open, which doesn't exist yet).
 *   When both a stop-loss and target are given, the best this schema can
 *   do without a real price is check they're not backwards relative to
 *   EACH OTHER -- a real "wrong side of entry" check happens later, once
 *   Session 3 knows the actual fill price (Session 1's `openPosition`
 *   already rejects an invalid stop/target against the real entry).
 */
const orderTicketSchema = orderTicketFieldsSchema.superRefine((values, ctx) => {
  if (values.orderType === "limit" && values.limitPrice === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["limitPrice"],
      message: "Limit price is required for a limit order.",
    });
  }
  if (values.orderType === "stop" && values.stopPrice === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["stopPrice"],
      message: "Stop price is required for a stop order.",
    });
  }

  const referencePrice =
    values.orderType === "limit"
      ? values.limitPrice
      : values.orderType === "stop"
        ? values.stopPrice
        : undefined;
  const { direction, plannedStopPrice, plannedTargetPrice } = values;

  if (plannedStopPrice !== undefined && referencePrice !== undefined) {
    const onRiskSide =
      direction === "long"
        ? plannedStopPrice < referencePrice
        : plannedStopPrice > referencePrice;
    if (!onRiskSide) {
      ctx.addIssue({
        code: "custom",
        path: ["plannedStopPrice"],
        message: `Stop-loss must be ${direction === "long" ? "below" : "above"} your ${values.orderType} price for a ${direction} position.`,
      });
    }
  }

  if (plannedTargetPrice !== undefined && referencePrice !== undefined) {
    const onProfitSide =
      direction === "long"
        ? plannedTargetPrice > referencePrice
        : plannedTargetPrice < referencePrice;
    if (!onProfitSide) {
      ctx.addIssue({
        code: "custom",
        path: ["plannedTargetPrice"],
        message: `Target must be ${direction === "long" ? "above" : "below"} your ${values.orderType} price for a ${direction} position.`,
      });
    }
  }

  if (
    referencePrice === undefined &&
    plannedStopPrice !== undefined &&
    plannedTargetPrice !== undefined
  ) {
    const orderedCorrectly =
      direction === "long"
        ? plannedStopPrice < plannedTargetPrice
        : plannedStopPrice > plannedTargetPrice;
    if (!orderedCorrectly) {
      ctx.addIssue({
        code: "custom",
        path: ["plannedTargetPrice"],
        message:
          direction === "long"
            ? "Target must be above your stop-loss for a long position."
            : "Target must be below your stop-loss for a short position.",
      });
    }
  }
});

export { orderTicketSchema };

/** Raw form values -- every field is a string, matching the text inputs. */
export type OrderTicketFormValues = z.input<typeof orderTicketSchema>;

/** Validated form values -- decimal numbers, not yet engine units. */
export type ValidatedOrderTicketValues = z.output<typeof orderTicketSchema>;

export type OrderTicketSubmission = {
  direction: "long" | "short";
  orderType: "market" | "limit" | "stop";
  quantity: QuantityUnits;
  limitPrice?: PriceUnits;
  stopPrice?: PriceUnits;
  plannedStopPrice?: PriceUnits;
  plannedTargetPrice?: PriceUnits;
};

/**
 * The one place a validated decimal becomes an engine unit for the order
 * ticket (ADR-014's single boundary-conversion rule, same discipline as
 * `/lib/engine/units.ts`'s own `toPriceUnits`/`toQuantityUnits`). Session 3
 * hands this straight to `/lib/engine`'s fill functions and Session 1's
 * `openPosition` -- this function's job ends at producing a correctly-typed
 * order, not deciding what happens to it.
 */
export function toOrderTicketSubmission(
  values: ValidatedOrderTicketValues,
): OrderTicketSubmission {
  return {
    direction: values.direction,
    orderType: values.orderType,
    quantity: toQuantityUnits(values.quantity),
    ...(values.limitPrice !== undefined
      ? { limitPrice: toPriceUnits(values.limitPrice) }
      : {}),
    ...(values.stopPrice !== undefined
      ? { stopPrice: toPriceUnits(values.stopPrice) }
      : {}),
    ...(values.plannedStopPrice !== undefined
      ? { plannedStopPrice: toPriceUnits(values.plannedStopPrice) }
      : {}),
    ...(values.plannedTargetPrice !== undefined
      ? { plannedTargetPrice: toPriceUnits(values.plannedTargetPrice) }
      : {}),
  };
}
