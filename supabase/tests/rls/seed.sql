-- TD-11 RLS isolation test -- SEED (run by hand in Dashboard -> SQL Editor).
--
-- Why by hand: orders/executions/trades/trade_orders have SELECT-own RLS
-- only (20260922142658_create_trade_persistence_tables.sql). A signed-in
-- user cannot insert into them -- that is the property under test -- so the
-- automated test can't create its own rows. The SQL Editor runs as the
-- postgres role, which bypasses RLS, without the service-role key ever
-- leaving Supabase (ADR-015 §3).
--
-- What it creates, per test user: 1 sim_account (named so it's obviously
-- test data, is_default = false so it never becomes the user's real
-- account), 1 order, 1 execution, 1 trade, 1 trade_orders link. Every row
-- uses a fixed ID from fixtures.ts -- keep the two in sync.
--
-- Safe to re-run: it deletes its own fixed-ID rows first, then re-inserts,
-- all inside one transaction (a DO block is atomic -- any error rolls the
-- whole thing back).
--
-- BEFORE RUNNING: replace the two placeholders below with the test users'
-- UUIDs (Authentication -> Users -> click user -> "User UID"). Do this in
-- the SQL Editor only -- never commit real UUIDs into this file. If you
-- forget, the run fails immediately with "invalid input syntax for type
-- uuid", which is intended.

do $$
declare
  user_a uuid := 'PASTE-USER-A-UUID-HERE';
  user_b uuid := 'PASTE-USER-B-UUID-HERE';
  instrument uuid;
begin
  if user_a = user_b then
    raise exception 'user A and user B must be two different users';
  end if;

  -- profiles rows are created by the handle_new_user() trigger when a user
  -- is added, including via the dashboard's "Add user".
  if (select count(*) from profiles where id in (user_a, user_b)) <> 2 then
    raise exception 'one or both UUIDs have no profiles row -- check you copied the User UID of two existing users';
  end if;

  select id into instrument from instruments order by symbol limit 1;
  if instrument is null then
    raise exception 'no instruments rows exist -- the seed needs one to reference';
  end if;

  -- Clear any previous seed (same statements as teardown.sql).
  delete from trade_orders where trade_id in ('00000000-0000-4000-8000-00000000a004', '00000000-0000-4000-8000-00000000b004');
  delete from trades       where id       in ('00000000-0000-4000-8000-00000000a004', '00000000-0000-4000-8000-00000000b004');
  delete from executions   where id       in ('00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-00000000b003');
  delete from orders       where id       in ('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000b002');
  delete from sim_accounts where id       in ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000b001');

  insert into sim_accounts (id, user_id, name, balance, is_default) values
    ('00000000-0000-4000-8000-00000000a001', user_a, 'RLS-TEST (safe to delete)', 100000, false),
    ('00000000-0000-4000-8000-00000000b001', user_b, 'RLS-TEST (safe to delete)', 100000, false);

  insert into orders (id, user_id, sim_account_id, instrument_id, side, type, quantity, status, placed_at_ts) values
    ('00000000-0000-4000-8000-00000000a002', user_a, '00000000-0000-4000-8000-00000000a001', instrument, 'buy', 'market', 1, 'filled', '2020-01-02 14:30:00+00'),
    ('00000000-0000-4000-8000-00000000b002', user_b, '00000000-0000-4000-8000-00000000b001', instrument, 'buy', 'market', 1, 'filled', '2020-01-02 14:30:00+00');

  insert into executions (id, order_id, fill_ts, fill_price, quantity, engine_version) values
    ('00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-00000000a002', '2020-01-02 14:30:00+00', 100, 1, 'rls-test'),
    ('00000000-0000-4000-8000-00000000b003', '00000000-0000-4000-8000-00000000b002', '2020-01-02 14:30:00+00', 100, 1, 'rls-test');

  insert into trades (id, user_id, sim_account_id, instrument_id, direction, entry_ts, exit_ts, avg_entry, avg_exit, quantity, gross_pnl, net_pnl, engine_version) values
    ('00000000-0000-4000-8000-00000000a004', user_a, '00000000-0000-4000-8000-00000000a001', instrument, 'long', '2020-01-02 14:30:00+00', '2020-01-03 14:30:00+00', 100, 101, 1, 1, 1, 'rls-test'),
    ('00000000-0000-4000-8000-00000000b004', user_b, '00000000-0000-4000-8000-00000000b001', instrument, 'long', '2020-01-02 14:30:00+00', '2020-01-03 14:30:00+00', 100, 101, 1, 1, 1, 'rls-test');

  insert into trade_orders (trade_id, order_id) values
    ('00000000-0000-4000-8000-00000000a004', '00000000-0000-4000-8000-00000000a002'),
    ('00000000-0000-4000-8000-00000000b004', '00000000-0000-4000-8000-00000000b002');
end $$;

-- Confirmation: expect 2 rows in every column.
select
  (select count(*) from sim_accounts where name = 'RLS-TEST (safe to delete)')                                           as sim_accounts,
  (select count(*) from orders       where id in ('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000b002')) as orders,
  (select count(*) from executions   where id in ('00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-00000000b003')) as executions,
  (select count(*) from trades       where id in ('00000000-0000-4000-8000-00000000a004', '00000000-0000-4000-8000-00000000b004')) as trades,
  (select count(*) from trade_orders where trade_id in ('00000000-0000-4000-8000-00000000a004', '00000000-0000-4000-8000-00000000b004')) as trade_orders;
