import { describe, expect, it } from "vitest";

import { computeSizedQuantity } from "./sized-quantity";

const COMPLETE_VALUES = {
  accountBalance: "100000",
  riskPct: "1",
  plannedEntryPrice: "150",
  plannedStopPrice: "148",
};

describe("computeSizedQuantity -- incomplete inputs", () => {
  it("all four fields blank -> incomplete", () => {
    const outcome = computeSizedQuantity({
      accountBalance: "",
      riskPct: "",
      plannedEntryPrice: "",
      plannedStopPrice: "",
    });

    expect(outcome).toEqual({ status: "incomplete" });
  });

  it("only accountBalance/riskPct given, no planned entry/stop -> incomplete", () => {
    const outcome = computeSizedQuantity({
      ...COMPLETE_VALUES,
      plannedEntryPrice: "",
      plannedStopPrice: "",
    });

    expect(outcome).toEqual({ status: "incomplete" });
  });

  it("a non-numeric field (garbage, not just blank) is also treated as incomplete, not a crash", () => {
    const outcome = computeSizedQuantity({ ...COMPLETE_VALUES, riskPct: "abc" });

    expect(outcome).toEqual({ status: "incomplete" });
  });
});

describe("computeSizedQuantity -- engine rejection", () => {
  it("entry price equal to stop price -> rejected, engine's own message surfaced verbatim", () => {
    const outcome = computeSizedQuantity({
      ...COMPLETE_VALUES,
      plannedEntryPrice: "100",
      plannedStopPrice: "100",
    });

    expect(outcome).toEqual({
      status: "rejected",
      note: "Entry price and stop price must differ -- there is no risk to size against.",
    });
  });
});

describe("computeSizedQuantity -- successful sizing", () => {
  it("$100,000 balance, 1% risk, $150/$148 -> 500 sh, not clamped", () => {
    // riskAmount = $100,000 x 1% = $1,000.00; distance $2.00 -> 500 sh
    const outcome = computeSizedQuantity(COMPLETE_VALUES);

    expect(outcome).toEqual({
      status: "sized",
      quantity: "500",
      note: "Sized to 500 sh, risking $1000.00 (1% of $100000.00).",
    });
  });

  it("requested risk % above the 5% cap -> sized at the clamped %, note says so", () => {
    // appliedRiskPct clamps 10% -> 5%. riskAmount = $100,000 x 5% = $5,000.00
    // distance $1.00 -> 5,000 sh
    const outcome = computeSizedQuantity({
      accountBalance: "100000",
      riskPct: "10",
      plannedEntryPrice: "50",
      plannedStopPrice: "49",
    });

    expect(outcome).toEqual({
      status: "sized",
      quantity: "5000",
      note: "Risk capped at 5% (you entered 10%) -- sized to 5000 sh, risking $5000.00.",
    });
  });
});
