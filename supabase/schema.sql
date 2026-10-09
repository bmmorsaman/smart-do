-- Run once in a new Supabase project. Staff accounts are created by administrators.
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade, full_name text not null default '', role text not null default 'viewer' check(role in ('admin','officer','approver','viewer')));
alter table public.profiles enable row level security;
create function public.app_role() returns text language sql stable security definer set search_path=public as $$ select role from public.profiles where id=auth.uid() $$;
revoke all on function public.app_role() from public; grant execute on function public.app_role() to authenticated;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or public.app_role()='admin');
-- No browser-side writes to profiles: provision roles with SQL/dashboard only.
create function public.new_user_profile() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name','')); return new; end $$;
create trigger new_user after insert on auth.users for each row execute function public.new_user_profile();
insert into public.profiles(id) select id from auth.users on conflict do nothing;
create table public.records(
 id uuid primary key default gen_random_uuid(), module text not null check(module in ('plans','requests','contracts','inspections','materials','requisitions','assets','loans','maintenance','disposals','annual','vendors')),
 code text not null check(length(code) between 1 and 100),title text not null check(length(title) between 1 and 300),amount numeric(16,2) not null default 0 check(amount>=0),
 fiscal_year integer not null check(fiscal_year between 2500 and 2700),status text not null default 'ร่าง' check(status in ('ร่าง','เสนออนุมัติ','อนุมัติ','ดำเนินการ','เสร็จสิ้น','ยกเลิก')),
 data jsonb not null default '{}' check(jsonb_typeof(data)='object'),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(module,code)
);
create table public.audit_log(id bigint generated always as identity primary key, record_id uuid, actor uuid, action text not null, old_data jsonb,new_data jsonb,created_at timestamptz not null default now());
create table public.stock_movements(id bigint generated always as identity primary key,record_id uuid not null references public.records(id),delta numeric not null check(delta<>0),balance numeric not null check(balance>=0),unit_price numeric(16,2) check(unit_price>=0 and unit_price::text<>'NaN'),reason text not null,actor uuid,created_at timestamptz not null default now());
alter table public.records enable row level security;alter table public.audit_log enable row level security;alter table public.stock_movements enable row level security;
create policy records_read on public.records for select to authenticated using(public.app_role() is not null and module in ('materials','assets'));
create policy records_insert on public.records for insert to authenticated with check(public.app_role() in ('admin','officer') and module in ('materials','assets'));
create policy records_update on public.records for update to authenticated using(public.app_role() in ('admin','officer') and module in ('materials','assets')) with check(public.app_role() in ('admin','officer') and module in ('materials','assets'));
create policy records_delete on public.records for delete to authenticated using(public.app_role()='admin' and module='assets');
create policy audit_read on public.audit_log for select to authenticated using(public.app_role() is not null and coalesce(new_data->>'module',old_data->>'module') in ('materials','assets'));
create policy movements_read on public.stock_movements for select to authenticated using(public.app_role() is not null);
grant select on public.profiles,public.audit_log,public.stock_movements to authenticated;
grant select,insert,update,delete on public.records to authenticated;
revoke insert,update,delete on public.profiles,public.audit_log,public.stock_movements from authenticated,anon;
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
create trigger record_guard before insert or update on public.records for each row execute function public.guard_record();
create function public.record_audit() returns trigger language plpgsql security definer set search_path=public as $$ begin
 insert into public.audit_log(record_id,actor,action,old_data,new_data) values(coalesce(new.id,old.id),auth.uid(),TG_OP,case when TG_OP<>'INSERT' then to_jsonb(old) end,case when TG_OP<>'DELETE' then to_jsonb(new) end);return coalesce(new,old);end $$;
create trigger record_audit after insert or update or delete on public.records for each row execute function public.record_audit();
create function public.move_stock(record_id uuid,delta numeric,reason text) returns numeric language plpgsql security definer set search_path=public as $$
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
revoke all on function public.move_stock(uuid,numeric,text) from public;grant execute on function public.move_stock(uuid,numeric,text) to authenticated;
revoke all on function public.new_user_profile(),public.record_audit(),public.guard_record() from public;
-- Provision first admin only using Supabase SQL editor:
-- update public.profiles set role='admin',full_name='ผู้ดูแลระบบ' where id=(select id from auth.users where email='YOUR_EMAIL');

-- Materials-only scope and detailed stock entries.
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

begin;
create table if not exists public.material_settings(
 id uuid primary key default gen_random_uuid(),
 category text not null check(category in ('custodians','recipients','groups','units')),
 name text not null check(length(trim(name)) between 1 and 200),
 active boolean not null default true
);
create unique index if not exists material_settings_unique_name on public.material_settings(category,lower(trim(name)));
alter table public.material_settings enable row level security;
drop policy if exists settings_read on public.material_settings;
create policy settings_read on public.material_settings for select to authenticated using(public.app_role() is not null);
drop policy if exists settings_insert on public.material_settings;
create policy settings_insert on public.material_settings for insert to authenticated with check(public.app_role() in ('admin','officer'));
drop policy if exists settings_update on public.material_settings;
create policy settings_update on public.material_settings for update to authenticated using(public.app_role() in ('admin','officer')) with check(public.app_role() in ('admin','officer'));
grant select,insert,update on public.material_settings to authenticated;
revoke delete on public.material_settings from authenticated,anon;
insert into public.material_settings(category,name)
select distinct setting.category,trim(setting.name) from public.records r
cross join lateral (values ('groups',r.data->>'group'),('units',r.data->>'unit'),('custodians',r.data->>'custodian')) setting(category,name)
where r.module='materials' and length(trim(setting.name)) between 1 and 200
on conflict do nothing;
commit;

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

begin;
drop policy if exists settings_delete on public.material_settings;
create policy settings_delete on public.material_settings for delete to authenticated using(public.app_role() in ('admin','officer'));
grant delete on public.material_settings to authenticated;
commit;

begin;
create or replace function public.guard_material_unit() returns trigger language plpgsql set search_path=public as $$
begin
 if old.module='materials' and new.data->>'unit' is distinct from old.data->>'unit' and exists(select 1 from public.stock_movements where record_id=old.id) then
  raise exception 'Cannot change unit after stock movements';
 end if;
 return new;
end $$;
drop trigger if exists material_unit_guard on public.records;
create trigger material_unit_guard before update on public.records for each row execute function public.guard_material_unit();
commit;


begin;
alter table public.material_settings drop constraint if exists material_settings_category_check;
alter table public.material_settings add constraint material_settings_category_check
 check(category in ('custodians','recipients','groups','units','locations'));
insert into public.material_settings(category,name)
select distinct 'locations',trim(data->>'location') from public.records
where module='materials' and length(trim(data->>'location')) between 1 and 200
on conflict do nothing;
commit;

begin;
alter table public.material_settings drop constraint if exists material_settings_category_check;
alter table public.material_settings add constraint material_settings_category_check
 check(category in ('custodians','recipients','groups','units','locations','sources'));
insert into public.material_settings(category,name)
select distinct 'sources',trim(party) from public.stock_movements
where delta>0 and length(trim(party)) between 1 and 200
on conflict do nothing;
commit;

begin;
create table if not exists public.app_logos(
 slot text primary key check(slot in ('ministry','health_center')),
 data_url text not null check(length(data_url)<=500000 and data_url ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$')
);
alter table public.app_logos enable row level security;
drop policy if exists logos_read on public.app_logos;
create policy logos_read on public.app_logos for select to authenticated using(public.app_role() is not null);
drop policy if exists logos_insert on public.app_logos;
create policy logos_insert on public.app_logos for insert to authenticated with check(public.app_role() in ('admin','officer'));
drop policy if exists logos_update on public.app_logos;
create policy logos_update on public.app_logos for update to authenticated using(public.app_role() in ('admin','officer')) with check(public.app_role() in ('admin','officer'));
drop policy if exists logos_delete on public.app_logos;
create policy logos_delete on public.app_logos for delete to authenticated using(public.app_role() in ('admin','officer'));
grant select,insert,update,delete on public.app_logos to authenticated;
commit;

begin;
create table if not exists public.organization_settings(
 id smallint primary key check(id=1),
 name text not null check(length(trim(name)) between 1 and 300),
 address text not null check(length(trim(address)) between 1 and 1000)
);
alter table public.organization_settings enable row level security;
drop policy if exists organization_read on public.organization_settings;
create policy organization_read on public.organization_settings for select to authenticated using(public.app_role() is not null);
drop policy if exists organization_insert on public.organization_settings;
create policy organization_insert on public.organization_settings for insert to authenticated with check(public.app_role() in ('admin','officer'));
drop policy if exists organization_update on public.organization_settings;
create policy organization_update on public.organization_settings for update to authenticated using(public.app_role() in ('admin','officer')) with check(public.app_role() in ('admin','officer'));
grant select,insert,update on public.organization_settings to authenticated;
insert into public.organization_settings(id,name,address) values(1,'โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านโดนเอาว์','ตำบลรุง อำเภอกันทรลักษ์ จังหวัดศรีสะเกษ') on conflict do nothing;
commit;
