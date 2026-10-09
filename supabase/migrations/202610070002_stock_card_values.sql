-- Apply after 202610070001_procurement_workflow.sql for existing projects.
begin;
alter table public.stock_movements add column if not exists unit_price numeric(16,2) check(unit_price>=0 and unit_price::text<>'NaN');
create or replace function public.move_stock(record_id uuid,delta numeric,reason text) returns numeric language plpgsql security definer set search_path=public as $$
declare current_record public.records;next_balance numeric;
begin
 if public.app_role() not in ('admin','officer') or public.app_role() is null then raise exception 'Permission denied';end if;
 if delta is null or delta=0 or abs(delta)>100000000 or reason is null or length(trim(reason))=0 or length(reason)>300 then raise exception 'Invalid movement';end if;
 select * into current_record from public.records where id=record_id and module='materials' for update;
 if not found then raise exception 'Material not found';end if;
 next_balance=coalesce((current_record.data->>'quantity')::numeric,0)+delta;
 if next_balance<0 then raise exception 'Insufficient stock';end if;
 perform set_config('app.stock_operation','yes',true);
 update public.records set data=jsonb_set(data,'{quantity}',to_jsonb(next_balance)) where id=record_id;
 perform set_config('app.stock_operation','no',true);
 insert into public.stock_movements(record_id,delta,balance,unit_price,reason,actor) values(record_id,delta,next_balance,current_record.amount,reason,auth.uid());
 return next_balance;
end $$;
commit;
