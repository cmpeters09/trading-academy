"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { FormField } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { logger } from "@/lib/logger";
import { cn } from "@/utils/cn";

import { CapturedOrderSummary } from "./CapturedOrderSummary";
import { SizeByRiskFields } from "./SizeByRiskFields";
import {
  orderTicketSchema,
  toOrderTicketSubmission,
  type OrderTicketFormValues,
  type OrderTicketSubmission,
  type ValidatedOrderTicketValues,
} from "../lib/order-ticket-schema";
import { computeSizedQuantity } from "../lib/sized-quantity";

const DEFAULT_VALUES: OrderTicketFormValues = {
  direction: "long",
  orderType: "market",
  quantity: "",
  limitPrice: "",
  stopPrice: "",
  plannedStopPrice: "",
  plannedTargetPrice: "",
  plannedEntryPrice: "",
  // GLOSSARY.md "Position sizing": seeing how account size changes
  // position size is the lesson -- pre-filled, editable, never hidden.
  // $100,000 matches sim_accounts.starting_balance's own default
  // (DATABASE_SCHEMA.md §4).
  accountBalance: "100000",
  riskPct: "",
};

const directionOptionClassName =
  "flex h-9 cursor-pointer items-center justify-center rounded-lg border border-input text-sm font-medium transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50";

type OrderTicketProps = {
  /**
   * Session 3 (`PositionPanel`) passes this to hand a captured order to
   * `useSimulatorStore`'s `submitOrder` -- once provided, the CALLER owns
   * showing what happened to it (a pending/open/closed readout), so this
   * component's own `CapturedOrderSummary` is skipped; see below. Left
   * unset (e.g. this component used standalone), the ticket falls back to
   * logging the captured order and showing it on-screen itself (§8
   * structured log, not a `console.log`).
   */
  onSubmit?: (order: OrderTicketSubmission) => void;
};

/**
 * The paper-trading order-entry panel (M-9 Session 2, wired to the engine
 * in Session 3). Captures direction, quantity, order type, and optional
 * planned stop/target -- validates with `orderTicketSchema` (React Hook
 * Form + Zod, ADR-005: this is form state, not a Zustand store) -- and on
 * submit produces a typed `OrderTicketSubmission` in the engine's own
 * branded units. Filling the order, touching `/lib/engine`, and updating
 * position state all happen one level up, in whatever `onSubmit` does
 * (`PositionPanel` -> `useSimulatorStore.submitOrder`) -- this component's
 * job ends at producing a validated order.
 */
export function OrderTicket({ onSubmit }: OrderTicketProps) {
  const [capturedOrder, setCapturedOrder] = useState<OrderTicketSubmission | null>(null);
  const [sizingNote, setSizingNote] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<OrderTicketFormValues, unknown, ValidatedOrderTicketValues>({
    resolver: zodResolver(orderTicketSchema),
    defaultValues: DEFAULT_VALUES,
  });

  // useWatch, not the destructured watch() -- the latter can't be safely
  // memoized by the React Compiler (it closes over RHF's internal mutable
  // subscription state), so the compiler skips memoizing this whole
  // component when it sees watch() called directly.
  const orderType = useWatch({ control, name: "orderType" });

  /**
   * The "size by risk" live recompute (GLOSSARY.md "Position sizing") --
   * wired as the `onChange` for all four sizing inputs (accountBalance,
   * riskPct, plannedEntryPrice, plannedStopPrice) rather than a
   * `useEffect` watching them (§17: `useEffect` is a last resort, and this
   * is the same event-driven pattern the orderType handler already uses).
   * `computeSizedQuantity` (lib/sized-quantity.ts) owns every actual
   * decision; this is just the imperative RHF wiring around it. Reads via
   * `getValues()` (no subscription, no re-render), not `useWatch` -- only
   * the CURRENT values at the moment one field changes are needed.
   */
  function recomputeSizedQuantity() {
    const outcome = computeSizedQuantity(getValues());
    if (outcome.status === "incomplete") {
      setSizingNote(null);
      return;
    }
    if (outcome.status === "sized") {
      setValue("quantity", outcome.quantity);
    }
    setSizingNote(outcome.note);
  }

  const onValid = handleSubmit((validated) => {
    const order = toOrderTicketSubmission(validated);
    if (onSubmit) {
      onSubmit(order);
    } else {
      setCapturedOrder(order);
      logger.info("order_ticket_captured", { ...order });
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order ticket</CardTitle>
        <CardDescription>
          Paper trading only -- no real money, no live orders placed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onValid} noValidate className="flex flex-col gap-4">
          <fieldset className="grid gap-2">
            <legend className="text-sm leading-none font-medium">Direction</legend>
            <div className="grid grid-cols-2 gap-2">
              <label
                className={cn(
                  directionOptionClassName,
                  "has-[:checked]:border-transparent has-[:checked]:bg-success/15 has-[:checked]:text-success",
                )}
              >
                <input type="radio" value="long" className="sr-only" {...register("direction")} />
                Buy (Long)
              </label>
              <label
                className={cn(
                  directionOptionClassName,
                  "has-[:checked]:border-transparent has-[:checked]:bg-danger/15 has-[:checked]:text-danger",
                )}
              >
                <input type="radio" value="short" className="sr-only" {...register("direction")} />
                Sell (Short)
              </label>
            </div>
          </fieldset>

          <div className="grid gap-2">
            <Label htmlFor="orderType">Order type</Label>
            <Select
              id="orderType"
              {...register("orderType", {
                onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
                  const next = event.target.value as OrderTicketFormValues["orderType"];
                  if (next !== "limit") setValue("limitPrice", "");
                  if (next !== "stop") setValue("stopPrice", "");
                },
              })}
            >
              <option value="market">Market</option>
              <option value="limit">Limit</option>
              <option value="stop">Stop</option>
            </Select>
          </div>

          <FormField
            id="quantity"
            label="Quantity (shares)"
            error={errors.quantity?.message}
            registration={register("quantity")}
          />

          {orderType === "limit" ? (
            <FormField
              id="limitPrice"
              label="Limit price ($)"
              error={errors.limitPrice?.message}
              registration={register("limitPrice")}
            />
          ) : null}

          {orderType === "stop" ? (
            <FormField
              id="stopPrice"
              label="Stop price ($) -- triggers the order"
              error={errors.stopPrice?.message}
              registration={register("stopPrice")}
            />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="plannedStopPrice"
              label="Planned stop-loss ($, optional)"
              error={errors.plannedStopPrice?.message}
              registration={register("plannedStopPrice", { onChange: recomputeSizedQuantity })}
            />
            <FormField
              id="plannedTargetPrice"
              label="Planned target ($, optional)"
              error={errors.plannedTargetPrice?.message}
              registration={register("plannedTargetPrice")}
            />
          </div>

          <SizeByRiskFields
            register={register}
            errors={errors}
            note={sizingNote}
            onSizingInputChange={recomputeSizedQuantity}
          />

          <Button type="submit" className="w-full">
            Place simulated order
          </Button>
        </form>

        {capturedOrder ? <CapturedOrderSummary order={capturedOrder} /> : null}
      </CardContent>
    </Card>
  );
}
