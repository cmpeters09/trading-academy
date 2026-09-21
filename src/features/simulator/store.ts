import { create } from "zustand";

import type { EngineBar, EngineError, PriceUnits } from "@/lib/engine/types";

import { DEFAULT_ENGINE_CONFIG } from "./lib/engine-config";
import type { OrderTicketSubmission } from "./lib/order-ticket-schema";
import { processBar, type ClosedTrade } from "./lib/process-bar";
import type { OpenPosition } from "./lib/types";

type SimulatorStoreState = {
  pendingOrder: OrderTicketSubmission | null;
  position: OpenPosition | null;
  lastClosedTrade: ClosedTrade | null;
  orderError: EngineError | null;
  /** The most recently revealed bar's close -- the mark price `PositionPanel` uses for unrealized PnL/R (Session 4). `null` until the first bar reveals. */
  lastPrice: PriceUnits | null;
};

type SimulatorStoreActions = {
  /** Only takes effect while flat (no pending order, no open position) -- the UI hides the order ticket otherwise, so this is a defensive no-op, not a user-facing path. */
  submitOrder: (order: OrderTicketSubmission) => void;
  /** Wired directly as `<ReplayChart onBarRevealed>` (Session 3, ADR-007) -- runs one revealed bar through the pure `processBar`. */
  onBarRevealed: (bar: EngineBar) => void;
  reset: () => void;
};

export type SimulatorStore = SimulatorStoreState & SimulatorStoreActions;

const INITIAL_STATE: SimulatorStoreState = {
  pendingOrder: null,
  position: null,
  lastClosedTrade: null,
  orderError: null,
  lastPrice: null,
};

/**
 * ADR-005: Zustand owns ephemeral client state only. A pending/open
 * simulator position is exactly that -- nothing here is persisted yet
 * (Session 3 doesn't touch the DB; sim_accounts balance updates are a
 * later session). One store per feature, exported through simulator's
 * index.ts -- no global app store.
 *
 * All the actual domain logic (fills, brackets, position transitions)
 * lives in `lib/process-bar.ts` and Session 1's `lib/position.ts` -- this
 * store's job is only to hold state and delegate to those pure functions,
 * same split as `features/replay/store.ts`.
 */
export const useSimulatorStore = create<SimulatorStore>((set, get) => ({
  ...INITIAL_STATE,

  submitOrder: (order) => {
    const { pendingOrder, position } = get();
    if (pendingOrder !== null || position !== null) return;
    set({ pendingOrder: order, orderError: null, lastClosedTrade: null });
  },

  onBarRevealed: (bar) => {
    const { pendingOrder, position } = get();
    const result = processBar({ pendingOrder, position }, bar, DEFAULT_ENGINE_CONFIG);
    set({
      pendingOrder: result.pendingOrder,
      position: result.position,
      lastPrice: bar.close,
      ...(result.closedTrade ? { lastClosedTrade: result.closedTrade } : {}),
      ...(result.error ? { orderError: result.error } : {}),
    });
  },

  reset: () => set(INITIAL_STATE),
}));
