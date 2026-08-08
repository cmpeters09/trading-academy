/**
 * The replay cursor is a candle TIMESTAMP, not an array index — matching
 * `replay_sessions.cursor_ts` (DATABASE_SCHEMA.md §4), so a persisted
 * resume position means the same thing regardless of how the candle array
 * happens to be indexed when it's re-fetched later (TD-06: persistence
 * itself is deferred, but the cursor shape is chosen now so it doesn't
 * need to change when that lands).
 *
 * `null` = the replay hasn't started: zero bars revealed.
 */
export type ReplayCursor = { ts: string } | null;
