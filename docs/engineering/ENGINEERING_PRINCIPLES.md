# ENGINEERING_PRINCIPLES.md

# Trading Academy — Engineering Constitution

Version 1.0 · Status: Binding

## Precedence

When documents conflict, this order governs:

1. `NON_NEGOTIABLES.md` (product constitution — *what* we will and won't build)
2. `/docs/adr/*` (architectural decisions — *which* technology and pattern)
3. **This document** (engineering standards — *how* code is written)
4. `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `FEATURE_ROADMAP.md` (descriptive; they follow 1–3)

This document is amended by pull request, never silently. An amendment that changes an architectural decision requires a superseding ADR first.

Rules here are written as **MUST** (enforced, blocks merge), **SHOULD** (default; deviation requires a comment explaining why), and **MAY** (permitted).

---

## 1. Folder Organization

```
/app                    Routes only. Thin. No business logic.
/components             Shared, feature-agnostic UI. Knows nothing about trading.
  /ui                     shadcn primitives (generated, minimally edited)
  /chart                  PriceChart + overlays (ADR-004)
  /layout                 Shell, nav, page frames
/content/lessons        MDX lesson content (ADR-008)
/features               Feature modules — the primary unit of organization
/hooks                  Cross-feature hooks only (useDebounce, useMediaQuery)
/lib                    Framework-agnostic domain logic with no React import
  /engine                 The shared deterministic trading engine (see §3.1)
/services               I/O boundaries: supabase client, /services/ai
/styles
/types                  Cross-cutting types only; generated DB types
/utils                  Pure, generic helpers (formatting, dates, math)
/supabase               migrations, functions (Edge), seed + import scripts
/docs                   this file, /adr, schema, dependencies, risks, tech debt
/tests                  e2e (Playwright) only; unit tests colocate with source
```

**MUST:** A file lives in `/features` unless it is used by two or more features. Premature promotion to `/components` or `/utils` is a defect, not foresight. Promote on the second use, never the first.

**MUST NOT:** No `/store` directory. Feature stores live inside their feature (ADR-005). A directory that exists to hold almost nothing is a naming trap.

**MUST NOT:** No files named `utils.ts`, `helpers.ts`, `misc.ts`, `common.ts`, or `index.ts` containing logic. `index.ts` is permitted only as a re-export barrel for a feature's public surface.

### Feature module shape

```
/features/simulator
  /components           Feature-owned UI (OrderTicket.tsx, PositionsPanel.tsx)
  /hooks                useOrderTicket.ts, usePositions.ts
  /api                  TanStack Query hooks + service calls for this feature
  /lib                  Feature-local pure logic
  store.ts              Zustand store (only if ephemeral state exists)
  types.ts
  index.ts              Public surface — the ONLY thing other features may import
  README.md             Purpose · Architecture · API · Extension · Limitations
```

**MUST:** Cross-feature imports go through `index.ts`. `import { OrderTicket } from '@/features/simulator'` is legal; `import { OrderTicket } from '@/features/simulator/components/OrderTicket'` is not. Enforced by ESLint `no-restricted-imports`.

**MUST:** If feature A needs feature B's internals, that logic belongs in `/lib` or `/components`, not in a deep import. Deep imports are how a modular codebase quietly becomes a monolith.

---

## 2. File & Symbol Naming

| Thing | Convention | Example |
|---|---|---|
| React component file | `PascalCase.tsx` | `OrderTicket.tsx` |
| Hook file | `camelCase.ts`, `use` prefix | `useReplayCursor.ts` |
| Pure module / util | `kebab-case.ts` | `position-sizing.ts` |
| Type-only file | `types.ts` or `x.types.ts` | `order.types.ts` |
| Test | `<source>.test.ts` colocated | `fill-engine.test.ts` |
| Zustand store | `store.ts` | — |
| Route segment | Next.js convention | `app/(app)/replay/page.tsx` |
| Edge Function | `kebab-case/index.ts` | `supabase/functions/grant-xp/` |
| Migration | `<timestamp>_<verb>_<subject>.sql` | `20260714093000_create_xp_events.sql` |
| MDX lesson | `kebab-case.mdx` | `content/lessons/risk/position-sizing.mdx` |
| ADR | `ADR-NNN-kebab-title.md` | zero-padded to **three** digits, always |

**Symbols:** components `PascalCase`; functions/variables `camelCase`; types/interfaces `PascalCase` with no `I` prefix; constants `SCREAMING_SNAKE_CASE`; booleans read as assertions (`isFilled`, `hasStop`, `canTrade`).

**MUST:** Names state domain meaning, not implementation. `TradeList` not `DataTable2`. Abbreviations are banned except the domain-standard set: `pnl`, `ohlcv`, `rr`, `atr`, `bp` (basis points), `tf` (timeframe). If a new abbreviation is needed, add it here in the same PR.

---

## 3. Component Organization

### 3.1 The engine is not a component, and not a feature

The deterministic trading engine (fills, slippage, commission, position sizing, PnL, R-multiple) lives at **`/lib/engine`**, not inside `/features/simulator`. It is imported by the simulator, the replay feature, and the backtester, and compiled for the Edge Function that re-validates trades (ADR-007).

**MUST:** `/lib/engine` imports nothing from React, Next.js, Supabase, or any feature. It is a pure function of `(state, order, bar, config) → result`. It is the most-tested module in the codebase (§14). If it ever needs to know *who* is trading or *where* the result is stored, the abstraction has broken.

**MUST:** Every engine output carries `engineVersion`. Changing fill semantics = bump the version, never mutate history.

### 3.2 Composition rules

- Components MUST have one reason to change. A component that both fetches and renders complex layout has two.
- **Container/Presenter split:** the component that calls a query hook SHOULD NOT be the component with the complex JSX. Presenters take props and are trivially testable and Storybook-able.
- Props MUST be typed explicitly; no `any`, no `object`, no implicit spread of unknown shapes.
- **Prop drilling limit:** three levels. Beyond that, use composition (`children`) or a feature store. Do not reach for Context to solve a drilling problem that composition solves.
- **MUST NOT** define components inside other components' render bodies (remounts, kills memoization).

### 3.3 Size limits

Hard ceilings, enforced by ESLint where possible:

| Unit | Soft limit (SHOULD split) | Hard limit (MUST split; blocks merge) |
|---|---|---|
| React component file | 150 lines | 250 lines |
| Function / hook | 40 lines | 75 lines |
| Props on one component | 7 | 10 (else pass an object or compose) |
| Cyclomatic complexity | 8 | 12 |
| Nesting depth | 3 | 4 |

Line limits count JSX. Exceeding a hard limit requires either a split or an inline `// eslint-disable-next-line` **with a written justification and a TECHNICAL_DEBT.md entry** (§26). "It's just a big form" is not a justification.

**A note on the spirit:** these numbers exist to force the question "what are the two things this file is doing?" A 260-line component split into two 130-line components that are still tangled has satisfied the linter and failed the rule.

---

## 4. Server vs Client Components (ADR-001)

**Default: Server Component.** `"use client"` is a deliberate act, justified in the PR.

Reach for a Client Component only when the file needs: `useState`/`useReducer`/`useEffect`, event handlers, browser APIs, a charting canvas, or a Zustand/TanStack hook.

**MUST:** Push `"use client"` to the **leaves** of the tree. The lesson page is a Server Component; the `<Quiz>` inside it is a lazy-loaded Client Component. Marking a layout `"use client"` to fix one interactive button is a merge-blocking error — it drags the entire subtree into the bundle (RISKS R-5).

**MUST:** Data required for first paint is fetched in the Server Component and passed down as props, or streamed with Suspense. Client Components MUST NOT fetch data that could have been fetched on the server just to render it on mount.

**MUST NOT:** Import `/services/ai`, the Supabase service-role client, or any secret-bearing module into a Client Component. Secrets are Edge-Function-only (ADR-002/012). Any module touching `process.env.SUPABASE_SERVICE_ROLE_KEY` MUST carry `import 'server-only'`.

**Serialization:** props crossing the server→client boundary must be serializable. Convert `Date` and `numeric` at the boundary, once, in the service layer — never leak a Postgres `numeric` string into a component and parse it there.

---

## 5. State Management (ADR-005)

Five buckets. Every piece of state belongs to exactly one:

| Bucket | Owner | Example |
|---|---|---|
| Server state | TanStack Query | trades, lessons, progress, stats |
| Ephemeral client state | Zustand (per feature) | replay cursor, unsubmitted order ticket |
| URL state | `searchParams` | selected instrument, timeframe, date range |
| Form state | React Hook Form | order entry, journal entry |
| Session/theme | Supabase client + Context | auth session, theme |

**MUST NOT:** Copy server state into Zustand. Ever. If you find yourself writing `setTrades(data)` inside a `useEffect`, the bucket is wrong and a stale-data bug is already written.

**MUST:** Anything a user would expect to survive a page refresh or be shareable via link (selected symbol, timeframe, replay segment) lives in the URL, not in a store.

**MUST:** One store per feature, exported through the feature's `index.ts`. No global app store.

**Zustand stores MUST** keep actions and state colocated in the store, not scattered across components mutating with `set()`.

---

## 6. Data Fetching

**Reads.**
- Server Components call `/services` directly (which call Supabase with the user's session client, under RLS).
- Client Components read exclusively through TanStack Query hooks that live in `features/<x>/api/`.
- **MUST NOT:** call `supabase.from(...)` from a component. Ever. Components → hooks → services → Supabase (ARCHITECTURE Data Flow). A component containing a table name is a merge blocker.

**Query keys MUST** be produced by a per-feature factory, never string literals inline:

```ts
export const tradeKeys = {
  all: ['trades'] as const,
  list: (accountId: string) => [...tradeKeys.all, 'list', accountId] as const,
  detail: (id: string) => [...tradeKeys.all, 'detail', id] as const,
};
```
Ad-hoc keys are how invalidation silently stops working.

**Mutations MUST** declare their invalidations explicitly. Optimistic updates are permitted only for journal edits and order placement, and MUST implement rollback.

**MUST:** Every list query that can grow unbounded (trades, journal entries, candles) is paginated or range-limited from day one. No `select('*')` without an explicit column list on tables the user can grow. `select('*')` on `candles` is a performance incident waiting to happen.

**Defaults** (set once in the query client): `staleTime` 60s for reference data (instruments, lessons), 0 for trades/stats, retry 2 with exponential backoff, no refetch-on-window-focus for chart-heavy pages.

---

## 7. Error Handling

**Three classes, handled differently.**

1. **Expected domain errors** (insufficient balance, order below min size, lesson locked). MUST be modeled as typed results, not thrown: `type Result<T> = { ok: true; data: T } | { ok: false; error: DomainError }`. The engine (§3.1) returns rejections; it never throws. Rendered inline, near the control that caused them, in the user's language ("Order rejected: risk exceeds your 2% limit"), never a toast that disappears.
2. **Recoverable infrastructure errors** (network, 5xx). Caught by TanStack Query, retried, surfaced as a retryable UI state ("Couldn't load your trades. Retry.").
3. **Programmer errors** (invariant broken, impossible state). MUST throw. Caught by an error boundary at the route-segment level (`error.tsx` per feature route, never one global boundary). Logged with context. Users see a friendly message and a route back, never a stack trace.

**MUST:** Every Edge Function returns a typed error shape:
```ts
{ error: { code: 'RISK_LIMIT_EXCEEDED', message: string, details?: unknown } }
```
`code` is a stable machine-readable enum. The client switches on `code`, never on `message` text.

**MUST NOT:** `catch (e) {}`. **MUST NOT:** `catch (e) { console.log(e) }` and continue as if nothing happened. Swallowing an error in a system that teaches people about risk is thematically and literally unacceptable.

**MUST:** Validate at every trust boundary with Zod — client form, Edge Function entry, and any data crossing from an import script into the DB. The same Zod schema is shared between client and Edge Function (single definition in `/types` or the feature).

---

## 8. Logging Philosophy

**Log for the engineer debugging at 2am who cannot reproduce the bug.**

- **MUST:** structured logs only — `logger.error('trade_validation_failed', { userId, orderId, code })`. No string interpolation into log messages; the payload is an object.
- **Levels:** `error` (broken invariant / failed user action), `warn` (degraded but handled — e.g. fill resolved ambiguously per RISKS R-3), `info` (significant state transitions: trade materialized, XP granted, lesson completed), `debug` (dev only, stripped in prod).
- **MUST NOT** log: passwords, tokens, Supabase keys, full auth sessions, email addresses, or raw AI prompt/response bodies containing user journal text. Log IDs, not content.
- **MUST:** log every XP grant, every trade validation rejection, and every AI call (model, prompt_version, token count, latency, cost) — these are the three subsystems where silent misbehavior is most damaging and least visible.
- `console.log` is banned outside of local scripts (ESLint `no-console`). Use the `logger` module so the sink can be swapped later without touching call sites.
- **Observability is deferred, not forgotten:** v1 sink is Vercel/Supabase logs. The `logger` abstraction exists precisely so adopting a real platform later is a one-file change. (See §26 debt register, and the ADR proposed in the review.)

---

## 9. TypeScript Standards

- `strict: true`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`. Non-negotiable, set in M-1.
- **`any` is banned.** Not discouraged — banned, at the lint level. Use `unknown` and narrow. The single permitted escape is a third-party type gap, which requires an inline comment and a debt entry.
- **MUST NOT** use non-null assertion (`!`) to silence the compiler. If a value can be null, handle it. `!` is a lie told to the type system and it will be believed.
- **MUST NOT** use `as` to force a shape. `as const` and narrowing casts after a runtime check are fine; `data as Trade[]` on an unvalidated response is not — parse it with Zod.
- Database types are **generated** (`supabase gen types typescript`), committed, and regenerated in the same PR as any migration. Hand-written DB types are forbidden — they drift.
- **Domain types over primitives.** Money, prices, and quantities MUST NOT be bare `number` passed interchangeably. Use branded types:
  ```ts
  type Price = number & { readonly __brand: 'Price' };
  type Quantity = number & { readonly __brand: 'Quantity' };
  ```
  This prevents the entire class of "multiplied price by price" bugs — which, in a trading app, produce plausible-looking wrong numbers rather than crashes. Plausible-looking wrong numbers teach users incorrect lessons (Rule 8).
- **Money arithmetic MUST NOT use floating point.** Postgres stores `numeric`. TypeScript works in **integer minor units** (cents / satoshis) inside the engine and converts only at the display boundary. `0.1 + 0.2 !== 0.3` is not an acceptable source of a P&L discrepancy in software that teaches accounting discipline.
- Prefer `type` over `interface` except for extensible public component props. Discriminated unions over boolean flag soup. Exhaustive `switch` with a `never` default.

---

## 10. Styling

- Tailwind utility classes in the markup. No CSS modules, no styled-components, no inline `style` (exception: dynamic chart geometry computed at runtime).
- **MUST NOT** hardcode a hex color, spacing value, or font size in a component. All values come from design tokens in the Tailwind config: `bg-surface`, `text-danger`, `text-muted`. A raw `#22c55e` in a component is a merge blocker — it will be the one green that doesn't change when the theme does.
- **Semantic color tokens, not raw palette:** `success`/`danger` (not `green`/`red`) — some users invert chart colors, and the token indirection is what makes that a config change instead of a codebase sweep.
- Dark mode first; every component MUST be checked in both themes before merge.
- Conditional classes via `cn()` (clsx + tailwind-merge). No string concatenation of class names.
- Class order enforced by `prettier-plugin-tailwindcss`. Not a style opinion — a diff-noise reduction.
- Chart colors come from one exported palette module shared by Lightweight Charts and Tailwind, so a candle's green and a stat's green are the same green.

---

## 11. Accessibility (Constitution Rule 14 — a requirement, not a phase)

Per-milestone Definition of Done, not a Phase 11 cleanup.

- **MUST:** Semantic HTML first. A `<div onClick>` that should be a `<button>` is a defect.
- **MUST:** Every interactive element reachable and operable by keyboard; visible focus ring (never `outline: none` without a replacement); logical tab order; Escape closes overlays; focus trapped in modals and returned on close.
- **MUST:** WCAG **AA** contrast (4.5:1 text, 3:1 UI). Verified in both themes.
- **MUST NOT:** convey information by color alone. A red candle and a green candle must also differ by label/position/pattern for the ~8% of men with color-vision deficiency — in a product whose entire subject matter is red and green, this is a first-class design constraint, not an edge case.
- **MUST:** Form inputs have associated `<label>`s; errors linked via `aria-describedby`; `aria-live="polite"` for async results (order filled, quiz graded).
- **MUST:** `prefers-reduced-motion` respected globally (§13).
- **Canvas charts are inaccessible by nature.** Every chart MUST have a text alternative: a summary (`aria-label` describing the instrument, range, and trend) and, where the chart carries lesson-critical data, an accessible data table behind a toggle. A blind user must be able to complete a lesson.
- Axe checks run in CI on key routes; keyboard-only manual pass is part of each milestone's DoD.

---

## 12. Performance

**Budgets** (measured; a budget nobody measures is a wish):

| Metric | Budget |
|---|---|
| LCP (dashboard, lessons) | < 2.0s on 4G |
| INP | < 200ms |
| Initial JS (non-chart route) | < 180KB gzipped |
| Chart bundle | lazy, never in the shared chunk |
| Replay playback | 60fps at 8× speed |
| Dashboard stats query | < 100ms server-side |

- **MUST:** the charting library is `next/dynamic` with `ssr: false`, loaded only on routes that chart. If Lightweight Charts appears in the shared bundle, the build fails.
- **MUST:** lesson interactive embeds are lazy Client Components (RISKS R-5).
- **MUST:** stats read the materialized `trades` table; never recompute from `executions` on page load.
- **MUST:** candle queries always bound by instrument + timeframe + time range, hitting the composite index. An unbounded candle read is a merge blocker.
- **Backtests run in a Web Worker.** A backtest that freezes the main thread is a failed feature regardless of its results.
- **MUST:** measure before optimizing. No `useMemo`/`memo` sprinkling without a profile showing a problem — premature memoization adds cost and hides the real bottleneck. Exception: memoizing the chart's data transform, where the need is known.
- **MUST NOT** ship a loading spinner where a skeleton conveys structure. Perceived performance is performance.

---

## 13. Animation

Framer Motion, sparingly (ARCHITECTURE).

- Permitted: page/route transitions, hover/press feedback, skeleton shimmer, XP/streak reward moments, chart replay tick.
- **MUST NOT** animate for decoration alone (Constitution Rule 1: every animation has a purpose).
- Durations: 150ms micro-interaction, 200–300ms transitions, 400ms max for reward celebrations. Nothing blocks input.
- **MUST** respect `prefers-reduced-motion`: animations reduce to instant state changes, never to broken layout. Implemented once in a shared hook, not per component.
- **MUST NOT** animate `width`/`height`/`top`/`left`. Transform and opacity only (compositor-friendly).
- **Domain rule:** never animate a P&L number counting up in a way that celebrates the size of a win. That is a slot machine, and Rule 7 forbids it. Celebrate *streaks, discipline, and plan adherence* — never the number in the profit column.

---

## 14. Testing (ADR-010)

**The rule that matters:** in software that teaches, a wrong number is worse than a crash. A crash gets reported. A wrong win-rate gets *believed*.

Priority pyramid:

1. **Pure domain logic — `/lib/engine`, stats, XP, position sizing: ~100% branch coverage, MUST.**
   Test cases MUST be **hand-computed** and the expected value documented inline with the arithmetic shown. Generating expectations by running the code is not a test; it is a snapshot of the bug.
   ```ts
   // Long 100 @ 50.00, stop 49.00 → risk $100. Exit 52.00 → profit $200 → R = 2.0
   expect(rMultiple(trade)).toBe(2.0);
   ```
   Bar-path ambiguity (RISKS R-3) MUST have explicit tests proving the conservative resolution and the flag.
2. **Integration:** Edge Functions (XP idempotency: granting twice grants once), and **RLS policies — user A cannot read user B's trades.** This is a security test and it is mandatory per table.
3. **E2E (Playwright), critical paths only:** signup → lesson → quiz → XP; replay → trade → journal; dashboard loads.
4. **Component tests:** only for genuinely complex interactive components (order ticket, quiz).

- Coverage thresholds are enforced per-directory, not globally. A global 80% target lets 100% coverage of trivial UI hide 40% coverage of the fill engine.
- **MUST:** every bug fix ships with a regression test that fails without the fix. No exceptions.
- Tests MUST NOT mock the module under test's own logic. Mock I/O boundaries (Supabase, AI provider), never the engine.
- CI blocks merge on typecheck + lint + unit + integration. E2E runs on `main`.

---

## 15. Documentation

- **Every feature ships a `README.md`** with: Purpose · Architecture · Public API · Extension guide · Known limitations. A feature without one is not done (ARCHITECTURE, Master Prompt).
- **Comments explain *why*, never *what*.** `// increment i` is noise. `// Resolve against the trader: with daily bars we cannot know whether the stop or target was hit first (RISKS R-3)` is the most valuable line in the file.
- **MUST:** any non-obvious domain rule carries a citation to its source doc (ADR-nnn, RISKS R-n, Constitution Rule n). Future maintainers must be able to trace a weird-looking line back to the decision that demanded it.
- JSDoc on every exported function in `/lib/engine` and `/utils`, including units (`@param price - in minor units (cents)`).
- **MUST:** ADRs are immutable. A changed decision means a *new* ADR marked `Supersedes ADR-nnn`, and the old one gets `Status: Superseded by ADR-mmm`. Editing an accepted ADR destroys the record of why we once thought otherwise — which is the entire point of an ADR.
- Migrations carry a header comment explaining intent, not just DDL.

---

## 16. Reusable Component Philosophy

- **Rule of three, strictly:** write it inline. Second use, copy it. **Third use, abstract it.** A premature abstraction with a `variant` prop and four booleans costs more than three copies ever would.
- **MUST NOT** generalize a component until the second and third use cases are *in front of you*. Speculative flexibility is the most expensive kind.
- Shared components MUST NOT know about trading domain concepts. `<DataTable>` is shared. `<TradeTable>` is a feature component that uses `<DataTable>`. If a component in `/components` imports a type from `/features`, the layering has inverted.
- Prefer **composition over configuration**. `<Card><CardHeader/><CardBody/></Card>` beats `<Card header={...} showBody variant="compact" />`. When a component grows a fifth boolean prop, it is two components wearing a trenchcoat.
- shadcn/ui components are *ours* once generated. Edit them freely; document non-trivial edits in the component file header.

---

## 17. Hooks

- A hook exists to encapsulate **stateful logic that is genuinely reused, or genuinely complex**. Wrapping a single `useState` in `useThing()` for symmetry is indirection with no payoff.
- **MUST** be named `useX`, live in `features/<x>/hooks/` (or `/hooks` only if cross-feature), and return a **named object**, not a positional array of >2 items.
- **MUST NOT** contain JSX.
- **MUST** obey the rules of hooks — the ESLint rule is `error`, never disabled. A disabled `exhaustive-deps` is a stale-closure bug that has not been discovered yet. If deps are genuinely wrong, restructure; do not silence.
- `useEffect` is a **last resort**, and its use requires a comment explaining why it is unavoidable. It is not for: deriving state (compute in render), fetching (TanStack Query), or reacting to a prop change (usually a key or a derived value). Effects synchronize with things *outside* React — the chart library, a subscription, a timer.
- Data-fetching hooks live in `features/<x>/api/` and are named after the resource (`useTradeList`, `useTradeDetail`).

---

## 18. Utility Functions

- **Pure. Deterministic. No I/O. No `Date.now()`, no `Math.random()`.** Time and randomness are **injected**, always. This is not fussiness: the replay engine, the fill engine, and every backtest are only reproducible if the code cannot reach for the wall clock. A single hidden `Date.now()` in the engine makes every backtest unrepeatable and every bug unreproducible.
- Grouped by domain in `/utils/<domain>.ts` (`format-currency.ts`, `date-market.ts`), never a junk drawer.
- One exported function per concern; each independently unit-tested.
- **MUST NOT** duplicate a library that is already a dependency (`date-fns`, `lodash-es`). Writing your own `groupBy` is not craftsmanship.
- Market-time and timezone handling MUST use the shared date module; naive `new Date()` arithmetic on market timestamps is banned (RISKS R-6 — the streak/DST bug class).

---

## 19. Database Access

- **The layering is absolute:** UI → hooks → services → Supabase. Components never see a table name (§6).
- **Reads:** through the user-scoped Supabase client, under RLS. RLS is the security boundary, not the query (ADR-012). A query that "forgets" to filter by `user_id` must still return nothing — if it doesn't, the policy is broken, and that is the bug.
- **Privileged writes** (XP grants, trade materialization, achievement grants, AI calls) go **exclusively** through Edge Functions with the service role (ADR-002/009/012). The anon key MUST NOT be able to insert into `xp_events` — verify with an integration test that *attempts it and asserts failure*.
- **Every table ships with its RLS policies in the same migration that creates it.** A migration adding a table without policies is a merge blocker (ADR-012). Default deny.
- **Migrations are forward-only and immutable once merged.** Fix mistakes with a new migration. Never edit a migration that has run anywhere but your laptop.
- **MUST NOT** write raw SQL in application code. Queries go through the Supabase client or a Postgres function; complex reporting reads live in views or RPCs, versioned in migrations.
- **Money and prices: `numeric` in Postgres, never `float`/`double precision`.** Enforced at review.
- **Idempotency:** any write that can be triggered twice by a retry or double-click (XP grant, trade materialization) MUST have a unique constraint that makes the second write a no-op. Defensive UI is not a substitute for a database constraint.
- Soft delete only where ADR-011 permits (`journal_entries`, `trades`, `strategies`); the `deleted_at IS NULL` filter lives in a shared query helper or a view, **never** re-typed per call site — that is how deleted rows eventually reappear in one forgotten query.

---

## 20. API Routes & Edge Functions

- **Next.js Route Handlers are thin adapters only** (ADR-002). Permitted uses: webhooks, OAuth callbacks, MDX/OG generation. **MUST NOT** contain business logic or a service-role key. If a Route Handler is doing real work, it should have been an Edge Function.
- **Edge Functions own all privileged logic.** One function per capability, `kebab-case` folder, `index.ts` entry: `grant-xp`, `validate-trade`, `generate-coach-review`, `delete-account`.
- Every Edge Function MUST:
  1. Verify the JWT and derive `userId` **from the token**, never from the request body. (Trusting a client-supplied `userId` is the single most common way an app becomes an open database.)
  2. Validate input with the shared Zod schema.
  3. Return the typed error shape (§7) with a stable `code`.
  4. Be idempotent where the operation can repeat.
  5. Log its outcome structurally (§8).
- **MUST:** rate-limit any function that costs money (`generate-coach-review`) — per-user and global monthly ceilings (RISKS R-4). An unbounded AI endpoint is a billing incident with a countdown.
- Versioning: breaking a function's contract means a new function or a version field, never a silent shape change.

---

## 21. Git & Commits

- **Conventional Commits**, enforced by commitlint:
  `feat|fix|refactor|perf|test|docs|chore|build|ci(scope): imperative summary`
  Scope = milestone or feature: `feat(simulator): add stop-loss to order ticket`.
- **MUST** reference the milestone in the body: `Milestone: M-8`. Non-obvious decisions get a `Why:` line. Debt incurred gets `Debt: TD-nn`.
- Branches: `m8/fill-engine`, `fix/streak-dst`.
- **Small, atomic commits.** A commit does one thing and leaves the tree green. "WIP" commits are squashed before merge.
- **PRs are small** (target < 400 lines changed). A large PR does not get reviewed; it gets approved.
- Merge to `main` requires: green CI, updated docs, updated migration types, self-review pass against the DoD (§23).
- **MUST NOT** commit `.env`, keys, or generated artifacts. Secrets are pushed to Supabase/Vercel, never to git.
- **PR template MUST include:** milestone, what changed, DoD checklist, screenshots (both themes), a11y pass, debt incurred.

*(Solo-developer note: these are not team ceremony. The reviewer you are writing for is yourself in three months, who will remember none of this. The commit message is the only thing that will still be there.)*

---

## 22. Refactoring

- **Refactoring is a separate commit from behavior change. Always.** A PR that renames things *and* changes logic is unreviewable and un-bisectable.
- **Refactor when you have a reason:** the rule of three has fired, a size limit was hit, a bug revealed a bad seam, or you are about to build on top of it. **Do not refactor because code is old, or unfashionable, or not how you would write it today.** Working, tested, boring code is an asset.
- **The Boy Scout rule, bounded:** improve what you touch, within the scope of your task. Do not open a 900-line "while I was in there" PR.
- **MUST NOT** refactor without test coverage on the code being changed. Write the characterization test first, then move. Refactoring untested code is rewriting it while hoping.
- Large refactors get a plan in the PR description and, if they change an architectural decision, a superseding ADR before any code.

---

## 23. Definition of Production-Ready

A **change** is production-ready when *all* of the following are true. This is the canonical list; other documents defer to it.

- [ ] Works, including the unhappy paths and empty/loading/error states
- [ ] Typechecks under `strict`; zero `any`; zero suppressed lint rules without justification
- [ ] Unit-tested per §14 (engine/stats/XP: ~100% branches, hand-computed)
- [ ] Integration-tested if it crosses a trust boundary; RLS asserted if it touches a new table
- [ ] Responsive: 360px → 1920px
- [ ] Accessible: keyboard-only pass, AA contrast, labels, focus management, reduced-motion (§11)
- [ ] Both themes verified
- [ ] Within performance budgets (§12); no new library in the shared bundle
- [ ] Errors typed and surfaced usefully (§7); nothing swallowed
- [ ] Structured logs on significant transitions (§8); no secrets logged
- [ ] Migration + RLS policies + regenerated DB types, if schema changed
- [ ] Feature README updated; non-obvious decisions cited to their ADR
- [ ] No new technical debt, or debt entered in `TECHNICAL_DEBT.md` with an owner and a proposed fix (Constitution Rule 17)
- [ ] Constitution check: does this make the user a better trader, and does it avoid rewarding profit over process? (Rules 3, 7, 11)

**Not production-ready:** "works on my machine," "tests later," "I'll add the loading state in polish," "accessibility in Phase 11."

## 24. Definition of Feature Complete

A **milestone** is feature complete when:

- [ ] Every checklist item in `FEATURE_ROADMAP.md` for that M-x is done and ticked ✅
- [ ] Every change within it is production-ready (§23)
- [ ] The milestone's acceptance test (where the roadmap defines one, e.g. M-6's end-to-end lesson) passes
- [ ] It delivers a **usable increment** — a user could sit down and get value from it today
- [ ] It does not depend on unfinished work in a later milestone to be coherent
- [ ] Docs updated: roadmap status, feature README, any new ADR
- [ ] Debt register reviewed: nothing new that blocks the next milestone on the critical path

**One milestone in progress at a time** (FEATURE_ROADMAP Development Principles). Starting M-9 with M-8 at 90% is how a solo project acquires three 90%-done features and zero shippable ones.

---

## 25. New Dependencies

Adding a dependency is a permanent decision made in a moment. Treat it accordingly.

**Before adding, answer in the PR:**
1. What does it do that we cannot do in ~100 lines we would actually understand?
2. Bundle cost (bundlephobia), and does it land in the shared chunk?
3. Maintenance: last release, open issues, single maintainer? A dead dependency in the critical path becomes *our* code, on the worst possible day.
4. License: MIT/Apache/BSD only. **No copyleft. No ambiguous license. No "source available."** (This applies with force to **market data** — see RISKS R-1: data licensing is the project's only remaining true blocker, and a dependency that smuggles in unlicensed data is a legal problem, not a technical one.)
5. Does it duplicate something we already have? (We already have: `date-fns`, `zod`, `lodash-es`, `clsx`. We do not need a second one.)
6. What is the exit plan if it is abandoned? Is it behind an abstraction (like `services/ai`, ADR-003) or scattered through the codebase?

**MUST:** any dependency touching money math, dates/timezones, or auth gets extra scrutiny and an abstraction layer.
**MUST NOT:** add a dependency to save writing a `groupBy`, a `formatCurrency`, or a `useDebounce`.
**MUST NOT:** add a UI component library other than shadcn/Radix. Two design systems is worse than one imperfect one.
**MUST:** pin exact versions in `package.json` (no `^`) and update deliberately via a scheduled dependency PR — not accidentally, at 1am, in a feature branch.
Dependencies are reviewed once per phase; anything unused is removed the day it becomes unused.

---

## 26. Technical Debt

Constitution Rule 17: debt is permitted, but only if it is **intentional, visible, and temporary.**

**MUST:** any shortcut ships with an entry in `/docs/TECHNICAL_DEBT.md`:

```md
### TD-07 · Coach reviews have no per-user monthly cost ceiling
- **Incurred:** M-14, 2026-08-xx · **Why:** shipping the coach was gated on it; the
  global ceiling exists, per-user does not.
- **Risk if unpaid:** one user can consume the monthly AI budget (RISKS R-4).
- **Proposed fix:** per-user counter in `ai_reviews`, checked in the Edge Function. ~2h.
- **Trigger to pay:** before any public/multi-user launch. Blocks nothing before then.
- **Owner:** Christian
```

- A `TODO` in code without a `TD-nn` reference is banned by lint. An unreferenced TODO is a wish, not a plan.
- Debt is reviewed at every milestone boundary. **Debt that blocks the critical path is paid before the next milestone starts** — not "someday."
- **Debt that MUST NOT be taken, ever** (these are not shortcuts, they are the product being wrong):
  - Skipping RLS on a table "for now"
  - Skipping tests on the fill engine, stats formulas, or XP grants
  - Trusting a client-supplied `userId`
  - Floating-point money arithmetic
  - Shipping a wrong number rather than no number
  - Anything violating `NON_NEGOTIABLES.md`
- If the debt list grows faster than it shrinks for two consecutive milestones, **stop feature work and pay it down.** That trend is the leading indicator of a project that will be abandoned.

---

## Final principle

Every rule here exists to make the *next* decision obvious, so that judgment can be spent on the problems that actually deserve it: whether the lesson teaches, whether the simulation is honest, and whether the numbers are right.

When a rule stops serving that end, change the rule — in a PR, with a reason, in writing.
