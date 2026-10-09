begin;
alter table public.material_settings drop constraint if exists material_settings_category_check;
alter table public.material_settings add constraint material_settings_category_check
 check(category in ('custodians','recipients','groups','units','locations','sources'));
insert into public.material_settings(category,name)
select distinct 'sources',trim(party) from public.stock_movements
where delta>0 and length(trim(party)) between 1 and 200
on conflict do nothing;
commit;
