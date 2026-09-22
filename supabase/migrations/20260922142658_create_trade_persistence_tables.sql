-- Trade persistence layer (DATABASE_SCHEMA.md §4: orders, executions, trades,
-- trade_orders) and its RLS policies (ADR-012 -- every table ships with
-- policies in the same migration that creates it). M-11 Session 1.
--
-- Unlike sim_accounts (ordinary user data, client-writable -- see that
-- migration's own comment), these four tables are the privileged-write side
-- of the simulator: ADR-007 requires every fill to be re-validated
-- server-side before it's persisted, and ENGINEERING_PRINCIPLES §19 says
-- privileged writes (trade materialization named explicitly) happen
-- exclusively through Edge Functions with the service-role key, which
-- bypasses RLS entirely. So every policy below is SELECT-own only -- there
-- is deliberately no INSERT/UPDATE/DELETE policy for the `authenticated`
-- role on any of these four tables. RLS defaults to deny, so the anon/
-- authenticated client cannot write a row here by construction; only the
-- validate-trade Edge Function (M-11 Session 3/4) can, via the service role.
-- Same pattern as instruments/candles' service-role-only writes in the
-- market_data migration, just keyed to a user instead of shared.
--
-- executions and trade_orders have no user_id column (matches the schema
-- doc exactly -- provenance runs through orders/trades respectively), so
-- their select policies check ownership via an EXISTS join instead of a
-- direct auth.uid() comparison.
--
-- `orders.replay_session_id` / `trades.replay_session_id` are written as
-- plain nullable uuid columns with NO foreign key yet: DATABASE_SCHEMA.md
-- says they reference `replay_sessions`, but that table doesn't exist (TD-06,
-- docs/engineering/TECHNICAL_DEBT.md -- still open, deliberately out of
-- scope for M-11). Every trade this milestone writes will have
-- replay_session_id = null. Once replay_sessions is built, a follow-up
-- migration adds the FK with `alter table ... add constraint ... foreign key
-- ... references replay_sessions (id)` -- never backfilled silently.
--
-- Doc gap note (extends TD-07): DATABASE_SCHEMA.md's own top-level
-- convention says every table gets created_at/updated_at, but its shown SQL
-- for orders/executions/trades doesn't follow that (executions has neither
-- column; trades has created_at but no updated_at despite deleted_at being a
-- later mutation). Built to match the documented SQL exactly rather than
-- silently added-to or silently left as-is -- logged as a TD-07 update, not
-- a new entry (same underlying gap TD-07 already tracks for sim_accounts).
--
-- The RLS policies below are NOT yet covered by an automated cross-user
-- isolation test (ADR-010/§14 calls this mandatory per table) -- Docker
-- (required for `supabase start` local dev) isn't available in the session
-- that wrote this migration. Logged as TD-11, with a hard trigger: it must
-- be paid before Session 4's Edge Function (which writes real trade data)
-- is merged. The policies themselves are not deferred -- only the automated
-- proof of them is.

create table orders (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles (id) on delete cascade,
  sim_account_id    uuid not null references sim_accounts (id),
  replay_session_id uuid, -- FK to replay_sessions deferred until that table exists (TD-06) -- see header
  instrument_id     uuid not null references instruments (id),
  side              text not null check (side in ('buy', 'sell')),
  type              text not null check (type in ('market', 'limit', 'stop')),
  quantity          numeric(18, 8) not null check (quantity > 0),
  limit_price       numeric(18, 8),
  stop_price        numeric(18, 8),
  status            text not null default 'open'
    check (status in ('open', 'filled', 'partially_filled', 'cancelled', 'rejected')),
  placed_at_ts      timestamptz not null, -- market time (replay), not wall clock
  created_at        timestamptz not null default now()
);

create index orders_user_id_idx on orders (user_id);
create index orders_sim_account_id_idx on orders (sim_account_id);

create table executions (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders (id) on delete cascade,
  fill_ts        timestamptz not null, -- market time of fill
  fill_price     numeric(18, 8) not null,
  quantity       numeric(18, 8) not null,
  commission     numeric(12, 4) not null default 0,
  slippage       numeric(18, 8) not null default 0,
  engine_version text not null -- ADR-007: fills stay interpretable
);

create index executions_order_id_idx on executions (order_id);

-- A closed round-trip, materialized by the validate-trade Edge Function when
-- a position fully closes. Soft delete (ADR-011) -- deleted_at is filtered
-- by a shared query helper/view when that read path is built (not this
-- session; no read path exists yet).
create table trades (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles (id) on delete cascade,
  sim_account_id    uuid not null references sim_accounts (id),
  replay_session_id uuid, -- FK to replay_sessions deferred until that table exists (TD-06) -- see header
  instrument_id     uuid not null references instruments (id),
  direction         text not null check (direction in ('long', 'short')),
  entry_ts          timestamptz not null,
  exit_ts           timestamptz not null,
  avg_entry         numeric(18, 8) not null,
  avg_exit          numeric(18, 8) not null,
  quantity          numeric(18, 8) not null,
  gross_pnl         numeric(18, 2) not null,
  fees              numeric(12, 4) not null default 0,
  net_pnl           numeric(18, 2) not null,
  r_multiple        numeric(8, 2), -- realized R vs initial risk; null if no stop set
  planned_stop      numeric(18, 8),
  planned_target    numeric(18, 8),
  engine_version    text not null,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now()
);

create index trades_user_time on trades (user_id, exit_ts desc) where deleted_at is null;
create index trades_sim_account_id_idx on trades (sim_account_id);

-- Provenance link so any stat can be audited back to raw fills.
create table trade_orders (
  trade_id uuid not null references trades (id) on delete cascade,
  order_id uuid not null references orders (id),
  primary key (trade_id, order_id)
);

alter table orders enable row level security;
alter table executions enable row level security;
alter table trades enable row level security;
alter table trade_orders enable row level security;

create policy "orders_select_own"
  on orders for select
  to authenticated
  using (user_id = auth.uid());

create policy "executions_select_own"
  on executions for select
  to authenticated
  using (
    exists (
      select 1 from orders
      where orders.id = executions.order_id
        and orders.user_id = auth.uid()
    )
  );

create policy "trades_select_own"
  on trades for select
  to authenticated
  using (user_id = auth.uid());

create policy "trade_orders_select_own"
  on trade_orders for select
  to authenticated
  using (
    exists (
      select 1 from trades
      where trades.id = trade_orders.trade_id
        and trades.user_id = auth.uid()
    )
  );
