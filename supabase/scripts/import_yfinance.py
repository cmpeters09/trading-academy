"""Import historical daily OHLCV from yfinance into instruments + candles.

ADR-006 (curated dataset library, schema) / ADR-016 (yfinance as the
dev-phase source, in place of a licensed vendor, while this project is
personal and non-commercial). This is a starter set only -- curating the
full "interesting events" dataset library and intraday segments is later
work, not this script.

Idempotent by design, safe to re-run:
  - instruments upsert on the (symbol, asset_class) unique constraint.
  - candles upsert on (instrument_id, timeframe, ts) -- the same composite
    natural PK the migration defines (DATABASE_SCHEMA.md §2) -- so
    re-running never duplicates a bar, and simply refreshes values if
    yfinance later revises them.

Writes go through the service role key, never the anon key (ADR-012:
instruments/candles/dataset_segments are default-deny reference tables,
readable by any authenticated user but writable only via service role).
Credentials are read from the environment -- never hardcoded, never read
from a .env file by this script or committed anywhere:

    SUPABASE_URL               Project URL
    SUPABASE_SERVICE_ROLE_KEY  service_role secret key
    (both from Dashboard -> Project Settings -> API)

Usage (PowerShell):
    $env:SUPABASE_URL = "https://xxxx.supabase.co"
    $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."
    pip install -r supabase/scripts/requirements.txt
    python supabase/scripts/import_yfinance.py
"""

from __future__ import annotations

import os
import sys

import yfinance as yf
from supabase import Client, create_client

# Small starter set (ADR-006's candidate list is ~50-100 instruments; this
# is deliberately just enough to exercise the pipeline end to end -- one
# stock, one mega-cap tech stock, one index ETF, one crypto pair).
STARTER_INSTRUMENTS = [
    {"symbol": "AAPL", "asset_class": "stock", "name": "Apple Inc.", "yf_ticker": "AAPL"},
    {"symbol": "MSFT", "asset_class": "stock", "name": "Microsoft Corporation", "yf_ticker": "MSFT"},
    {"symbol": "SPY", "asset_class": "etf", "name": "SPDR S&P 500 ETF Trust", "yf_ticker": "SPY"},
    {"symbol": "BTC-USD", "asset_class": "crypto", "name": "Bitcoin / US Dollar", "yf_ticker": "BTC-USD"},
]

TIMEFRAME = "1d"
HISTORY_PERIOD = "10y"  # ADR-006: daily bars for 10+ years
CANDLE_BATCH_SIZE = 500  # keep individual upsert requests small


def get_client() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the "
            "environment (Dashboard -> Project Settings -> API). Refusing "
            "to run without them rather than fail confusingly on the first "
            "write -- RLS would silently reject it under any other role."
        )
    return create_client(url, key)


def upsert_instrument(client: Client, spec: dict) -> str:
    result = (
        client.table("instruments")
        .upsert(
            {
                "symbol": spec["symbol"],
                "asset_class": spec["asset_class"],
                "name": spec["name"],
            },
            on_conflict="symbol,asset_class",
        )
        .execute()
    )
    return result.data[0]["id"]


def import_candles(client: Client, instrument_id: str, yf_ticker: str) -> int:
    history = yf.Ticker(yf_ticker).history(
        period=HISTORY_PERIOD, interval="1d", auto_adjust=False
    )

    if history.empty:
        print(f"  no data returned for {yf_ticker}, skipping")
        return 0

    rows = []
    for ts, bar in history.iterrows():
        # candles.ts is documented as "bar open time, UTC" (DATABASE_SCHEMA
        # §2) -- yfinance returns an exchange-local tz-aware index, so
        # normalize instead of trusting it already matches.
        bar_ts = ts.tz_convert("UTC") if ts.tzinfo is not None else ts.tz_localize("UTC")

        volume = bar["Volume"]
        rows.append(
            {
                "instrument_id": instrument_id,
                "timeframe": TIMEFRAME,
                "ts": bar_ts.isoformat(),
                # Formatted as fixed-decimal strings, not raw Python
                # floats: prices are numeric(18,8) in Postgres, and a
                # binary float round-tripped through JSON is exactly the
                # kind of imprecision ENGINEERING_PRINCIPLES §9 bans for
                # money -- cheap to avoid here even though this is an
                # import script, not the engine.
                "open": f"{float(bar['Open']):.8f}",
                "high": f"{float(bar['High']):.8f}",
                "low": f"{float(bar['Low']):.8f}",
                "close": f"{float(bar['Close']):.8f}",
                "volume": f"{float(volume):.4f}" if volume == volume else "0.0000",  # NaN check
            }
        )

    for i in range(0, len(rows), CANDLE_BATCH_SIZE):
        batch = rows[i : i + CANDLE_BATCH_SIZE]
        client.table("candles").upsert(batch, on_conflict="instrument_id,timeframe,ts").execute()

    return len(rows)


def main() -> None:
    client = get_client()

    for spec in STARTER_INSTRUMENTS:
        print(f"{spec['symbol']}: upserting instrument...")
        instrument_id = upsert_instrument(client, spec)

        print(f"{spec['symbol']}: importing {HISTORY_PERIOD} of {TIMEFRAME} candles...")
        count = import_candles(client, instrument_id, spec["yf_ticker"])
        print(f"{spec['symbol']}: done ({count} bars)")


if __name__ == "__main__":
    main()
