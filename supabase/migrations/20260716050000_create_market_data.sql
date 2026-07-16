-- Market data layer (DATABASE_SCHEMA.md §2) and its RLS policies (ADR-012 --
-- every table ships with policies in the same migration that creates it).
--
-- instruments/candles/dataset_segments are shared reference data (ADR-006):
-- every user reads the same rows, nobody owns a row. Per ADR-012 that means
-- authenticated SELECT-only, with writes restricted to the service role
-- (the yfinance import script in supabase/scripts/ uses the service key,
-- which bypasses RLS entirely -- there is deliberately no insert/update
-- policy for any role here, the same pattern as handle_new_user() bypassing
-- RLS via security definer in the profiles migration).

create table instruments (
  id          uuid primary key default gen_random_uuid(),
  symbol      text not null,
  asset_class text not null check (asset_class in ('stock', 'etf', 'crypto', 'forex', 'future')),
  name        text not null,
  currency    text not null default 'USD',
  tick_size   numeric(18, 8) not null default 0.01,
  point_value numeric(18, 8) not null default 1, -- for futures later
  is_active   boolean not null default true,
  unique (symbol, asset_class)
);

-- Composite natural PK, not a uuid: candles are never referenced
-- individually by other tables, and the natural key both prevents
-- duplicates on re-import and matches the actual query pattern (range
-- scans by instrument+timeframe). The one justified exception to the
-- uuid-PK convention (DATABASE_SCHEMA.md §2).
create table candles (
  instrument_id uuid not null references instruments (id),
  timeframe     text not null check (timeframe in ('1m', '5m', '15m', '1h', '4h', '1d', '1w')),
  ts            timestamptz not null, -- bar open time, UTC
  open   numeric(18, 8) not null,
  high   numeric(18, 8) not null,
  low    numeric(18, 8) not null,
  close  numeric(18, 8) not null,
  volume numeric(24, 4) not null default 0,
  primary key (instrument_id, timeframe, ts)
);

create index candles_lookup on candles (instrument_id, timeframe, ts desc);

create table dataset_segments (
  id            uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references instruments (id),
  timeframe     text not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  title         text not null, -- "SPY -- March 2020 Crash"
  description   text,
  difficulty    text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  tags          text[] not null default '{}'
);

alter table instruments enable row level security;
alter table candles enable row level security;
alter table dataset_segments enable row level security;

create policy "instruments_select_all"
  on instruments for select
  to authenticated
  using (true);

create policy "candles_select_all"
  on candles for select
  to authenticated
  using (true);

create policy "dataset_segments_select_all"
  on dataset_segments for select
  to authenticated
  using (true);
