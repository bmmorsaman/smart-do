-- Existing projects: run once after the original schema.sql.
-- New projects: schema.sql already contains this change.
begin;

create or replace function public.operational_keys(module_name text)
returns text[] language sql immutable set search_path=public as $$
 select case module_name
  when 'contracts' then array['delivery_date','payment_ref']
  when 'inspections' then array['date','result','received_quantity','receipt_ref']
  when 'loans' then array['returned','return_condition','follow_up_date']
  when 'annual' then array['result','report_date','sent_sao','sent_parent']
  when 'disposals' then array['date','result_ref','ledger_date','sao_notice_date']
  else array[]::text[] end
$$;
revoke all on function public.operational_keys(text) from public;
grant execute on function public.operational_keys(text) to authenticated;

create or replace function public.guard_record() returns trigger language plpgsql set search_path=public as $$
declare
 role_name text:=public.app_role();
 stock_op boolean:=coalesce(current_setting('app.stock_operation',true),'')='yes';
 allowed_keys text[];
begin
 if new.amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid amount';end if;
 if TG_OP='INSERT' then
  if new.status<>'ร่าง' then raise exception 'New records must start as draft'; end if;
  if new.module='materials' then new.data=jsonb_set(new.data,'{quantity}','0'::jsonb);end if;
 else
  if new.id<>old.id or new.module<>old.module or new.created_at<>old.created_at then raise exception 'Identity is immutable';end if;
  if stock_op then
   if new.module<>'materials' or (to_jsonb(new)-'data'-'updated_at')<>(to_jsonb(old)-'data'-'updated_at') or (new.data-'quantity')<>(old.data-'quantity') then raise exception 'Invalid stock update';end if;
  else
   if old.module='materials' and new.data->'quantity' is distinct from old.data->'quantity' then raise exception 'Use move_stock';end if;
   if new.status<>old.status then
    if (to_jsonb(new)-'status'-'updated_at')<>(to_jsonb(old)-'status'-'updated_at') then raise exception 'Status transitions cannot change record content';end if;
    if not ((old.status='ร่าง' and new.status='เสนออนุมัติ' and role_name in ('admin','officer')) or (old.status='เสนออนุมัติ' and new.status in ('อนุมัติ','ยกเลิก') and role_name in ('admin','approver')) or (old.status='อนุมัติ' and new.status='ดำเนินการ' and role_name in ('admin','officer')) or (old.status='ดำเนินการ' and new.status='เสร็จสิ้น' and role_name in ('admin','officer'))) then raise exception 'Transition not permitted';end if;
   elsif old.status not in ('ร่าง','ยกเลิก') or role_name not in ('admin','officer') then
    allowed_keys=public.operational_keys(old.module);
    if role_name is null or role_name not in ('admin','officer') or old.status not in ('อนุมัติ','ดำเนินการ') or cardinality(allowed_keys)=0 or (to_jsonb(new)-'data'-'updated_at')<>(to_jsonb(old)-'data'-'updated_at') or (new.data-allowed_keys)<>(old.data-allowed_keys) then
     raise exception 'Record locked or insufficient permission';
    end if;
   end if;
  end if;
 end if;
 if new.module='assets' and (not (new.data ?& array['life','residual','start']) or coalesce((new.data->>'life')::numeric,0)<=0 or (new.data->>'life')::numeric::text in ('NaN','Infinity','-Infinity') or (new.data->>'residual')::numeric::text in ('NaN','Infinity','-Infinity') or coalesce((new.data->>'residual')::numeric,-1)<0 or (new.data->>'residual')::numeric>new.amount or nullif(new.data->>'start','') is null) then raise exception 'Invalid depreciation settings';end if;
 new.updated_at=now();return new;
end $$;

create or replace function public.check_record_readiness() returns trigger language plpgsql set search_path=public as $$
declare
 required_keys text[];
 key_name text;
 source_module text;
 source_record public.records;
 field_name text;
 field_value text;
 number_value numeric;
begin
 if new.status is not distinct from old.status or new.status='ยกเลิก' then return new;end if;
 required_keys=case new.module
  when 'plans' then array['budget_source','period']
  when 'requests' then array['purchase_type','method','reason','specification','reference_price','price_source','budget_source','budget','need_date','method_reason','criteria','proposal','chief_officer','authority','delegation_ref']
  when 'contracts' then array['request_code','vendor','selection_ref','selection_reason','signed_date','due']
  when 'inspections' then array['contract_code','appointment_ref','committee']
  when 'materials' then array['unit','location','custodian','receipt_ref']
  when 'requisitions' then array['department','requester','recipient','material_code','quantity','issue_authority','issue_ref']
  when 'assets' then array['start','life','residual','location','custodian','receipt_ref']
  when 'loans' then array['asset_code','borrower','purpose','loan_location','authority','loan_ref','due']
  when 'maintenance' then array['asset_code','problem','responsible']
  when 'disposals' then array['asset_code','reason','investigation_ref','method']
  when 'annual' then array['appointment_ref','committee','period_end','date','report_due']
  when 'vendors' then array['tax_id','address']
  else array[]::text[] end;
 if new.module='disposals' and new.status in ('ดำเนินการ','เสร็จสิ้น') then required_keys=required_keys||array['approval','order_date'];end if;
 if new.status='เสร็จสิ้น' then
  required_keys=required_keys||case new.module
   when 'contracts' then array['delivery_date']
   when 'inspections' then array['date','result','receipt_ref']
   when 'loans' then array['returned','return_condition']
   when 'annual' then array['result','report_date','sent_sao']
   when 'disposals' then array['date','result_ref','ledger_date','sao_notice_date']
   else array[]::text[] end;
 end if;
 foreach key_name in array required_keys loop
  if nullif(btrim(new.data->>key_name),'') is null then raise exception 'Missing workflow field: %',key_name;end if;
 end loop;
 for field_name,field_value in select key,value from jsonb_each_text(new.data) loop
  if field_name in ('reference_price','budget','guarantee','minimum','received_quantity','quantity','life','residual') and nullif(field_value,'') is not null then
   number_value=field_value::numeric;
   if number_value::text in ('NaN','Infinity','-Infinity') or number_value<0 then raise exception 'Invalid numeric field: %',field_name;end if;
  end if;
  if field_name in ('need_date','signed_date','due','delivery_date','date','start','returned','follow_up_date','scheduled_date','order_date','ledger_date','sao_notice_date','period_end','report_due','report_date','sent_sao','sent_parent') and nullif(field_value,'') is not null then
   if field_value!~'^\d{4}-\d{2}-\d{2}$' or to_char(field_value::date,'YYYY-MM-DD')<>field_value then raise exception 'Invalid date field: %',field_name;end if;
  end if;
 end loop;
 foreach field_name in array array['plan_code','request_code','contract_code','material_code','asset_code'] loop
  if nullif(btrim(new.data->>field_name),'') is null then continue;end if;
  source_module=case field_name when 'plan_code' then 'plans' when 'request_code' then 'requests' when 'contract_code' then 'contracts' when 'material_code' then 'materials' when 'asset_code' then 'assets' end;
  select * into source_record from public.records where module=source_module and code=new.data->>field_name;
  if not found then raise exception 'Source record not found: %',field_name;end if;
  if new.module in ('contracts','inspections') and source_record.status not in ('อนุมัติ','ดำเนินการ','เสร็จสิ้น') then raise exception 'Source record must be approved: %',field_name;end if;
 end loop;
 if new.module='requests' then
  if nullif(btrim(new.data->>'plan_code'),'') is null and nullif(btrim(new.data->>'plan_exception'),'') is null then raise exception 'Plan reference or exemption reason required';end if;
  if (new.data->>'budget')::numeric<new.amount then raise exception 'Request exceeds recorded budget';end if;
 end if;
 if new.module='requisitions' and (new.data->>'quantity')::numeric<=0 then raise exception 'Requisition quantity must be positive';end if;
 if new.module='maintenance' and new.amount>0 and nullif(btrim(new.data->>'request_code'),'') is null then raise exception 'Paid maintenance requires a procurement request';end if;
 if new.module='annual' and (new.data->>'report_due')::date<(new.data->>'date')::date then raise exception 'Report deadline precedes inspection';end if;
 return new;
end $$;
drop trigger if exists record_readiness on public.records;
create trigger record_readiness before update of status on public.records for each row execute function public.check_record_readiness();
revoke all on function public.check_record_readiness(),public.guard_record() from public;
commit;
