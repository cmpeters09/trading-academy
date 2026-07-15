-- Identity & profile layer (DATABASE_SCHEMA.md §1) and its RLS policies
-- (ADR-012 — every table ships with policies in the same migration that
-- creates it; a table without policies is a merge blocker).
--
-- profiles extends auth.users (Supabase-managed) with app-specific fields.
-- user_settings is split out because it changes independently and more
-- often than profiles, keeping profile reads cache-friendly.

create table profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text unique not null check (char_length(username) between 3 and 24),
  display_name  text,
  timezone      text not null default 'UTC', -- streak day boundaries, ADR-009
  avatar_url    text,
  xp_total      bigint not null default 0,   -- denormalized sum of xp_events, trigger-maintained (M-5)
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index profiles_username_idx on profiles (username);

create table user_settings (
  user_id             uuid primary key references profiles (id) on delete cascade,
  theme               text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  default_risk_pct    numeric(5, 2) not null default 1.00 check (default_risk_pct between 0.1 and 5),
  default_commission  numeric(10, 4) not null default 0,
  default_slippage_bp integer not null default 2,
  updated_at          timestamptz not null default now()
);

-- Row Level Security: default deny. With RLS enabled and no matching
-- policy, Postgres returns zero rows to every request, regardless of role
-- — this is the actual security boundary (ADR-012), not application code
-- remembering to filter by user_id. A query that "forgets" to scope by
-- user must still return nothing; if it doesn't, the policy is the bug.

alter table profiles enable row level security;
alter table user_settings enable row level security;

-- A signed-in user may read and update only the row matching their own
-- auth.uid(). There is deliberately no insert policy for either table:
-- rows are created solely by the handle_new_user() trigger below, which
-- runs with definer privileges and bypasses RLS — a client can never
-- insert its own profile or settings row directly, only read/update the
-- one the trigger already created for them.

create policy "profiles_select_own"
  on profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_update_own"
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "user_settings_select_own"
  on user_settings for select
  to authenticated
  using (user_id = auth.uid());

create policy "user_settings_update_own"
  on user_settings for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Profile creation trigger: fires once per signup, in the same transaction
-- as the auth.users insert, so a user can never exist without a profile
-- and settings row. security definer + a locked search_path is the
-- standard, documented Supabase pattern for this trigger — it must bypass
-- RLS to create the very row RLS would otherwise require to already exist.
-- (It cannot be called directly by a client: Postgres only allows a
-- `returns trigger` function to run in trigger context.)
--
-- No signup UI exists yet (that's later in M-2) so raw_user_meta_data may
-- not carry a chosen username; the fallback below guarantees the
-- not-null/unique/length constraints are always satisfiable, with the
-- real username presumably chosen at onboarding (onboarded_at above).
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'username',
      'user_' || substr(new.id::text, 1, 8)
    )
  );

  insert into public.user_settings (user_id)
  values (new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_user();
