# PROGRESS.md

# Trading Academy — Progress Tracker

Last updated: 2026-09-21 (M-9 complete)

---

## Headline numbers

**MLP: 76%**
**Full Vision: 44%**

- **MLP** — the minimum lovable product: accounts → data → chart → simulator → journal → stats. The smallest slice of the app that's actually usable end to end, skipping lessons, gamification, and the AI coach.
- **Full Vision** — all 20 milestones (M-1 through M-20), the whole roadmap in `docs/planning/FEATURE_ROADMAP.md`.

Both are **weighted by rough effort in ~1–2hr sessions, not by milestone count.** A milestone table where each row counted equally would be misleading — M-8 (the simulator fill engine) alone outweighs M-1 through M-3 combined. The weight column below is that effort estimate; the percentages are `(weight of done work) / (weight of total work)`, not `(milestones done) / (20)`.

---

## Milestone weights

| Milestone | Scope | Weight (sessions) | In MLP? | Status |
|---|---|---|---|---|
| M-1 | Foundation & scaffold | 4 | ✅ | Done |
| M-2 | Accounts / auth | 5 | ✅ | Done |
| M-3 (data) | Data plumbing — schema, yfinance import, DB types | 4 | ✅ | Done |
| M-3 (chart) | Shared `<PriceChart>` component + `/chart` route | 3 | ✅ | Done |
| M-4/5 | Dashboard v1 + XP ledger | 5 | — | Not started |
| M-6/7 | Lesson engine + knowledge checks | 7 | — | Not started |
| M-8 | Simulator fill engine | 8 | ✅ | Done |
| M-9 | Simulator UI — buy/sell, long/short, position sizing, stop/take profit, partial exits | 4 | ✅ | Done |
| M-10 | Replay engine — cursor/playback/store, `<PriceChart>` wiring, controls, `/replay` route | 3 | ✅ | Done |
| M-11 | Trade persistence — Edge Function re-validation, orders/executions/trades materialization | 3 | ✅ | Not started |
| M-12/13 | Journal + stats/analytics | 7 | ✅ | Not started |
| M-14→20 | Coach, gamification, and the remaining milestones | 18 | — | Not started |
| **Total** | | **71** | | |

`In MLP` marks the rows that count toward the MLP percentage (accounts, data, chart, simulator, journal, stats). Dashboard/XP, lessons, and M-14→20 are Full Vision scope only.

The former "M-9/10/11" row (weight 10) is split into its three milestones now that M-10 is done ahead of M-9/M-11 — same pattern as the M-3 (data)/M-3 (chart) split. The combined weight is unchanged (4 + 3 + 3 = 10); M-10's 3 reflects the three actual sessions it took (cursor engine, playback hook + store, chart wiring), the remaining 7 was split 4/3 between M-9 and M-11 by rough relative scope, not measured effort — revisit if either turns out very different.

M-9's row scope says "partial exits" — that was descoped during the four sessions actually run (position/order state, order ticket, engine wiring, sizing + PnL/R + manual close). `partiallyClosePosition` (Session 1) exists and is tested, but nothing in the UI calls it; only a full manual close was built (`features/simulator/README.md`'s Extension guide notes this). Marked `Done` anyway because the 4-session weight was spent and delivered a complete, usable increment (place → size → fill → unrealized PnL/R → close) — not because the original scope line was fully built as written.

---

## How the headline numbers are computed

- **MLP %** = (weight of `Done` rows where `In MLP` = ✅) / (weight of all rows where `In MLP` = ✅)
  Currently: `31 / 41 ≈ 76%`
- **Full Vision %** = (weight of all `Done` rows) / (weight of all rows)
  Currently: `31 / 71 ≈ 44%`

---

## How to update

When a milestone (or a named chunk, like "M-3 (chart)") is finished:

1. Change its `Status` to `Done` (or `In progress` if it's partially through).
2. Recompute both percentages using the formulas above.
3. Update the two headline numbers at the top of this file to match.

If a milestone's real effort turns out very different from its weight, adjust the weight and note why in this file's git history — don't silently leave a stale estimate.
