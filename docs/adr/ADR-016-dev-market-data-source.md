# ADR-016: Development Market Data Source — yfinance

**Status:** Accepted · **Date:** 2026-07-13

## Context
ADR-006 committed to curated historical OHLCV data but deliberately left the vendor open, pending a licensing review (RISKS R-1 / DATA_LICENSING.md, M-0). EODHD was the leading paid candidate ($20–80/mo). This is currently a solo, non-commercial, educational summer project with a hard requirement to stay at **zero cost**. Paying for a licensed data vendor before a single feature exists is premature spend against a product that has no users and no revenue.

## Decision
Use **yfinance** (the unofficial Python wrapper around Yahoo Finance) as the market data source for development, in place of EODHD, for as long as the project remains personal and non-commercial.

- No API key, no account, no cost.
- Historical daily OHLCV pulled via script and loaded into the `instruments` / `candles` tables exactly as ADR-006 and DATABASE_SCHEMA.md already specify — this changes the *source*, not the data model, the import-script pattern, or the schema.
- Import scripts live in `supabase/scripts/` per PROJECT_MAP.md, versioned like any other import script.

## Rationale
**Advantages:**
- Free — matches the zero-cost constraint.
- No API key or signup friction — removes a setup step blocking M-3.
- Straightforward historical pull for the ~20 instruments + curated segments M-3 needs.
- Good enough for development, simulator/replay testing, and lesson content — none of which require redistribution guarantees at this stage.

**Disadvantages:**
- Not an officially licensed or supported API — Yahoo can change its internal endpoints without notice, and yfinance (an unofficial wrapper) can break until patched upstream.
- No redistribution license — acceptable for a private, non-commercial dev project; **not** acceptable once the product has external/paying users.
- No SLA or support channel.

## Consequences
- RISKS R-1 status changes from "blocks M-3" to "resolved for development scope, reopened before commercial launch." M-0 (DATA_LICENSING.md) is satisfied for the current phase; its checklist is **not** considered permanently closed.
- FEATURE_ROADMAP.md M-3 no longer waits on a licensing decision — it waits only on writing the yfinance import script.
- ARCHITECTURE.md and DATABASE_SCHEMA.md require no structural changes: `instruments`/`candles`/`dataset_segments` and the import-script pattern were already vendor-agnostic.
- **Before any commercial deployment, paid users, or public launch:** this ADR must be superseded by a new ADR evaluating properly licensed providers (EODHD, Tiingo, Polygon, etc.), per ADR-006's original vendor shortlist. This is tracked as the trigger condition below.

## Trigger to revisit
Any of: (a) the app becomes publicly accessible to users other than Christian, (b) any monetization is introduced, (c) yfinance breaks in a way that costs more than ~1 hour to fix, (d) data coverage/quality becomes insufficient for a planned lesson or dataset segment. Whichever comes first — write **ADR-017: Commercial Market Data Vendor**, superseding this ADR.
