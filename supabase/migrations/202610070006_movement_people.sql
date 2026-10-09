begin;
alter table public.stock_movements add column if not exists sender text;
alter table public.stock_movements add column if not exists recipient text;
create or replace function public.move_stock_people(material_id uuid,delta numeric,reason text,document_ref text default '',party_name text default '',department_name text default '',sender_name text default '',recipient_name text default '')
returns numeric language plpgsql security definer set search_path=public as $$
declare next_balance numeric;movement_id bigint;
begin
 if length(coalesce(sender_name,''))>200 or length(coalesce(recipient_name,''))>200 then raise exception 'Movement names too long';end if;
 next_balance=public.move_stock_details(material_id,delta,reason,document_ref,party_name,department_name);
 select id into movement_id from public.stock_movements where record_id=material_id order by id desc limit 1;
 update public.stock_movements set sender=sender_name,recipient=recipient_name where id=movement_id;
 return next_balance;
end $$;
revoke all on function public.move_stock_people(uuid,numeric,text,text,text,text,text,text) from public;
grant execute on function public.move_stock_people(uuid,numeric,text,text,text,text,text,text) to authenticated;
commit;
