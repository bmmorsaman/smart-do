begin;
alter table public.stock_movements add column if not exists movement_date date;
update public.stock_movements set movement_date=(created_at at time zone 'Asia/Bangkok')::date where movement_date is null;
alter table public.stock_movements alter column movement_date set default (now() at time zone 'Asia/Bangkok')::date;
alter table public.stock_movements alter column movement_date set not null;
create index if not exists movements_material_date on public.stock_movements(record_id,movement_date,id);
create or replace function public.move_stock_dated(material_id uuid,delta numeric,reason text,document_ref text default '',party_name text default '',department_name text default '',sender_name text default '',recipient_name text default '',entry_date date default (now() at time zone 'Asia/Bangkok')::date)
returns numeric language plpgsql security definer set search_path=public as $$
declare next_balance numeric;movement_id bigint;opening numeric;
begin
 if entry_date is null or entry_date<date '1900-01-01' or entry_date>(now() at time zone 'Asia/Bangkok')::date then raise exception 'Invalid movement date';end if;
 next_balance=public.move_stock_people(material_id,delta,reason,document_ref,party_name,department_name,sender_name,recipient_name);
 select id into movement_id from public.stock_movements where record_id=material_id order by id desc limit 1;
 update public.stock_movements set movement_date=entry_date where id=movement_id;
 select next_balance-coalesce(sum(sm.delta),0) into opening from public.stock_movements sm where record_id=material_id;
 if exists(select 1 from (select opening+sum(sm.delta) over(order by movement_date,created_at,id) as running from public.stock_movements sm where record_id=material_id) history where running<0) then raise exception 'Backdated issue exceeds stock on movement date';end if;
 update public.stock_movements sm set balance=history.running from (select sm2.id,opening+sum(sm2.delta) over(order by sm2.movement_date,sm2.created_at,sm2.id) as running from public.stock_movements sm2 where sm2.record_id=material_id) history where sm.id=history.id;
 return next_balance;
end $$;
revoke all on function public.move_stock_dated(uuid,numeric,text,text,text,text,text,text,date) from public;
grant execute on function public.move_stock_dated(uuid,numeric,text,text,text,text,text,text,date) to authenticated;
commit;
