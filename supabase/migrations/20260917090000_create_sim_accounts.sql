-- Simulator accounts (DATABASE_SCHEMA.md §4) and their RLS policies
-- (ADR-012 -- every table ships with policies in the same migration that
-- creates it; a table without policies is a merge blocker).
--
-- sim_accounts is the first table in the simulator/replay group (M-9
-- Session 1). It unblocks TD-06 (docs/engineering/TECHNICAL_DEBT.md):
-- replay_sessions has a required FK to sim_accounts and couldn't be built
-- until this table existed. replay_sessions itself is still out of scope
-- for this session -- only sim_accounts is created here.

create table sim_accounts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles (id) on delete cascade,
  name             text not null default 'Main',
  starting_balance numeric(18, 2) not null default 100000,
  balance          numeric(18, 2) not null, -- cash after realized PnL
  currency         text not null default 'USD',
  is_default       boolean not null default false,
  created_at       timestamptz not null default now()
);

create index sim_accounts_user_id_idx on sim_accounts (user_id);

-- Row Level Security: default deny (ADR-012). Unlike profiles/user_settings
-- (created only by the signup trigger), sim_accounts rows are ordinary
-- user data created directly by the client -- account creation isn't a
-- privileged write (ADR-012's XP/achievement/trade-validation list), so it
-- gets the standard select/insert/update-own policy set. No delete policy:
-- account deletion isn't in scope yet and defaults to denied until a
-- deliberate decision (soft delete vs. an Edge Function) is made for it.

alter table sim_accounts enable row level security;

create policy "sim_accounts_select_own"
  on sim_accounts for select
  to authenticated
  using (user_id = auth.uid());

create policy "sim_accounts_insert_own"
  on sim_accounts for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "sim_accounts_update_own"
  on sim_accounts for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
