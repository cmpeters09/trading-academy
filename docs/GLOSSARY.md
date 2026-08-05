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

**Long / short** — Long: buy first, sell later, profit if the price rises. Short: sell borrowed shares first, buy back later, profit if the price falls. Shorting risk is uncapped, since price can rise indefinitely.

**Fill** — the price at which an order actually executes, which is not necessarily the price you wanted.

**Slippage** — the gap between the price you expected and the price you actually got, usually from fast-moving markets or thin volume.

**Spread** — the gap between the bid (highest price a buyer will pay) and the ask (lowest price a seller will accept). Crossing the spread is a built-in cost of trading immediately.

**Commission** — ⬜

---

## Risk — the concepts the product exists to teach

**Position sizing** — how many shares/contracts to trade, calculated from how much you're willing to lose (risk %) divided by the distance to your stop loss — not from how much you want to make. The schema caps default risk at 5% for this reason.

**Stop loss** — a predefined price level where you exit a losing trade automatically, set before entering the trade and not moved emotionally once in it.

**R / R-multiple** — trade result expressed as a multiple of what you risked. Risk $100, lose it = −1R. Risk $100, make $300 = +3R. Lets you compare trades of different sizes fairly.
*Why it's in the database (`trades.r_multiple`):* it makes trades comparable across account sizes and instruments, and it makes "did you follow your plan?" measurable. This is the number the product cares about, not dollars.

**Risk-to-reward (RR)** — ratio of what you're risking to what you're targeting. 1:3 RR means risking $100 to target $300. A good RR means you don't need to win most trades to be profitable.

**Drawdown** — how much your account has fallen from its peak value. A 50% loss requires a 100% gain to recover — an asymmetry that makes big losses disproportionately damaging.

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
