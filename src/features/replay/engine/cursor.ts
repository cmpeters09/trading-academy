import type { Candle } from "@/types/market.types";

import type { ReplayCursor } from "./types";

/**
 * Binary search for the index of the candle at exactly this timestamp.
 * Valid because candles are always fetched/stored in ascending ts order
 * (the `candles_lookup` index, DATABASE_SCHEMA.md §4) — a linear scan
 * would also be correct, just needlessly slower.
 */
export function findIndexForTimestamp(candles: Candle[], ts: string): number {
  let low = 0;
  let high = candles.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const midCandle = candles[mid];
    // mid is always within [low, high] ⊆ [0, candles.length - 1] while this
    // loop runs, so candles[mid] is always defined — provably unreachable,
    // required only to satisfy noUncheckedIndexedAccess (§9).
    /* v8 ignore next */
    if (!midCandle) return -1;

    if (midCandle.ts === ts) return mid;
    if (midCandle.ts < ts) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return -1;
}

function indexToCursor(candles: Candle[], index: number): ReplayCursor {
  const candle = candles[index];
  return candle ? { ts: candle.ts } : null;
}

/**
 * Every cursor this module ever hands out corresponds to a real candle in
 * the SAME array it came from — within one unbroken replay session, a
 * mismatch here can only mean the caller swapped candle arrays mid-session
 * or passed a corrupted timestamp: a broken invariant (§7 class 3), not a
 * normal outcome, so this throws rather than returning a typed result.
 * Resuming a cursor persisted in an earlier session (TD-06, deferred) is a
 * genuine external-data trust boundary and will need real validation
 * instead of this throw when that's built.
 */
function cursorToIndex(candles: Candle[], cursor: { ts: string }): number {
  const index = findIndexForTimestamp(candles, cursor.ts);
  if (index === -1) {
    throw new Error(
      `Replay cursor timestamp "${cursor.ts}" was not found in the given candles.`,
    );
  }
  return index;
}

/** The first bar, revealed. `null` if there are no candles at all. */
export function jumpToStart(candles: Candle[]): ReplayCursor {
  return indexToCursor(candles, 0);
}

/** The last bar, revealed. `null` if there are no candles at all. */
export function jumpToEnd(candles: Candle[]): ReplayCursor {
  return indexToCursor(candles, candles.length - 1);
}

/**
 * Reveals `steps` more bars, clamped at the last candle — stepping forward
 * can never reveal a bar that doesn't exist yet. From `null` (nothing
 * revealed), one step forward reveals the first bar.
 */
export function stepForward(
  candles: Candle[],
  cursor: ReplayCursor,
  steps = 1,
): ReplayCursor {
  const currentIndex = cursor === null ? -1 : cursorToIndex(candles, cursor);
  const nextIndex = Math.min(currentIndex + steps, candles.length - 1);
  return indexToCursor(candles, nextIndex);
}

/**
 * Un-reveals `steps` bars. Stepping back from the first bar returns to
 * `null` — "rewound before the beginning" — rather than staying pinned at
 * index 0; stepping back from `null` stays `null`, since there's nowhere
 * earlier than nothing revealed.
 */
export function stepBackward(
  candles: Candle[],
  cursor: ReplayCursor,
  steps = 1,
): ReplayCursor {
  if (cursor === null) return null;
  const previousIndex = cursorToIndex(candles, cursor) - steps;
  return previousIndex < 0 ? null : indexToCursor(candles, previousIndex);
}

/**
 * The ONLY bar-revealing function anything outside this engine should
 * ever call. Returns candles[0..cursor] inclusive, or an empty array when
 * `cursor` is `null` — this is the actual "hide the future" guarantee
 * (ADR-004): a caller that only ever renders what this function returns
 * architecturally cannot show a bar past the cursor, because it never
 * receives one.
 */
export function getRevealedCandles(
  candles: Candle[],
  cursor: ReplayCursor,
): Candle[] {
  if (cursor === null) return [];
  return candles.slice(0, cursorToIndex(candles, cursor) + 1);
}

/** The single bar at the cursor, or `null` if nothing is revealed yet. */
export function getCurrentBar(
  candles: Candle[],
  cursor: ReplayCursor,
): Candle | null {
  if (cursor === null) return null;
  // cursorToIndex only ever returns an index it just found IN this same
  // array (or throws), so candles[index] is always defined — the ?? null
  // is provably unreachable, required only to satisfy noUncheckedIndexedAccess.
  /* v8 ignore next */
  return candles[cursorToIndex(candles, cursor)] ?? null;
}

/** True at `null` (nothing revealed) or the first bar — nowhere earlier to go. */
export function isAtStart(candles: Candle[], cursor: ReplayCursor): boolean {
  if (cursor === null) return true;
  return cursorToIndex(candles, cursor) === 0;
}

/** True at the last bar, or trivially true when there are no candles at all. */
export function isAtEnd(candles: Candle[], cursor: ReplayCursor): boolean {
  if (candles.length === 0) return true;
  if (cursor === null) return false;
  return cursorToIndex(candles, cursor) === candles.length - 1;
}
