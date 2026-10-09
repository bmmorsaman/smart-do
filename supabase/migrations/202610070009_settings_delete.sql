begin;
drop policy if exists settings_delete on public.material_settings;
create policy settings_delete on public.material_settings for delete to authenticated using(public.app_role() in ('admin','officer'));
grant delete on public.material_settings to authenticated;
commit;
