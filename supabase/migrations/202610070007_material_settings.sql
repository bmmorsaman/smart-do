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
