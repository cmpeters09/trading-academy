import { ReplayChart } from "@/features/replay";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getCandles, getInstrumentBySymbol } from "@/services/market-data/candles";

// Same starter set as /chart (ADR-016) — not a general instrument search.
const INSTRUMENT_OPTIONS = ["AAPL", "MSFT", "SPY", "BTC-USD"] as const;
const DEFAULT_SYMBOL = "SPY";

// Fixed at "1d", not a selector like /chart's: TD-05 (TECHNICAL_DEBT.md)
// notes intraday timeframes have zero seeded candles, and its own trigger
// to pay is "before M-10 (Replay Engine)... needs real intraday bars to be
// useful." That debt is still open, so a replay session over an
// intraday timeframe today would just be an empty chart with nothing to
// step through — this route doesn't offer that choice until TD-05 is paid.
const TIMEFRAME = "1d";
const TIMEFRAME_LABEL = "1 day";
const LOOKBACK_DAYS = 730;

export default async function ReplayPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string }>;
}) {
  const params = await searchParams;
  const symbol = params.symbol?.toUpperCase() || DEFAULT_SYMBOL;

  const instrument = await getInstrumentBySymbol(symbol);

  if (!instrument) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Replay</h1>
        <p className="text-muted-foreground text-sm">
          No instrument found for &ldquo;{symbol}&rdquo;.
        </p>
      </div>
    );
  }

  const to = new Date();
  const from = new Date(to.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const candles = await getCandles({
    instrumentId: instrument.id,
    timeframe: TIMEFRAME,
    from: from.toISOString(),
    to: to.toISOString(),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {instrument.symbol} replay
          </h1>
          <p className="text-muted-foreground text-sm">{instrument.name}</p>
        </div>

        <form className="flex flex-wrap items-end gap-2" action="/replay">
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

          <Button type="submit">Go</Button>
        </form>
      </div>

      <ReplayChart
        candles={candles}
        instrumentLabel={instrument.symbol}
        timeframeLabel={TIMEFRAME_LABEL}
      />
    </div>
  );
}
