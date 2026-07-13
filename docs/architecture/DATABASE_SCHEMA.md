# DATABASE_SCHEMA.md

# Trading Academy — Normalized PostgreSQL Schema (v1)

Scope: Phases 1–6. Every table lists purpose, key relationships, and design reasoning.
Conventions (per ARCHITECTURE.md + ADR-011/012): UUID PKs (`gen_random_uuid()`), `created_at`/`updated_at` on every table, RLS enabled everywhere, soft delete only where noted. All tables indexed on `user_id` where present.

Phase tags show when each table is first needed — nothing must be built before its phase.

---

## 1. Identity & Profile — Phase 1

### `profiles`
Extends `auth.users` (Supabase-managed). One row per user, created by trigger on signup.

```sql
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null check (char_length(username) between 3 and 24),
  display_name  text,
  timezone      text not null default 'UTC',          -- streak day boundaries (ADR-009)
  avatar_url    text,
  xp_total      bigint not null default 0,            -- denormalized sum of xp_events (trigger-maintained)
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
```

**Why:** Auth data stays in `auth.users`; app data lives here (normalization + Supabase convention). `xp_total` is the one deliberate denormalization in the schema — read on every page load, so summing the ledger each time is wasteful; the trigger keeps it consistent. Level is *not* stored (pure function of `xp_total`, ADR-009).

### `user_settings`
```sql
create table user_settings (
  user_id             uuid primary key references profiles(id) on delete cascade,
  theme               text not null default 'dark' check (theme in ('dark','light','system')),
  default_risk_pct    numeric(5,2) not null default 1.00 check (default_risk_pct between 0.1 and 5),
  default_commission  numeric(10,4) not null default 0,
  default_slippage_bp integer not null default 2,
  updated_at          timestamptz not null default now()
);
```
**Why separate from profiles:** settings change often and independently; keeps `profiles` reads cache-friendly. `default_risk_pct` capped at 5% — a schema-level expression of Rule 7 (never encourage reckless risk).

---

## 2. Market Data (reference, read-only to users) — Phase 1 (foundation for 3+)

### `instruments`
```sql
create table instruments (
  id          uuid primary key default gen_random_uuid(),
  symbol      text not null,
  asset_class text not null check (asset_class in ('stock','etf','crypto','forex','future')),
  name        text not null,
  currency    text not null default 'USD',
  tick_size   numeric(18,8) not null default 0.01,
  point_value numeric(18,8) not null default 1,       -- for futures later
  is_active   boolean not null default true,
  unique (symbol, asset_class)
);
```
**Why:** every trade/candle/replay references an instrument; `tick_size`/`point_value` let the fill engine (ADR-007) round realistically per asset class.

### `candles`
```sql
create table candles (
  instrument_id uuid not null references instruments(id),
  timeframe     text not null check (timeframe in ('1m','5m','15m','1h','4h','1d','1w')),
  ts            timestamptz not null,                 -- bar open time, UTC
  open  numeric(18,8) not null,
  high  numeric(18,8) not null,
  low   numeric(18,8) not null,
  close numeric(18,8) not null,
  volume numeric(24,4) not null default 0,
  primary key (instrument_id, timeframe, ts)
);
create index candles_lookup on candles (instrument_id, timeframe, ts desc);
```
**Why composite natural PK:** candles are never referenced individually by other tables; the natural key prevents duplicates on re-import and is exactly the query pattern (range scans by instrument+timeframe). No UUID needed — the one justified exception to the UUID convention. Seeded by import scripts (ADR-006).

### `dataset_segments`
```sql
create table dataset_segments (
  id            uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references instruments(id),
  timeframe     text not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  title         text not null,            -- "SPY — March 2020 Crash"
  description   text,
  difficulty    text check (difficulty in ('beginner','intermediate','advanced')),
  tags          text[] not null default '{}'
);
```
**Why:** the curated "interesting markets" catalog (ADR-006). Lessons and replay sessions point at segments so exercises are reproducible for every user.

---

## 3. Learning — Phase 2

### `lessons`
Metadata only — content is MDX in the repo (ADR-008). Synced from frontmatter at build time.
```sql
create table lessons (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  track         text not null,             -- 'market-basics', 'candlesticks', ...
  title         text not null,
  position      integer not null,          -- order within track
  xp_reward     integer not null default 50,
  est_minutes   integer not null default 10,
  is_published  boolean not null default false,
  unique (track, position)
);
```

### `lesson_prerequisites`
```sql
create table lesson_prerequisites (
  lesson_id       uuid not null references lessons(id) on delete cascade,
  prerequisite_id uuid not null references lessons(id) on delete cascade,
  primary key (lesson_id, prerequisite_id),
  check (lesson_id <> prerequisite_id)
);
```
**Why a join table (not an array column):** prerequisites are many-to-many and must be queryable in both directions ("what does this unlock?") with referential integrity — arrays give neither. Powers progressive unlocking (Vision: Progressive Learning).

### `lesson_progress`
```sql
create table lesson_progress (
  user_id      uuid not null references profiles(id) on delete cascade,
  lesson_id    uuid not null references lessons(id) on delete cascade,
  status       text not null default 'in_progress' check (status in ('in_progress','completed')),
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, lesson_id)
);
```

### `quiz_attempts`
Question definitions live in MDX (ADR-008); only user answers persist.
```sql
create table quiz_attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  lesson_id    uuid not null references lessons(id) on delete cascade,
  question_key text not null,              -- stable id from MDX frontmatter
  answer       jsonb not null,
  is_correct   boolean not null,
  attempt_no   integer not null default 1,
  created_at   timestamptz not null default now()
);
create index quiz_attempts_user_lesson on quiz_attempts (user_id, lesson_id);
```
**Why jsonb answer:** question types vary (MCQ, fill-in, scenario); the answer shape is owned by the question component. Correctness is computed at submit time and frozen, so later question edits don't rewrite history.

---

## 4. Simulator & Replay — Phase 3

### `sim_accounts`
```sql
create table sim_accounts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  name             text not null default 'Main',
  starting_balance numeric(18,2) not null default 100000,
  balance          numeric(18,2) not null,             -- cash after realized PnL
  currency         text not null default 'USD',
  is_default       boolean not null default false,
  created_at       timestamptz not null default now()
);
```
**Why multiple accounts per user:** lets users reset cleanly or keep a "lesson account" separate from a "free practice" account without destroying stats history.

### `replay_sessions`
```sql
create table replay_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  sim_account_id uuid not null references sim_accounts(id),
  segment_id    uuid references dataset_segments(id),  -- null = free-form replay
  instrument_id uuid not null references instruments(id),
  timeframe     text not null,
  cursor_ts     timestamptz,                           -- resume position
  status        text not null default 'active' check (status in ('active','completed','abandoned')),
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);
```
**Why:** replay is resumable (users have 1–2 hr sessions, interruptions expected) and links trades to the exact historical context they were made in.

### `orders`
```sql
create table orders (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  sim_account_id uuid not null references sim_accounts(id),
  replay_session_id uuid references replay_sessions(id),
  instrument_id  uuid not null references instruments(id),
  side           text not null check (side in ('buy','sell')),
  type           text not null check (type in ('market','limit','stop')),
  quantity       numeric(18,8) not null check (quantity > 0),
  limit_price    numeric(18,8),
  stop_price     numeric(18,8),
  status         text not null default 'open' check (status in ('open','filled','partially_filled','cancelled','rejected')),
  placed_at_ts   timestamptz not null,                 -- market time (replay), not wall clock
  created_at     timestamptz not null default now()
);
```

### `executions`
```sql
create table executions (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders(id) on delete cascade,
  fill_ts        timestamptz not null,                 -- market time of fill
  fill_price     numeric(18,8) not null,
  quantity       numeric(18,8) not null,
  commission     numeric(12,4) not null default 0,
  slippage       numeric(18,8) not null default 0,
  engine_version text not null                          -- ADR-007: fills stay interpretable
);
```
**Why orders/executions split (not one "trade" row):** partial exits and realistic fills (roadmap Phase 3, Rule 9) require one order → many executions. This is the normalized core; everything else is derived.

### `trades`
A closed round-trip, materialized by the Edge Function when a position fully closes. Soft delete (ADR-011).
```sql
create table trades (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  sim_account_id uuid not null references sim_accounts(id),
  replay_session_id uuid references replay_sessions(id),
  instrument_id  uuid not null references instruments(id),
  direction      text not null check (direction in ('long','short')),
  entry_ts       timestamptz not null,
  exit_ts        timestamptz not null,
  avg_entry      numeric(18,8) not null,
  avg_exit       numeric(18,8) not null,
  quantity       numeric(18,8) not null,
  gross_pnl      numeric(18,2) not null,
  fees           numeric(12,4) not null default 0,
  net_pnl        numeric(18,2) not null,
  r_multiple     numeric(8,2),                          -- realized R vs initial risk; null if no stop set
  planned_stop   numeric(18,8),
  planned_target numeric(18,8),
  engine_version text not null,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index trades_user_time on trades (user_id, exit_ts desc) where deleted_at is null;
```
**Why materialize despite normalization:** statistics (win rate, expectancy, profit factor) and the journal all operate on round-trips. Recomputing them from executions on every dashboard load violates Rule 15. `trades` is a *derived cache with provenance* — executions remain the source of truth. `r_multiple` + `planned_stop` make process-quality (Rule 3) measurable: a trade with no stop is flaggable regardless of PnL.

### `trade_orders`
```sql
create table trade_orders (
  trade_id uuid not null references trades(id) on delete cascade,
  order_id uuid not null references orders(id),
  primary key (trade_id, order_id)
);
```
**Why:** provenance link so any stat can be audited back to raw fills.

---

## 5. Journal — Phase 4

### `journal_entries`
Soft delete (ADR-011).
```sql
create table journal_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  trade_id     uuid references trades(id),              -- null = general/session note
  title        text,
  setup        text,                                    -- what was the plan
  reasoning    text,
  outcome_review text,
  confidence   smallint check (confidence between 1 and 5),
  followed_plan boolean,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
```
**Why `followed_plan` as a first-class column:** it's the single most important process metric (Rule 3) and must be aggregable, not buried in free text.

### `emotions` + `journal_emotions`
```sql
create table emotions (
  id    uuid primary key default gen_random_uuid(),
  key   text unique not null,        -- 'fomo','fear','revenge','confidence','hesitation'...
  label text not null
);
create table journal_emotions (
  entry_id   uuid not null references journal_entries(id) on delete cascade,
  emotion_id uuid not null references emotions(id),
  intensity  smallint check (intensity between 1 and 5),
  primary key (entry_id, emotion_id)
);
```
**Why normalized (not a text[] column):** the AI coach and psychology trainer need to query "show every trade tagged `revenge` and its aggregate PnL." A controlled vocabulary makes emotional patterns analyzable across the whole user base of one user's history; free text doesn't.

### `journal_attachments`
```sql
create table journal_attachments (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references journal_entries(id) on delete cascade,
  storage_path text not null,          -- Supabase Storage object
  kind         text not null default 'screenshot',
  created_at   timestamptz not null default now()
);
```
**Why:** hard-deletes with parent; binary lives in Storage, DB holds only the pointer (normalization + Storage best practice).

### `mistake_tags` + `journal_mistakes`
Same pattern as emotions (`key`: 'moved_stop', 'oversized', 'no_plan', 'chased_entry'...). **Why:** recurring-mistake detection is the AI coach's core feature (Rule 18: identify recurring patterns); it needs structured data.

---

## 6. Gamification — Phase 2 (XP) / Phase 8 (full)

### `xp_events`
Append-only ledger (ADR-009). Insert-only via Edge Functions; no update/delete policies exist.
```sql
create table xp_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  amount      integer not null check (amount > 0),
  reason      text not null,            -- 'lesson_completed','journal_completed','risk_limit_respected'...
  source_type text not null,            -- 'lesson','trade','challenge','achievement'
  source_id   uuid not null,
  created_at  timestamptz not null default now(),
  unique (user_id, reason, source_type, source_id)   -- idempotency: no double-grants
);
```
**Note:** there is intentionally no `trade_profit` reason. XP rewards process, never PnL (Rule 3/7).

### `activity_log`
```sql
create table activity_log (
  user_id       uuid not null references profiles(id) on delete cascade,
  activity_date date not null,           -- in user's timezone at time of activity
  primary key (user_id, activity_date)
);
```
**Why:** streaks computed from facts, not maintained as a fragile counter (ADR-009). Upserted on any qualifying activity.

### `achievements` + `user_achievements`
```sql
create table achievements (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,      -- 'first_trade','risk_manager',...
  title       text not null,
  description text not null,
  xp_reward   integer not null default 0,
  criteria    jsonb not null             -- machine-readable rule evaluated server-side
);
create table user_achievements (
  user_id        uuid not null references profiles(id) on delete cascade,
  achievement_id uuid not null references achievements(id),
  earned_at      timestamptz not null default now(),
  primary key (user_id, achievement_id)
);
```

### `challenges` + `user_challenges`
```sql
create table challenges (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,      -- 'ten_disciplined_trades'
  title       text not null,
  description text not null,
  cadence     text not null check (cadence in ('daily','weekly','standing')),
  criteria    jsonb not null,
  xp_reward   integer not null default 0
);
create table user_challenges (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  challenge_id uuid not null references challenges(id),
  assigned_at  timestamptz not null default now(),
  expires_at   timestamptz,
  progress     jsonb not null default '{}',
  status       text not null default 'active' check (status in ('active','completed','failed','expired')),
  completed_at timestamptz
);
```
**Why jsonb criteria/progress:** challenge rules vary structurally ("maintain 2:1 RR over 10 trades" vs "journal every trade this week"). A rigid columns-per-rule-type design would need migration per new challenge type; jsonb evaluated by versioned server code is the pragmatic normalized-enough choice. Definitions are still relational so challenges are reusable across users (no duplicated definition data).

---

## 7. AI Coach — Phase 5

### `ai_reviews`
```sql
create table ai_reviews (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  scope        text not null check (scope in ('trade','session','weekly')),
  trade_id     uuid references trades(id),
  content      text not null,
  model        text not null,
  prompt_version text not null,          -- ADR-003: prompts are versioned artifacts
  created_at   timestamptz not null default now()
);
```
**Why cached in DB:** reviews are expensive to generate (RISKS R-4); generated once per trade on demand, then reread freely. `prompt_version` lets us know which mentor persona produced old feedback.

---

## 8. Strategy & Backtesting — Phase 6 (schema reserved, build later)

`strategies` (user_id, name, definition jsonb, version, deleted_at) → `backtests` (strategy_id, segment/instrument range, config jsonb, status) → `backtest_trades` (same shape as `trades`, FK to backtest instead of sim_account, no soft delete).

**Why `backtest_trades` is a separate table rather than a flag on `trades`:** backtest results are bulk, disposable, and regenerated; mixing them with real practice trades would force every stats/journal/XP query to filter them and risks polluting learning analytics. Same engine, same shape, different lifecycle → different table.

---

## Relationship Map (summary)

```
auth.users 1—1 profiles 1—1 user_settings
profiles 1—* sim_accounts 1—* orders 1—* executions
orders *—* trades (via trade_orders)     trades 1—0..1 journal_entries
replay_sessions —> dataset_segments —> instruments 1—* candles
lessons *—* lessons (prerequisites)      profiles *—* lessons (lesson_progress)
profiles 1—* xp_events / activity_log / quiz_attempts / ai_reviews
profiles *—* achievements, challenges (via user_* tables)
journal_entries *—* emotions / mistake_tags
strategies 1—* backtests 1—* backtest_trades
```

## Open items deliberately deferred
- Portfolio simulator tables (Phase 10) — will reuse `sim_accounts`/`orders`; design when Phase 6 learnings exist.
- Partitioning `candles` by instrument — only if row count exceeds ~50M (ADR-006 estimate says it won't).
