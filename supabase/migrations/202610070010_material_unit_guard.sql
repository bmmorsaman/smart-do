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
