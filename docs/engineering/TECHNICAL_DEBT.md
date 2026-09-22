# TECHNICAL_DEBT.md

# Trading Academy — Technical Debt Register

Required by NON_NEGOTIABLES.md Rule 17 and ENGINEERING_PRINCIPLES.md §26.
Debt is permitted only if it is **intentional, visible, and temporary**. If it is not in this file, it is not permitted.

Reviewed at every milestone boundary. If this list grows faster than it shrinks for two consecutive milestones, feature work stops until it is paid down.

**Status:** `open` · `paid` · `accepted` (deliberately permanent — requires a stated reason)

---

## Template — copy this

```md
### TD-nn · <one-line title>
- **Incurred:** M-x, YYYY-MM-DD
- **Why:** what forced the shortcut
- **Risk if unpaid:** concrete consequence, with the RISKS R-n reference if it maps to one
- **Proposed fix:** what "paid" looks like, with a rough estimate
- **Trigger to pay:** the condition that makes this urgent (a milestone, a user count, a cost threshold)
- **Owner:** Christian
- **Status:** open
```

---

## Open debt

### TD-01 · PROJECT_INSTRUCTIONS.md referenced but never written
- **Incurred:** M-1, 2026-07-13
- **Why:** PROJECT_MAP.md names it as the mandatory first-read entry point indexing the doc hierarchy, but it was never created; DOC_CONSISTENCY_REVIEW.md C-2 flagged this before M-1 and it wasn't resolved before implementation began.
- **Risk if unpaid:** New contributors (or a future session) have no single entry point into the doc hierarchy; PROJECT_MAP.md's own reading order points at a dead reference.
- **Proposed fix:** Write a short index document listing precedence order and pointing to each doc. ~30 min.
- **Trigger to pay:** Before M-2 begins.
- **Owner:** Christian
- **Status:** open

### TD-04 · Email confirmation disabled for local development
- **Incurred:** M-2, 2026-07-15
- **Why:** Editing Supabase's email templates (needed so the confirmation/recovery links point at `/auth/confirm` with `token_hash`/`type`, per PR #5) is now gated behind configuring custom SMTP, which isn't set up yet. Rather than block the auth-UI PR on standing up SMTP, "Confirm email" was disabled in Authentication -> Email Provider settings for the dev phase — signups now get an active session immediately, with no `/auth/confirm` round trip.
- **Incident, 2026-07-16:** Repeated manual signup testing against fake addresses (`test-...@example.com`, `claude-agent-test-...@gmail.com`, and other one-off test emails) caused Supabase's confirmation emails to bounce and triggered a bounce-rate warning from Supabase, with a threat to throttle sending if it continued. Mitigated in code (not by touching SMTP/dashboard email settings): `signUpSchema`/`forgotPasswordSchema` now reject RFC 2606-reserved test domains (`example.com`/`.org`/`.net`/`.edu`, `.test`/`.example`/`.invalid`/`.localhost`) before a request ever reaches Supabase. This reduces *accidental* bounces from careless test input; it does not change the underlying trade-off below, and testing the forgot-password flow against any address that isn't a real, owned inbox will still bounce — `resetPasswordForEmail` always sends mail regardless of the "Confirm email" setting.
- **Risk if unpaid:** Anyone can sign up with an email address they don't own; nothing verifies it's real or belongs to them. Acceptable only while the product has zero external users. Shipping this as-is to real users would mean unverified accounts, no protection against typo'd or fake emails, and password-reset links being usable by whoever controls an unverified inbox.
- **Proposed fix:** Configure custom SMTP (Dashboard -> Project Settings -> Auth -> SMTP Settings), point the "Confirm signup" and "Reset password" email templates at `/auth/confirm` using the exact values in PR #5's description, then re-enable "Confirm email" in Email Provider settings. ~30-45 min once an SMTP provider is chosen. **Deliberately not being done now** — still deferred to pre-launch, per the original trigger below.
- **Trigger to pay:** Before the first external/real user signs up — i.e., before any public or shared deployment. Blocks nothing before then.
- **Owner:** Christian
- **Status:** open

### TD-05 · Only daily ("1d") candles are seeded — intraday timeframes are empty
- **Incurred:** M-3, 2026-08-05
- **Why:** `supabase/scripts/import_yfinance.py` pulls only `1d` bars for the four starter instruments (ADR-006/ADR-016 starter set). The `candles` table's `timeframe` check constraint allows `1m`/`5m`/`15m`/`1h`/`4h`/`1d`/`1w`, and the `/chart` route's timeframe selector lists all seven, but only `1d` has any rows — intraday import and the curated "interesting event" dataset segments (ADR-006 §2: 2008, 2020 crash, earnings gaps) are explicitly out of scope for the PriceChart work this session.
- **Risk if unpaid:** None correctness-wise — selecting an intraday timeframe renders PriceChart's existing empty state ("No candle data for this range."), not an error or a wrong number, which is the honest behavior §7/§23 require for missing data. The only cost is an unpolished first impression (a user picking "5 minute" sees nothing happen).
- **Proposed fix:** Extend `import_yfinance.py` to also pull a recent intraday window per instrument (yfinance limits intraday history to ~60 days for sub-daily intervals) and/or curate the dataset segments ADR-006 describes. Roadmap already tracks this: M-3's "Seed initial dataset: ~20 instruments daily + 3 curated intraday segments" checklist item is still unchecked.
- **Trigger to pay:** Before M-10 (Replay Engine) or M-16 (Pattern Recognition), both of which need real intraday bars to be useful. Not blocking for M-3 itself — the roadmap only requires the *component*, which already handles this data gap correctly.
- **Owner:** Christian
- **Status:** open

### TD-06 · `replay_sessions` (resumable sessions) deferred until M-9 exists
- **Incurred:** M-10, 2026-08-07
- **Why:** DATABASE_SCHEMA.md's `replay_sessions` table has a required (`not null`) FK to `sim_accounts`, which is M-9 (Simulator UI) scope. The roadmap has M-9 depending on M-10, not the other way around, so `sim_accounts` doesn't exist yet when M-10 is built — there's nothing valid to put in that column. Rather than invent a placeholder `sim_accounts` table or make the FK nullable (both real schema decisions, not something to decide silently mid-session), M-10 Session 4 (persistence) is deferred entirely.
- **Risk if unpaid:** None while unpaid — replay simply isn't resumable yet (a session's progress is lost on refresh/navigation). No wrong data, no broken invariant, just a feature gap that was scoped out on purpose.
- **Proposed fix:** Once M-9 creates `sim_accounts`, write the `replay_sessions` migration + RLS (ADR-012, same migration) and the M-10 Session 4 service/route work (segment/instrument/timeframe, `cursor_ts` persisted on pause, resume by converting the stored timestamp back into a cursor via `features/replay/engine`'s lookup). ~1 session.
- **Trigger to pay:** After M-9 ships `sim_accounts`. Not blocking M-10 itself — the roadmap's M-10 checklist item is "candle-by-candle playback," which Sessions 1–3 deliver fully; "resumable sessions" is the one checklist line this debt covers.
- **Update, M-9 Session 1, 2026-09-17:** `sim_accounts` now exists (`20260917090000_create_sim_accounts.sql`) — the FK blocker described above is cleared. `replay_sessions` itself is still **not** built; that migration is deliberately left for its own session (not bundled into M-9 Session 1, which is scoped to account/order/position state only). Status stays `open` until `replay_sessions` actually ships.
- **Owner:** Christian
- **Status:** open

### TD-07 · `sim_accounts` has no `updated_at` despite `balance` mutating on every trade
- **Incurred:** M-9 Session 1, 2026-09-17
- **Why:** DATABASE_SCHEMA.md §4's `sim_accounts` SQL block (the literal spec this migration replicates) only lists `created_at`, even though the doc's own top-level conventions note says "`created_at`/`updated_at` on every table." `orders` has the same gap in the doc; `executions` has neither column. Rather than silently add a column the schema doc doesn't show, or silently match the doc's gap without flagging it (CLAUDE.md: "Never fix a doc gap silently — log it or ask"), the migration was written to match the documented SQL exactly and the inconsistency is logged here instead.
- **Risk if unpaid:** `balance` changes on every fill/trade close (M-9 Sessions 2+, M-11), but nothing records *when* the most recent change happened — no auditability for "why is this balance what it is right now," and no cheap way to sort/debug accounts by recent activity without scanning `orders`/`trades`.
- **Proposed fix:** A small follow-up migration adding `updated_at timestamptz not null default now()` to `sim_accounts` (and, while there, `orders`) plus a trigger to bump it on update — same pattern as `profiles`/`user_settings`. ~15 min. Decide at the same time whether DATABASE_SCHEMA.md's shown SQL should be corrected to match (doc fix, not a silent one).
- **Trigger to pay:** Before M-9 Session 2 starts writing balance-mutating logic (order fills against a `sim_account`), so the gap doesn't widen further before it's addressed.
- **Update, M-11 Session 1, 2026-09-22:** The same gap is now built into three more tables, matching DATABASE_SCHEMA.md's shown SQL exactly rather than silently fixed: `orders` and `executions` (predicted by this entry's own "orders has the same gap... executions has neither column" line) and, newly noticed, `trades` — it has `created_at` but no `updated_at` despite `deleted_at` (ADR-011 soft delete) being a later mutation with nothing recording when it happened. Still open; still unpaid.
- **Owner:** Christian
- **Status:** open

### TD-08 · `addToPosition` doesn't re-validate a carried-over stop/target against the new weighted-average entry price
- **Incurred:** M-9 Session 1, 2026-09-17
- **Why:** `features/simulator/lib/position.ts`'s `addToPosition` recomputes the position's weighted-average entry price (`position-math.ts`) but carries the existing `plannedStopPrice`/`plannedTargetPrice` over unchanged. An add-to can move the average entry price past a stop that was valid when the position opened (e.g. adding to a long at a much lower price can leave the stop above the new entry). Deciding the product behavior (reject the add? clear the stop? require the caller to supply a new one?) is a real product decision, not something to guess mid-session — so `addToPosition` stays permissive and the now-invalid stop surfaces later, as the engine's own `INVALID_STOP`, the next time the position is closed.
- **Risk if unpaid:** A position can sit open with a stop/target that no longer makes sense for its current entry price, discovered only when `partiallyClosePosition`/`fullyClosePosition` rejects the close with `INVALID_STOP` — surfaced late, not at the moment the add happens. Covered by explicit tests (`position.test.ts`'s "bubbles the engine's INVALID_STOP" cases) so the behavior is at least correct and visible, not silently wrong.
- **Proposed fix:** Decide the product rule (likely: reject an add that would invalidate the carried-over stop, forcing the caller to clear/replace it first) and implement it in `addToPosition`, with new hand-computed tests for the rejection. ~1-2h once the product decision is made.
- **Trigger to pay:** Before Session 2+ builds the order ticket UI that calls `addToPosition` against live fills — a UI needs a real answer here, not a bubbled engine error from a later close.
- **Update, M-9 Session 2, 2026-09-17:** The order ticket UI (`OrderTicket.tsx`) now exists, but it only captures and validates a typed order — it does not call `addToPosition` or any other engine/position function yet (that wiring is Session 3, per this session's explicit scope). Trigger stays un-fired until Session 3 actually wires the ticket's submission to `addToPosition`/fills.
- **Update, M-9 Session 3, 2026-09-18:** The ticket is now wired end-to-end (`lib/process-bar.ts`, `store.ts`) — but it calls only `openPosition` and `fullyClosePosition`, never `addToPosition`. `PositionPanel` hides the order ticket entirely while a position is open (TD-10), so there is currently no path in the UI that submits a second order against an already-open position. Trigger still hasn't fired; it will the moment TD-10 is paid and adding-to-an-open-position becomes possible.
- **Owner:** Christian
- **Status:** open

### TD-09 · `OrderTicket` has no component tests (ADR-010/§14 gap)
- **Incurred:** M-9 Session 2, 2026-09-17
- **Why:** ENGINEERING_PRINCIPLES §14 (ADR-010) explicitly names "order ticket" as a component warranting component tests ("only for genuinely complex interactive components (order ticket, quiz)"), but this repo has no React Testing Library/jsdom set up yet — only Node-environment pure-function `vitest` tests exist so far. Adding component-test infrastructure (new dev dependencies, a jsdom environment) is a real, repo-wide tooling decision, not something to bundle silently into the order-ticket feature commit — deferred here on purpose after checking with the user.
- **Risk if unpaid:** `OrderTicket`'s React wiring (conditional limit/stop field visibility, cross-field stop/target errors landing on the right input, a successful submit producing the right on-screen confirmation) is verified only by typecheck/lint/manual review, not automated tests — a regression here wouldn't be caught by CI. The validation logic itself (`orderTicketSchema`, `toOrderTicketSubmission`, `features/simulator/lib/order-ticket-schema.ts`) IS covered at 100% branches; this gap is specifically the component wiring around it.
- **Proposed fix:** Add `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, and `jsdom` as dev dependencies (pinned exact per §25); configure a jsdom environment for component test files (a per-file `// @vitest-environment jsdom` override keeps the existing pure-logic tests fast/Node-only); write component tests for `OrderTicket` covering conditional field visibility, inline error rendering with correct `aria-describedby` wiring, and a successful submit producing the right `OrderTicketSubmission`. ~1-2h including the one-time infra setup.
- **Trigger to pay:** Before Session 4 (position-sizing helper) adds more interactive logic to this feature, or before any other feature needs the same infra — whichever comes first. Not blocking Session 3.
- **Update, M-9 Session 3, 2026-09-18:** `PositionPanel` and `ReplaySimulator` (new this session) have the same gap — verified only by typecheck/lint and a manual, live browser pass (market buy -> step forward -> fill -> position readout, both themes, no console errors), not automated tests. Same infra would cover all of them at once; the trigger is unchanged.
- **Owner:** Christian
- **Status:** open

### TD-11 · No automated RLS isolation test yet for orders/executions/trades/trade_orders
- **Incurred:** M-11 Session 1, 2026-09-22
- **Why:** ADR-010/§14 require an integration test proving user A cannot read user B's rows, run via Vitest against `supabase start`'s local dev stack. That stack is Docker-based, and Docker isn't installed in this environment. Rather than skip the requirement silently, or write the test against the real hosted project (mixing throwaway test accounts into a production-track project and touching signup, which TD-04 already flagged as fragile for disposable test emails), the test itself is deferred here — the RLS *policies* are not: `20260922142658_create_trade_persistence_tables.sql` ships SELECT-own-only policies (no INSERT/UPDATE for `authenticated`) on all four tables, matching ADR-012's default-deny model exactly, the same pattern already used (and already tested-by-inspection-only) for `sim_accounts`/`profiles`. ENGINEERING_PRINCIPLES §26's never-take list forbids *skipping* RLS — this entry defers proving it, not doing it.
- **Risk if unpaid:** the policies are believed correct by inspection but unverified by an actual cross-user read attempt. If a policy has a typo or a wrong `auth.uid()` comparison, nothing currently catches it before Session 4's Edge Function starts writing real trade data other users could then read.
- **Proposed fix:** install Docker, run `supabase start`, apply this migration locally, and write a Vitest integration test that signs in as two test users and asserts each of `orders`/`executions`/`trades`/`trade_orders` is unreadable cross-user. ~1h once Docker is available.
- **Trigger to pay:** before M-11 Session 4 (the Edge Function that writes real trades) is merged — not "someday." The write path must not go live against unverified policies.
- **Owner:** Christian
- **Status:** open

### TD-12 · `getOrCreateDefaultSimAccount` has no DB-level guard against a duplicate default `sim_account`
- **Incurred:** M-11 Session 2, 2026-09-22
- **Why:** `services/simulator/sim-accounts.ts`'s get-or-create does a `select` for an existing `is_default = true` row, then an `insert` if none is found — two round-trips, not one atomic operation. `sim_accounts` has no unique constraint (partial or otherwise) enforcing at most one `is_default` row per `user_id` (`20260917090000_create_sim_accounts.sql` doesn't have one; adding it wasn't asked for and would be a schema decision made silently mid-session). Two concurrent first-visits from the same signed-in user (e.g. two tabs opened at once) could both see "no existing row" and both insert.
- **Risk if unpaid:** a user ends up with two `is_default = true` `sim_accounts` rows. `getOrCreateDefaultSimAccount`'s `.maybeSingle()` would then throw on the NEXT call (more than one row matches), turning a rare race into a hard error on a later visit. Low likelihood for a single interactive user in practice (this app has no multi-tab trading workflow), but a real gap, not a hypothetical one.
- **Proposed fix:** a partial unique index (`create unique index ... on sim_accounts (user_id) where is_default`), in its own migration, plus switching the insert to `upsert`/`on conflict do nothing` and re-`select`ing on conflict. ~30 min.
- **Trigger to pay:** before `/replay` (or any route using `getOrCreateDefaultSimAccount`) is used in a context where concurrent requests from one user are plausible — not blocking for a single-user class-window session.
- **Owner:** Christian
- **Status:** open

---

## Paid debt

### TD-10 · No way to manually close a position, and a position with only ONE bracket leg never auto-exits
- **Incurred:** M-9 Session 3, 2026-09-18
- **Why:** `lib/process-bar.ts`'s bracket check only runs when a position has BOTH a planned stop-loss AND target (`resolveBracket` has no meaning for one leg — ADR-007/RISKS R-3's model is a complete bracket or nothing). A position opened with no stop/target, or only one of the two, simply stays open forever from the engine's point of view — there's no manual "close position" action in `PositionPanel` to fall back on either, since this session's scope was "see a fill happen," not full order management.
- **Risk if unpaid:** A user who places a market order without setting both a stop-loss and a target (very plausible for a first-time user) gets a position they cannot close through the UI at all — not wrong behavior, just an incomplete one, but a real usability gap. `OrderTicket` doesn't visually signal that skipping the bracket has this consequence.
- **Proposed fix:** A manual "Close position (market)" action in `PositionPanel`, calling `fullyClosePosition` against a market-style fill on the currently revealed bar (or, for full ADR-007 consistency, queuing a closing market order that fills at the NEXT bar's open, same as an entry) — plus, separately, deciding whether a single-leg bracket (stop only, or target only) should auto-exit using `fillStopOrder`/exact-price logic directly rather than `resolveBracket`. ~2-3h; a real product decision, not just an implementation task.
- **Trigger to pay:** Before Session 4, which is expected to add fuller position management (the risk-% sizing helper implies deciding how a trade's lifecycle ends). Not blocking Session 3's own goal (seeing a fill happen) since a bracket-closed position already demonstrates the full lifecycle end-to-end.
- **Owner:** Christian
- **Status:** paid — M-9 Session 4 sub-session C, 2026-09-21. Went with the queued-market-close design (a `closeRequested` flag consumed on the NEXT revealed bar as a market fill, mirroring how an entry order fills — not an immediate current-bar close) for full ADR-007 consistency. Single-leg exits reuse `fillStopOrder`/`fillLimitOrder` directly with the closing side (opposite of the position's entry side) rather than faking a second bracket leg — verified by hand that the touch-check and fill-price formulas match `bracket.ts`'s own stop/target math exactly in both directions. `PositionPanel` now shows a "Close position" button (replaced by a "closing at the next bar's open" status once clicked) whenever a position is open. Verified live in the browser: opened a position with no bracket at all (previously unclosable), clicked "Close position," stepped forward, watched it close with the correct net PnL.

### TD-02 · ADR-013/014/015 referenced but never written
- **Incurred:** M-1, 2026-07-13
- **Why:** DOC_CONSISTENCY_REVIEW.md called for three ADRs before M-1 (ADR-013 engine location, ADR-014 numeric precision, ADR-015 env/secrets). ENGINEERING_PRINCIPLES.md §3.1 already describes ADR-013's resolution as settled, citing it as if it exists. None were written; ADR-016 was written and numbered past the gap.
- **Risk if unpaid:** Non-obvious domain rules (engine location, money arithmetic, secrets handling) cite ADRs that don't exist — a citation to nothing, which ENGINEERING_PRINCIPLES §15 calls worse than no citation.
- **Proposed fix:** Write ADR-013 (supersedes ADR-007, location only), ADR-014, and ADR-015 — each a short transcription of decisions already made in ENGINEERING_PRINCIPLES.md into immutable ADR form. ~30 min each.
- **Trigger to pay:** ADR-013 and ADR-014 before M-8 (simulator engine); ADR-015 before Supabase is wired (later this milestone).
- **Owner:** Christian
- **Status:** paid — ADR-015 written M-1 Session 4, 2026-07-14, before Supabase wiring per the original trigger. ADR-013 and ADR-014 written M-8 Session 0, 2026-08-05, before any engine code, per the original trigger.

### TD-03 · Scaffold dependencies use `^` ranges instead of exact pins
- **Incurred:** M-1, 2026-07-13
- **Why:** `create-next-app` and the initial scaffold pinned `typescript`, `eslint`, `tailwindcss`, `@tailwindcss/postcss`, `@types/node`, `@types/react`, and `@types/react-dom` with `^` ranges. ENGINEERING_PRINCIPLES.md §25 requires exact versions, updated deliberately via a scheduled dependency PR. Re-pinning the whole scaffold wasn't in scope of the Session 2 tooling work (CI/commitlint) that surfaced this.
- **Risk if unpaid:** A `^` range can resolve to a different version on a fresh `npm install` (e.g. a new contributor, or CI cache miss) than what was last tested locally, silently changing lint/typecheck/build behavior between environments.
- **Proposed fix:** Pin each `^`-ranged dependency to its currently installed exact version in `package.json`, in a dedicated dependency PR. ~15 min.
- **Trigger to pay:** Before M-3, when the first non-scaffold dependencies get added — pin the scaffold at the same time so all dependencies follow the same exact-version convention from that point on.
- **Owner:** Christian
- **Status:** paid — M-3, 2026-07-16. All seven pinned to their currently installed exact versions (`typescript` 5.9.3, `eslint` 9.39.5, `tailwindcss`/`@tailwindcss/postcss` 4.3.2, `@types/node` 20.19.43, `@types/react` 19.2.17, `@types/react-dom` 19.2.3); lockfile regenerated to match.

---

## Debt that may never be taken

These are not shortcuts. Taking them means the product is wrong, not merely unfinished.

- Skipping RLS policies on a table
- Skipping tests on the fill engine, statistics formulas, or XP grants
- Trusting a client-supplied `userId` in an Edge Function
- Floating-point arithmetic on money
- Shipping a number that might be wrong rather than shipping no number
- Anything that violates NON_NEGOTIABLES.md
