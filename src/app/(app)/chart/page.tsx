import { PriceChart } from "@/components/chart/PriceChart";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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

// bg-surface/text-foreground here, not bg-transparent like <Input>: a
// <select>'s dropdown popup is a native, separate rendering surface, not
// layered over the page like an input's box is. Chromium paints that
// popup using the *select's own* resolved background-color/color, so a
// transparent background falls back to the browser's default (white) —
// combined with our inherited near-white dark-mode text color, that made
// every option white-on-white except the one row the OS highlights blue
// (§11 AA contrast bug). The [&>option] overrides reinforce the same
// tokens directly on each <option>, which Chromium and Firefox both honor
// for the popup list; Safari's native popup does not respect per-option
// styling at all (a known cross-browser limit, not fixable from CSS) and
// falls back to the OS's own light/dark appearance instead, which is
// legible either way since it's not our (broken) white default.
const selectClassName =
  "border-input bg-surface text-foreground h-8 rounded-lg border px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&>option]:bg-surface [&>option]:text-foreground";

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
            <select id="symbol" name="symbol" defaultValue={symbol} className={selectClassName}>
              {INSTRUMENT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="tf">Timeframe</Label>
            <select id="tf" name="tf" defaultValue={timeframe} className={selectClassName}>
              {Object.entries(TIMEFRAME_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
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
