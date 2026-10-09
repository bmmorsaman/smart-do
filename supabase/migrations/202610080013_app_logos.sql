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
