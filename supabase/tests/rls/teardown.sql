-- TD-11 RLS isolation test -- TEARDOWN (run by hand in Dashboard -> SQL Editor).
--
-- Removes exactly the fixed-ID rows seed.sql created (IDs from fixtures.ts)
-- and nothing else. No UUIDs to paste. Child rows are deleted before their
-- parents so no foreign key blocks the delete.
--
-- Deleting the two test users afterwards (Authentication -> Users) is
-- optional and independent: their profiles cascade-delete everything they
-- own anyway.

begin;

delete from trade_orders where trade_id in ('00000000-0000-4000-8000-00000000a004', '00000000-0000-4000-8000-00000000b004');
delete from trades       where id       in ('00000000-0000-4000-8000-00000000a004', '00000000-0000-4000-8000-00000000b004');
delete from executions   where id       in ('00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-00000000b003');
delete from orders       where id       in ('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000b002');
delete from sim_accounts where id       in ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000b001');

commit;

-- Confirmation: expect 0 in every column.
select
  (select count(*) from sim_accounts where name = 'RLS-TEST (safe to delete)')                                           as sim_accounts,
  (select count(*) from orders       where id in ('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000b002')) as orders,
  (select count(*) from executions   where id in ('00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-00000000b003')) as executions,
  (select count(*) from trades       where id in ('00000000-0000-4000-8000-00000000a004', '00000000-0000-4000-8000-00000000b004')) as trades,
  (select count(*) from trade_orders where trade_id in ('00000000-0000-4000-8000-00000000a004', '00000000-0000-4000-8000-00000000b004')) as trade_orders;
