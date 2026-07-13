# DATA_LICENSING.md

> **SUPERSEDED for the development phase by ADR-016.** Retained for the
> pre-commercial vendor evaluation, which is still required — the vendor
> shortlist below is the plan for ADR-017.

# M-0 Deliverable — Market Data Licensing Decision

**Status:** ⬜ OPEN — this is the only external blocker in the project (RISKS R-1).
**Blocks:** M-3 (Data Foundation) → and therefore the entire simulator chain.

## Why this exists

ADR-006 commits to curated historical OHLCV data. It does **not** say where that data
comes from. Most "free" sources (Yahoo scrapes, unofficial APIs) forbid redistribution.
Shipping their data inside a product is a **legal** problem, not a technical one —
and it is not fixable later by writing better code.

## The question to answer

> Can we store this vendor's OHLCV data in our own Postgres and serve it to our users
> inside a paid educational product?

Not "can we download it." Not "is there an API." **Can we redistribute it in a product.**

## Evaluate in this order

| # | Vendor | What to check | Verdict | Notes |
|---|---|---|---|---|
| 1 | **Stooq** | Free EOD; terms permit redistribution? | ⬜ | Cheapest path if it holds |
| 2 | **EODHD** | Paid tier; read the redistribution clause in full | ⬜ | Currently the leading candidate |
| 3 | **Tiingo / Polygon** | Paid tiers; redistribution terms | ⬜ | |
| 4 | **Binance public data** | Crypto only — unrestricted | ⬜ | **Fallback: could seed the first replay segments while equity licensing is settled** |

## Definition of done for M-0

- [ ] One vendor chosen, in writing, with the specific clause that permits our use quoted and linked
- [ ] Cost per month recorded
- [ ] Coverage confirmed: ~20 instruments daily + 3 curated intraday segments (M-3's seed target)
- [ ] Fallback plan named if the vendor's terms change
- [ ] Written up as **ADR-017: Market Data Vendor**, superseding ADR-006's open question

## Do not

- Do not start M-3 before this is closed.
- Do not "start with Yahoo and swap it later." The data model is the same; the legal exposure is not, and "temporary" data sources have a way of shipping.
