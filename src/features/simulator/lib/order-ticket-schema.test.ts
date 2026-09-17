import { describe, expect, it } from "vitest";

import { fromPriceUnits, fromQuantityUnits } from "@/lib/engine/units";

import {
  orderTicketSchema,
  toOrderTicketSubmission,
  type OrderTicketFormValues,
  type ValidatedOrderTicketValues,
} from "./order-ticket-schema";

/** A blank, otherwise-valid market order -- the form's real defaultValues shape. */
function baseValues(overrides: Partial<OrderTicketFormValues> = {}): OrderTicketFormValues {
  return {
    direction: "long",
    orderType: "market",
    quantity: "100",
    limitPrice: "",
    stopPrice: "",
    plannedStopPrice: "",
    plannedTargetPrice: "",
    ...overrides,
  };
}

function expectFieldError(
  result: ReturnType<typeof orderTicketSchema.safeParse>,
  path: string,
  message: string,
) {
  expect(result.success).toBe(false);
  if (result.success) throw new Error("expected validation to fail");
  const issue = result.error.issues.find((i) => i.path.join(".") === path);
  expect(issue?.message).toBe(message);
}

describe("orderTicketSchema -- quantity", () => {
  it("accepts a fractional quantity (0.5, e.g. a partial BTC-USD position)", () => {
    const result = orderTicketSchema.safeParse(baseValues({ quantity: "0.5" }));
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.data.quantity).toBe(0.5);
  });

  it("rejects a blank quantity", () => {
    const result = orderTicketSchema.safeParse(baseValues({ quantity: "" }));
    expectFieldError(result, "quantity", "Enter a quantity greater than 0");
  });

  it("rejects a non-numeric quantity", () => {
    const result = orderTicketSchema.safeParse(baseValues({ quantity: "abc" }));
    expectFieldError(result, "quantity", "Enter a quantity greater than 0");
  });

  it("rejects a zero quantity", () => {
    const result = orderTicketSchema.safeParse(baseValues({ quantity: "0" }));
    expectFieldError(result, "quantity", "Enter a quantity greater than 0");
  });

  it("rejects a negative quantity", () => {
    const result = orderTicketSchema.safeParse(baseValues({ quantity: "-5" }));
    expectFieldError(result, "quantity", "Enter a quantity greater than 0");
  });
});

describe("orderTicketSchema -- conditional required prices", () => {
  it("requires a limit price for a limit order", () => {
    const result = orderTicketSchema.safeParse(
      baseValues({ orderType: "limit", limitPrice: "" }),
    );
    expectFieldError(result, "limitPrice", "Limit price is required for a limit order.");
  });

  it("requires a stop price for a stop order", () => {
    const result = orderTicketSchema.safeParse(
      baseValues({ orderType: "stop", stopPrice: "" }),
    );
    expectFieldError(result, "stopPrice", "Stop price is required for a stop order.");
  });

  it("rejects a non-numeric limit price", () => {
    const result = orderTicketSchema.safeParse(
      baseValues({ orderType: "limit", limitPrice: "abc" }),
    );
    expectFieldError(result, "limitPrice", "Enter a limit price greater than 0");
  });

  it("rejects a zero limit price", () => {
    const result = orderTicketSchema.safeParse(
      baseValues({ orderType: "limit", limitPrice: "0" }),
    );
    expectFieldError(result, "limitPrice", "Enter a limit price greater than 0");
  });

  it("a market order needs neither -- both left blank is valid", () => {
    const result = orderTicketSchema.safeParse(baseValues());
    expect(result.success).toBe(true);
  });
});

describe("orderTicketSchema -- planned stop/target vs. a known reference price (limit/stop order)", () => {
  it("long limit order: stop below, target above the limit price -- both valid", () => {
    const result = orderTicketSchema.safeParse(
      baseValues({
        direction: "long",
        orderType: "limit",
        limitPrice: "150",
        plannedStopPrice: "148",
        plannedTargetPrice: "155",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("long limit order: stop ABOVE the limit price is rejected", () => {
    const result = orderTicketSchema.safeParse(
      baseValues({
        direction: "long",
        orderType: "limit",
        limitPrice: "150",
        plannedStopPrice: "151",
      }),
    );
    expectFieldError(
      result,
      "plannedStopPrice",
      "Stop-loss must be below your limit price for a long position.",
    );
  });

  it("long limit order: target BELOW the limit price is rejected", () => {
    const result = orderTicketSchema.safeParse(
      baseValues({
        direction: "long",
        orderType: "limit",
        limitPrice: "150",
        plannedTargetPrice: "149",
      }),
    );
    expectFieldError(
      result,
      "plannedTargetPrice",
      "Target must be above your limit price for a long position.",
    );
  });

  it("short stop order: stop above, target below the stop-trigger price -- both valid", () => {
    const result = orderTicketSchema.safeParse(
      baseValues({
        direction: "short",
        orderType: "stop",
        stopPrice: "150",
        plannedStopPrice: "153",
        plannedTargetPrice: "145",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("short stop order: stop BELOW the stop-trigger price is rejected", () => {
    const result = orderTicketSchema.safeParse(
      baseValues({
        direction: "short",
        orderType: "stop",
        stopPrice: "150",
        plannedStopPrice: "149",
      }),
    );
    expectFieldError(
      result,
      "plannedStopPrice",
      "Stop-loss must be above your stop price for a short position.",
    );
  });

  it("short stop order: target ABOVE the stop-trigger price is rejected", () => {
    const result = orderTicketSchema.safeParse(
      baseValues({
        direction: "short",
        orderType: "stop",
        stopPrice: "150",
        plannedTargetPrice: "151",
      }),
    );
    expectFieldError(
      result,
      "plannedTargetPrice",
      "Target must be below your stop price for a short position.",
    );
  });
});

describe("orderTicketSchema -- planned stop/target on a market order (no known entry price yet)", () => {
  it("long: stop below target -- valid, checked only relative to each other", () => {
    const result = orderTicketSchema.safeParse(
      baseValues({
        direction: "long",
        orderType: "market",
        plannedStopPrice: "148",
        plannedTargetPrice: "155",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("long: stop above target is backwards and rejected", () => {
    const result = orderTicketSchema.safeParse(
      baseValues({
        direction: "long",
        orderType: "market",
        plannedStopPrice: "155",
        plannedTargetPrice: "148",
      }),
    );
    expectFieldError(
      result,
      "plannedTargetPrice",
      "Target must be above your stop-loss for a long position.",
    );
  });

  it("short: stop above target -- valid, checked only relative to each other", () => {
    const result = orderTicketSchema.safeParse(
      baseValues({
        direction: "short",
        orderType: "market",
        plannedStopPrice: "155",
        plannedTargetPrice: "148",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("short: stop below target is backwards and rejected", () => {
    const result = orderTicketSchema.safeParse(
      baseValues({
        direction: "short",
        orderType: "market",
        plannedStopPrice: "148",
        plannedTargetPrice: "155",
      }),
    );
    expectFieldError(
      result,
      "plannedTargetPrice",
      "Target must be below your stop-loss for a short position.",
    );
  });

  it("only a stop given (no target) -- nothing to compare against, valid", () => {
    const result = orderTicketSchema.safeParse(
      baseValues({ orderType: "market", plannedStopPrice: "148", plannedTargetPrice: "" }),
    );
    expect(result.success).toBe(true);
  });

  it("only a target given (no stop) -- nothing to compare against, valid", () => {
    const result = orderTicketSchema.safeParse(
      baseValues({ orderType: "market", plannedStopPrice: "", plannedTargetPrice: "155" }),
    );
    expect(result.success).toBe(true);
  });
});

describe("toOrderTicketSubmission", () => {
  it("market order, long, 100 sh, no optional prices -> only quantity is converted", () => {
    const values: ValidatedOrderTicketValues = {
      direction: "long",
      orderType: "market",
      quantity: 100,
      limitPrice: undefined,
      stopPrice: undefined,
      plannedStopPrice: undefined,
      plannedTargetPrice: undefined,
    };

    const result = toOrderTicketSubmission(values);

    // 100 sh x 100,000,000 QuantityUnits/share = 10,000,000,000
    expect(result).toEqual({
      direction: "long",
      orderType: "market",
      quantity: 10_000_000_000,
    });
  });

  it("limit order, short, 25.5 sh @ $150.25, planned stop $155.00, planned target $140.00 -> every price converted", () => {
    const values: ValidatedOrderTicketValues = {
      direction: "short",
      orderType: "limit",
      quantity: 25.5,
      limitPrice: 150.25,
      stopPrice: undefined,
      plannedStopPrice: 155,
      plannedTargetPrice: 140,
    };

    const result = toOrderTicketSubmission(values);

    // quantity: 25.5 x 100,000,000 = 2,550,000,000
    // limitPrice: $150.25 x 10,000 PriceUnits/$ = 1,502,500
    // plannedStopPrice: $155.00 x 10,000 = 1,550,000
    // plannedTargetPrice: $140.00 x 10,000 = 1,400,000
    expect(result).toEqual({
      direction: "short",
      orderType: "limit",
      quantity: 2_550_000_000,
      limitPrice: 1_502_500,
      plannedStopPrice: 1_550_000,
      plannedTargetPrice: 1_400_000,
    });
    // Round-trip back to decimal confirms no precision was lost converting up.
    expect(fromQuantityUnits(result.quantity)).toBe(25.5);
    expect(fromPriceUnits(result.limitPrice!)).toBe(150.25);
  });

  it("stop order, long, only the entry-trigger stopPrice set -- limitPrice/planned levels stay absent, not undefined-valued", () => {
    const values: ValidatedOrderTicketValues = {
      direction: "long",
      orderType: "stop",
      quantity: 10,
      limitPrice: undefined,
      stopPrice: 100,
      plannedStopPrice: undefined,
      plannedTargetPrice: undefined,
    };

    const result = toOrderTicketSubmission(values);

    expect(result).toEqual({
      direction: "long",
      orderType: "stop",
      quantity: 1_000_000_000,
      stopPrice: 1_000_000,
    });
    expect("limitPrice" in result).toBe(false);
    expect("plannedStopPrice" in result).toBe(false);
  });
});
