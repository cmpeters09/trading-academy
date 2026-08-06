# PROGRESS.md

# Trading Academy — Progress Tracker

Last updated: 2026-08-06

---

## Headline numbers

**MLP: 39%**
**Full Vision: 23%**

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
| M-8 | Simulator fill engine | 8 | ✅ | Not started |
| M-9/10/11 | Simulator UI + replay engine + trade persistence | 10 | ✅ | Not started |
| M-12/13 | Journal + stats/analytics | 7 | ✅ | Not started |
| M-14→20 | Coach, gamification, and the remaining milestones | 18 | — | Not started |
| **Total** | | **71** | | |

`In MLP` marks the rows that count toward the MLP percentage (accounts, data, chart, simulator, journal, stats). Dashboard/XP, lessons, and M-14→20 are Full Vision scope only.

---

## How the headline numbers are computed

- **MLP %** = (weight of `Done` rows where `In MLP` = ✅) / (weight of all rows where `In MLP` = ✅)
  Currently: `16 / 41 ≈ 39%`
- **Full Vision %** = (weight of all `Done` rows) / (weight of all rows)
  Currently: `16 / 71 ≈ 23%`

---

## How to update

When a milestone (or a named chunk, like "M-3 (chart)") is finished:

1. Change its `Status` to `Done` (or `In progress` if it's partially through).
2. Recompute both percentages using the formulas above.
3. Update the two headline numbers at the top of this file to match.

If a milestone's real effort turns out very different from its weight, adjust the weight and note why in this file's git history — don't silently leave a stale estimate.
