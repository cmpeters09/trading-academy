import { PriceChart } from "@/components/chart/PriceChart";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getCandles, getInstrumentBySymbol, timeframeSchema } from "@/services/market-data/candles";
import type { Timeframe } from "@/types/market.types";

// Seeded dev dataset only (ADR-016) — the four instruments the yfinance
// import script pulls. Not a general instrument search; that's dataset
// curation work explicitly out of scope for this milestone.
const INSTRUMENT_OPTIONS = ["AAPL", "MSFT", "SPY", "BTC-USD"] as const;
const DEFAULT_SYMBOL = "SPY";
const DEFAULT_TIMEFRAME: Timeframe = "1d";

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  "1m": "1 minute",
  "5m": "5 minute",
  "15m": "15 minute",
  "1h": "1 hour",
  "4h": "4 hour",
  "1d": "1 day",
  "1w": "1 week",
};

// Only "1d" has real seeded candles today (the import script pulls daily
// bars only — DATABASE_SCHEMA / ADR-006). Lookback is a fixed calendar
// window per timeframe rather than a bar-count query: keeps the bound
// literal and reviewable (ENGINEERING_PRINCIPLES §12).
const LOOKBACK_DAYS: Record<Timeframe, number> = {
  "1m": 1,
  "5m": 3,
  "15m": 7,
  "1h": 30,
  "4h": 90,
  "1d": 730,
  "1w": 1825,
};

function parseTimeframe(value: string | undefined): Timeframe {
  const parsed = timeframeSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_TIMEFRAME;
}

export default async function ChartPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string; tf?: string }>;
}) {
  const params = await searchParams;
  const symbol = params.symbol?.toUpperCase() || DEFAULT_SYMBOL;
  const timeframe = parseTimeframe(params.tf);

  const instrument = await getInstrumentBySymbol(symbol);

  if (!instrument) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Chart</h1>
        <p className="text-muted-foreground text-sm">
          No instrument found for &ldquo;{symbol}&rdquo;.
        </p>
      </div>
    );
  }

  const to = new Date();
  const from = new Date(to.getTime() - LOOKBACK_DAYS[timeframe] * 24 * 60 * 60 * 1000);

  const candles = await getCandles({
    instrumentId: instrument.id,
    timeframe,
    from: from.toISOString(),
    to: to.toISOString(),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{instrument.symbol}</h1>
          <p className="text-muted-foreground text-sm">{instrument.name}</p>
        </div>

        <form className="flex flex-wrap items-end gap-2" action="/chart">
          <div className="flex flex-col gap-1">
            <Label htmlFor="symbol">Instrument</Label>
            <Select id="symbol" name="symbol" defaultValue={symbol}>
              {INSTRUMENT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="tf">Timeframe</Label>
            <Select id="tf" name="tf" defaultValue={timeframe}>
              {Object.entries(TIMEFRAME_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>

          <Button type="submit">Go</Button>
        </form>
      </div>

      <PriceChart
        candles={candles}
        instrumentLabel={instrument.symbol}
        timeframeLabel={TIMEFRAME_LABELS[timeframe]}
      />
    </div>
  );
}
