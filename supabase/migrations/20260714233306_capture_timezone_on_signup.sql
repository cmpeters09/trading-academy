-- Extends handle_new_user() (see 20260714174959_create_profiles_and_user_
-- settings.sql) to also capture the browser-detected IANA timezone passed
-- at signup, instead of always falling back to the profiles.timezone
-- column default ('UTC'). ADR-009: streak day boundaries are computed
-- against the user's real timezone, not UTC.
--
-- Migrations are forward-only and immutable once merged (§19), so this
-- replaces the function body rather than editing the original migration.
-- The trigger itself is untouched — it already points at this function by
-- name.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, timezone)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'username',
      'user_' || substr(new.id::text, 1, 8)
    ),
    coalesce(new.raw_user_meta_data ->> 'timezone', 'UTC')
  );

  insert into public.user_settings (user_id)
  values (new.id);

  return new;
end;
$$;
