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
