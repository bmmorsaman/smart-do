begin;
alter table public.material_settings drop constraint if exists material_settings_category_check;
alter table public.material_settings add constraint material_settings_category_check
 check(category in ('custodians','recipients','groups','units','locations'));
insert into public.material_settings(category,name)
select distinct 'locations',trim(data->>'location') from public.records
where module='materials' and length(trim(data->>'location')) between 1 and 200
on conflict do nothing;
commit;
