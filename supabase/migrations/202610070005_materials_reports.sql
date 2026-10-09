begin;
alter table public.stock_movements add column if not exists document_no text;
alter table public.stock_movements add column if not exists party text;
alter table public.stock_movements add column if not exists department text;
create or replace function public.move_stock_details(material_id uuid,delta numeric,reason text,document_ref text default '',party_name text default '',department_name text default '')
returns numeric language plpgsql security definer set search_path=public as $$
declare next_balance numeric;movement_id bigint;
begin
 if length(coalesce(document_ref,''))>100 or length(coalesce(party_name,''))>200 or length(coalesce(department_name,''))>200 then raise exception 'Movement metadata too long';end if;
 -- move_stock checks role, validates quantity, and keeps the material row locked
 -- until this whole transaction commits, including the metadata write.
 next_balance=public.move_stock(material_id,delta,reason);
 select id into movement_id from public.stock_movements where record_id=material_id order by id desc limit 1;
 update public.stock_movements set document_no=document_ref,party=party_name,department=department_name where id=movement_id;
 return next_balance;
end $$;
revoke all on function public.move_stock_details(uuid,numeric,text,text,text,text) from public;
grant execute on function public.move_stock_details(uuid,numeric,text,text,text,text) to authenticated;
drop policy if exists records_read on public.records;
create policy records_read on public.records for select to authenticated using(public.app_role() is not null and module='materials');
drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert to authenticated with check(public.app_role() in ('admin','officer') and module='materials');
drop policy if exists records_update on public.records;
create policy records_update on public.records for update to authenticated using(public.app_role() in ('admin','officer') and module='materials') with check(public.app_role() in ('admin','officer') and module='materials');
drop policy if exists records_delete on public.records;
create policy records_delete on public.records for delete to authenticated using(false);
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated using(public.app_role() is not null and coalesce(new_data->>'module',old_data->>'module')='materials');
commit;
