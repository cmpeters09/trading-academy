# GLOSSARY.md

# Trading Academy — Domain Glossary

Every term here appears in the architecture, the schema, or the code. If you cannot
explain one of these, you cannot review the code that implements it.

**This file has a second job:** it is the first draft of the Market Basics lesson track.
Terms defined here should be reusable, near-verbatim, in `src/content/lessons/`.

⬜ = still to be written. Fill these in as you learn — this is a working document, not a reference you were handed.

---

## Core mechanics

**OHLCV** — the five numbers that make up one candle: Open, High, Low, Close, Volume, over a fixed time period.

**Candle / bar** — one time period of price action. A "1d candle" summarizes a whole day into those five numbers. ⬜ *Note the information that is lost: a candle tells you the high and the low, but not which came first. This loss is the source of RISKS R-3.*

**Timeframe** — the period one candle covers (1m, 5m, 1h, 1d).

**Long / short** — ⬜

**Fill** — ⬜ the price at which an order actually executes, which is not necessarily the price you wanted.

**Slippage** — ⬜

**Spread** — ⬜

**Commission** — ⬜

---

## Risk — the concepts the product exists to teach

**Position sizing** — ⬜ *how much* to buy, derived from how much you're willing to lose. The schema caps default risk at 5% for this reason.

**Stop loss** — ⬜

**R / R-multiple** — ⬜ Result expressed in units of *initial risk*. Risk $100, make $200 → +2R. Lose the planned amount → −1R.
*Why it's in the database (`trades.r_multiple`):* it makes trades comparable across account sizes and instruments, and it makes "did you follow your plan?" measurable. This is the number the product cares about, not dollars.

**Risk-to-reward (RR)** — ⬜

**Drawdown** — ⬜

---

## Statistics (M-13 must compute each of these correctly, and each has a unit test)

**Win rate** — ⬜ *and why a high win rate can still lose money.*

**Profit factor** — ⬜

**Expectancy** — ⬜ the average R you expect per trade. **The single most important number in the product.**

**Sharpe ratio** — ⬜

---

## Project-specific terms

**Bar-path ambiguity** — when a candle's high and low both touch your stop *and* your target, the candle cannot tell you which happened first. Our engine resolves this **against the trader** and flags the trade (RISKS R-3, ADR-007). Silently guessing in the trader's favor is how backtests lie.

**Dataset segment** — a curated slice of history with a name ("SPY — March 2020 Crash"). Lessons point at segments so every user replays the *same* market.

**Engine version** — every fill records which version of the engine produced it, so a rule change never silently rewrites history.

**Process over outcome** — the constitutional principle that a winning trade can be a bad trade. Enforced in the schema: there is no XP reason for profit.
