-- Retain legacy rows; active application access is materials/assets only.
begin;
drop policy if exists records_read on public.records;
create policy records_read on public.records for select to authenticated using(public.app_role() is not null and module in ('materials','assets'));
drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert to authenticated with check(public.app_role() in ('admin','officer') and module in ('materials','assets'));
drop policy if exists records_update on public.records;
create policy records_update on public.records for update to authenticated using(public.app_role() in ('admin','officer') and module in ('materials','assets')) with check(public.app_role() in ('admin','officer') and module in ('materials','assets'));
drop policy if exists records_delete on public.records;
create policy records_delete on public.records for delete to authenticated using(public.app_role()='admin' and module='assets');
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated using(public.app_role() is not null and coalesce(new_data->>'module',old_data->>'module') in ('materials','assets'));
commit;
