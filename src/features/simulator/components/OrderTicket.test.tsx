// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/lib/logger";

import { OrderTicket } from "./OrderTicket";
import type { OrderTicketSubmission } from "../lib/order-ticket-schema";

/**
 * TD-09 / ADR-010 §4 -- component tests for the order ticket's React
 * wiring. The validation rules themselves are covered at 100% branches in
 * `lib/order-ticket-schema.test.ts` and the sizing math in
 * `lib/sized-quantity.test.ts`; these tests cover what those can't: that
 * the right fields appear, errors land on the right input, the sizing
 * helper writes into the quantity field, and a submit hands the caller the
 * right engine-unit order.
 *
 * Engine units (ADR-014): prices x PRICE_SCALE (10,000), quantities x
 * QUANTITY_SCALE (100,000,000).
 */

// No `globals: true` in vitest.config.ts, so RTL can't register its own
// auto-cleanup -- unmount between tests explicitly.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderTicket() {
  const onSubmit = vi.fn<(order: OrderTicketSubmission) => void>();
  const user = userEvent.setup();
  render(<OrderTicket onSubmit={onSubmit} />);
  return { user, onSubmit };
}

const limitPriceField = () => screen.queryByLabelText(/^limit price/i);
const stopPriceField = () => screen.queryByLabelText(/^stop price/i);
const submitButton = () => screen.getByRole("button", { name: "Place simulated order" });

describe("OrderTicket -- conditional price fields", () => {
  it("shows neither a limit nor a stop price for a market order", () => {
    renderTicket();

    expect(screen.getByLabelText("Order type")).toHaveValue("market");
    expect(limitPriceField()).not.toBeInTheDocument();
    expect(stopPriceField()).not.toBeInTheDocument();
  });

  it("shows only the limit price for a limit order, and only the stop price for a stop order", async () => {
    const { user } = renderTicket();
    const orderType = screen.getByLabelText("Order type");

    await user.selectOptions(orderType, "limit");
    expect(limitPriceField()).toBeInTheDocument();
    expect(stopPriceField()).not.toBeInTheDocument();

    await user.selectOptions(orderType, "stop");
    expect(stopPriceField()).toBeInTheDocument();
    expect(limitPriceField()).not.toBeInTheDocument();

    await user.selectOptions(orderType, "market");
    expect(limitPriceField()).not.toBeInTheDocument();
    expect(stopPriceField()).not.toBeInTheDocument();
  });

  it("clears a typed limit price when switching away, so it can't leak into a market order", async () => {
    const { user, onSubmit } = renderTicket();
    const orderType = screen.getByLabelText("Order type");

    await user.selectOptions(orderType, "limit");
    await user.type(screen.getByLabelText(/^limit price/i), "150");
    await user.selectOptions(orderType, "market");
    await user.type(screen.getByLabelText("Quantity (shares)"), "10");
    await user.click(submitButton());

    // 10 sh x 100,000,000 = 1,000,000,000 quantity units; no limitPrice key.
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0]?.[0]).toStrictEqual({
      direction: "long",
      orderType: "market",
      quantity: 1_000_000_000,
    });

    await user.selectOptions(orderType, "limit");
    expect(screen.getByLabelText(/^limit price/i)).toHaveValue("");
  });
});

describe("OrderTicket -- inline validation errors", () => {
  it("rejects a long limit order whose stop-loss is above the limit price, on the stop-loss field", async () => {
    const { user, onSubmit } = renderTicket();

    await user.selectOptions(screen.getByLabelText("Order type"), "limit");
    await user.type(screen.getByLabelText("Quantity (shares)"), "100");
    await user.type(screen.getByLabelText(/^limit price/i), "100");
    await user.type(screen.getByLabelText("Planned stop-loss ($, optional)"), "105");
    await user.click(submitButton());

    const stopLoss = screen.getByLabelText("Planned stop-loss ($, optional)");
    const error = await screen.findByText(
      "Stop-loss must be below your limit price for a long position.",
    );
    expect(error).toHaveAttribute("id", "plannedStopPrice-error");
    expect(error).toHaveAttribute("role", "alert");
    expect(stopLoss).toHaveAttribute("aria-invalid", "true");
    expect(stopLoss).toHaveAttribute("aria-describedby", "plannedStopPrice-error");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a long market order whose target is below its stop-loss, on the target field", async () => {
    const { user, onSubmit } = renderTicket();

    await user.type(screen.getByLabelText("Quantity (shares)"), "100");
    await user.type(screen.getByLabelText("Planned stop-loss ($, optional)"), "105");
    await user.type(screen.getByLabelText("Planned target ($, optional)"), "100");
    await user.click(submitButton());

    const error = await screen.findByText(
      "Target must be above your stop-loss for a long position.",
    );
    expect(screen.getByLabelText("Planned target ($, optional)")).toHaveAttribute(
      "aria-describedby",
      error.id,
    );
    // The stop-loss itself is fine for a market order (no entry price yet).
    expect(screen.getByLabelText("Planned stop-loss ($, optional)")).not.toHaveAttribute(
      "aria-invalid",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("requires a quantity", async () => {
    const { user, onSubmit } = renderTicket();

    await user.click(submitButton());

    expect(await screen.findByText("Enter a quantity greater than 0")).toBeInTheDocument();
    expect(screen.getByLabelText("Quantity (shares)")).toHaveAttribute("aria-invalid", "true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("requires a limit price for a limit order", async () => {
    const { user, onSubmit } = renderTicket();

    // Quantity filled on purpose: the schema's cross-field rules
    // (superRefine) only run once every per-field check passes, so a blank
    // quantity would hide this error until the next submit.
    await user.selectOptions(screen.getByLabelText("Order type"), "limit");
    await user.type(screen.getByLabelText("Quantity (shares)"), "100");
    await user.click(submitButton());

    expect(
      await screen.findByText("Limit price is required for a limit order."),
    ).toHaveAttribute("id", "limitPrice-error");
    expect(screen.getByLabelText(/^limit price/i)).toHaveAttribute("aria-invalid", "true");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("OrderTicket -- size by risk", () => {
  it("fills quantity from account balance, risk %, entry, and stop", async () => {
    const { user } = renderTicket();

    // Account balance is pre-filled at $100,000.
    // Risk 1% of $100,000 = $1,000. Entry $50 - stop $49 = $1/sh at risk.
    // $1,000 / $1 = 1,000 sh.
    await user.type(screen.getByLabelText("Planned stop-loss ($, optional)"), "49");
    await user.type(screen.getByLabelText("Risk %"), "1");
    await user.type(screen.getByLabelText("Planned entry price ($)"), "50");

    expect(screen.getByLabelText("Quantity (shares)")).toHaveValue("1000");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Sized to 1000 sh, risking $1000.00 (1% of $100000.00).",
    );
  });

  it("caps risk at 5% and says so", async () => {
    const { user } = renderTicket();

    // Entered 10%, capped to MAX_RISK_PCT = 5%: 5% of $100,000 = $5,000.
    // $5,000 / ($50 - $49 = $1/sh) = 5,000 sh.
    await user.type(screen.getByLabelText("Planned stop-loss ($, optional)"), "49");
    await user.type(screen.getByLabelText("Risk %"), "10");
    await user.type(screen.getByLabelText("Planned entry price ($)"), "50");

    expect(screen.getByLabelText("Quantity (shares)")).toHaveValue("5000");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Risk capped at 5% (you entered 10%) -- sized to 5000 sh, risking $5000.00.",
    );
  });

  it("shows the engine's rejection and leaves quantity alone when entry equals stop", async () => {
    const { user } = renderTicket();

    // Risk % is typed LAST so the first moment all four sizing inputs are
    // filled is already entry == stop. Typed in another order, a partial
    // keystroke (entry "5" vs stop "50") is a valid setup and sizes the
    // quantity before the final keystroke is rejected.
    await user.type(screen.getByLabelText("Quantity (shares)"), "7");
    await user.type(screen.getByLabelText("Planned entry price ($)"), "50");
    await user.type(screen.getByLabelText("Planned stop-loss ($, optional)"), "50");
    await user.type(screen.getByLabelText("Risk %"), "1");

    expect(screen.getByLabelText("Quantity (shares)")).toHaveValue("7");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Entry price and stop price must differ -- there is no risk to size against.",
    );
  });
});

describe("OrderTicket -- successful submit", () => {
  it("hands the caller a validated long limit order in engine units", async () => {
    const { user, onSubmit } = renderTicket();

    await user.selectOptions(screen.getByLabelText("Order type"), "limit");
    await user.type(screen.getByLabelText("Quantity (shares)"), "100");
    await user.type(screen.getByLabelText(/^limit price/i), "150.25");
    await user.type(screen.getByLabelText("Planned stop-loss ($, optional)"), "148");
    await user.type(screen.getByLabelText("Planned target ($, optional)"), "155");
    await user.click(submitButton());

    // quantity 100 x 100,000,000 = 10,000,000,000
    // limit 150.25 x 10,000 = 1,502,500; stop 148 x 10,000 = 1,480,000;
    // target 155 x 10,000 = 1,550,000. Sizing inputs are never submitted.
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0]?.[0]).toStrictEqual({
      direction: "long",
      orderType: "limit",
      quantity: 10_000_000_000,
      limitPrice: 1_502_500,
      plannedStopPrice: 1_480_000,
      plannedTargetPrice: 1_550_000,
    });
  });

  it("hands the caller a validated short stop order in engine units", async () => {
    const { user, onSubmit } = renderTicket();

    await user.click(screen.getByRole("radio", { name: "Sell (Short)" }));
    await user.selectOptions(screen.getByLabelText("Order type"), "stop");
    await user.type(screen.getByLabelText("Quantity (shares)"), "25");
    await user.type(screen.getByLabelText(/^stop price/i), "80");
    await user.type(screen.getByLabelText("Planned stop-loss ($, optional)"), "84");
    await user.type(screen.getByLabelText("Planned target ($, optional)"), "72.5");
    await user.click(submitButton());

    // Short: stop-loss 84 is ABOVE the 80 trigger, target 72.50 BELOW it.
    // quantity 25 x 100,000,000 = 2,500,000,000; stop 80 x 10,000 =
    // 800,000; stop-loss 84 x 10,000 = 840,000; target 72.5 x 10,000 = 725,000.
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0]?.[0]).toStrictEqual({
      direction: "short",
      orderType: "stop",
      quantity: 2_500_000_000,
      stopPrice: 800_000,
      plannedStopPrice: 840_000,
      plannedTargetPrice: 725_000,
    });
  });

  it("without an onSubmit, shows and logs the captured order itself", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<OrderTicket />);

    await user.type(screen.getByLabelText("Quantity (shares)"), "10");
    await user.click(submitButton());

    const summary = await screen.findByRole("status");
    expect(summary).toHaveTextContent("Order captured");
    expect(summary).toHaveTextContent("10 sh");
    expect(info).toHaveBeenCalledWith("order_ticket_captured", {
      direction: "long",
      orderType: "market",
      quantity: 1_000_000_000,
    });
  });
});
