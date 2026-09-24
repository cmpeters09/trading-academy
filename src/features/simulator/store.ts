import { create } from "zustand";

import type { EngineBar, EngineError, PriceUnits } from "@/lib/engine/types";

import { DEFAULT_ENGINE_CONFIG } from "./lib/engine-config";
import type { OrderTicketSubmission } from "./lib/order-ticket-schema";
import { processBar, type ClosedTrade } from "./lib/process-bar";
import type { OpenPosition, TradeContext } from "./lib/types";

type SimulatorStoreState = {
  pendingOrder: OrderTicketSubmission | null;
  position: OpenPosition | null;
  lastClosedTrade: ClosedTrade | null;
  orderError: EngineError | null;
  /** The most recently revealed bar's close -- the mark price `PositionPanel` uses for unrealized PnL/R (Session 4). `null` until the first bar reveals. */
  lastPrice: PriceUnits | null;
  /** TD-10's manual close, queued for the next revealed bar (Session 4) -- see `process-bar.ts`'s `SimulatorBarState.closeRequested` doc comment. */
  closeRequested: boolean;
  /**
   * Which instrument/`sim_account` this session is trading (M-11 Session 2).
   * `null` only before `reset(context)` has ever run -- `ReplaySimulator`
   * syncs both during render, before any bar can be revealed (see its own
   * comment), so `onBarRevealed` treats a still-`null` context as an
   * impossible state (throws) rather than silently skipping a bar.
   */
  instrumentId: string | null;
  simAccountId: string | null;
};

type SimulatorStoreActions = {
  /** Only takes effect while flat (no pending order, no open position) -- the UI hides the order ticket otherwise, so this is a defensive no-op, not a user-facing path. */
  submitOrder: (order: OrderTicketSubmission) => void;
  /** TD-10 (Session 4) -- only takes effect with an open position and no request already queued; `PositionPanel` hides the button otherwise. */
  requestClose: () => void;
  /** Wired directly as `<ReplayChart onBarRevealed>` (Session 3, ADR-007) -- runs one revealed bar through the pure `processBar`. */
  onBarRevealed: (bar: EngineBar) => void;
  /** Resets to flat AND (re)stamps which instrument/account this session trades (M-11 Session 2) -- called by `ReplaySimulator` whenever either changes, including on first mount. */
  reset: (context: TradeContext) => void;
};

export type SimulatorStore = SimulatorStoreState & SimulatorStoreActions;

const INITIAL_STATE: SimulatorStoreState = {
  pendingOrder: null,
  position: null,
  lastClosedTrade: null,
  orderError: null,
  lastPrice: null,
  closeRequested: false,
  instrumentId: null,
  simAccountId: null,
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
 *
 * `instrumentId`/`simAccountId` (M-11 Session 2) are the one exception to
 * "nothing here is persisted yet" -- they're not trade data themselves,
 * just which instrument/account this session's future persisted trades
 * (Session 4/5) will be stamped with. Still ordinary ephemeral client
 * state (ADR-005): `ReplaySimulator` sets them from props it already got
 * from a Server Component fetch, this store doesn't fetch anything itself.
 */
export const useSimulatorStore = create<SimulatorStore>((set, get) => ({
  ...INITIAL_STATE,

  submitOrder: (order) => {
    const { pendingOrder, position } = get();
    if (pendingOrder !== null || position !== null) return;
    set({ pendingOrder: order, orderError: null, lastClosedTrade: null });
  },

  requestClose: () => {
    const { position, closeRequested } = get();
    if (position === null || closeRequested) return;
    set({ closeRequested: true });
  },

  onBarRevealed: (bar) => {
    const {
      pendingOrder,
      position,
      closeRequested,
      instrumentId,
      simAccountId,
    } = get();
    if (instrumentId === null || simAccountId === null) {
      // Impossible in normal operation: ReplaySimulator calls reset(context)
      // during render, before children (and their bar-revealed callbacks)
      // can ever fire -- see that component's own comment. A programmer
      // error (§7 class 3), not a domain rejection, so it throws instead of
      // silently dropping the bar.
      throw new Error(
        "onBarRevealed called before the simulator's trade context was set",
      );
    }
    const result = processBar(
      { pendingOrder, position, closeRequested },
      bar,
      DEFAULT_ENGINE_CONFIG,
      { instrumentId, simAccountId },
    );
    set({
      pendingOrder: result.pendingOrder,
      position: result.position,
      closeRequested: result.closeRequested,
      lastPrice: bar.close,
      ...(result.closedTrade ? { lastClosedTrade: result.closedTrade } : {}),
      ...(result.error ? { orderError: result.error } : {}),
    });
  },

  reset: (context) => set({ ...INITIAL_STATE, ...context }),
}));
