-- Keep existing records and historical status values; remove approval workflow.
begin;
drop trigger if exists record_readiness on public.records;
drop function if exists public.check_record_readiness();
create or replace function public.guard_record() returns trigger language plpgsql set search_path=public as $$
declare stock_op boolean:=coalesce(current_setting('app.stock_operation',true),'')='yes';
begin
 if new.amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid amount';end if;
 if TG_OP='INSERT' then
  if new.module='materials' then new.data=jsonb_set(new.data,'{quantity}','0'::jsonb);end if;
 else
  if new.id<>old.id or new.module<>old.module or new.created_at<>old.created_at then raise exception 'Identity is immutable';end if;
  if stock_op then
   if new.module<>'materials' or (to_jsonb(new)-'data'-'updated_at')<>(to_jsonb(old)-'data'-'updated_at') or (new.data-'quantity')<>(old.data-'quantity') then raise exception 'Invalid stock update';end if;
  elsif old.module='materials' and new.data->'quantity' is distinct from old.data->'quantity' then raise exception 'Use move_stock';end if;
 end if;
 if new.module='assets' and (coalesce((new.data->>'life')::numeric,0)<=0 or (new.data->>'life')::numeric::text in ('NaN','Infinity','-Infinity') or coalesce((new.data->>'residual')::numeric,-1)<0 or (new.data->>'residual')::numeric::text in ('NaN','Infinity','-Infinity') or (new.data->>'residual')::numeric>new.amount or nullif(new.data->>'start','') is null) then raise exception 'Invalid depreciation settings';end if;
 new.updated_at=now();return new;
end $$;
drop function if exists public.operational_keys(text);
drop policy if exists records_update on public.records;
create policy records_update on public.records for update to authenticated using(public.app_role() in ('admin','officer')) with check(public.app_role() in ('admin','officer'));
drop policy if exists records_delete on public.records;
create policy records_delete on public.records for delete to authenticated using(public.app_role()='admin' and module<>'materials');
revoke all on function public.guard_record() from public;
commit;
