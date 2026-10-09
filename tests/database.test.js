import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {demoRecords} from '../src/demo-data.js';

test('PostgreSQL schema, workflow guards and RLS',async t=>{
 const pg=await PGlite.create();
 const ids={admin:'00000000-0000-0000-0000-000000000001',officer:'00000000-0000-0000-0000-000000000002',approver:'00000000-0000-0000-0000-000000000003',viewer:'00000000-0000-0000-0000-000000000004'};
 const examples=demoRecords(new Date(2026,9,7));
 const query=(sql,params=[])=>pg.query(sql,params);
 const as=async role=>{await pg.exec('reset role');await query("select set_config('request.jwt.claim.sub',$1,false)",[ids[role]||'']);await pg.exec(`set role ${role==='anon'?'anon':'authenticated'}`)};
 const insert=async record=>{
  const result=await query("insert into public.records(module,code,title,amount,fiscal_year,data) values($1,$2,$3,$4,$5,$6) returning *",[record.module,record.code,record.title,record.amount,record.fiscal_year,record.data]);
  return result.rows[0];
 };
 const transition=(id,status)=>query('update public.records set status=$2 where id=$1 returning *',[id,status]);
 try{
  await pg.exec(`create role anon;create role authenticated;
   create schema auth;
   create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon;
   grant execute on function auth.uid() to authenticated,anon;`);
  await pg.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
  for(const [role,id] of Object.entries(ids)){
   await query('insert into auth.users(id) values($1)',[id]);
   await query('update public.profiles set role=$2 where id=$1',[id,role]);
  }
  await t.test('Workflow migration applies without destroying existing records',async()=>{
   await as('officer');await insert({...examples.find(r=>r.module==='materials'),code:'MIGRATION-VENDOR'});
   await pg.exec('reset role');
   await query("insert into records(module,code,title,amount,fiscal_year) values('plans','LEGACY-PLAN','ข้อมูลเมนูเดิม',0,2570)");
   await pg.exec(await readFile(new URL('../supabase/migrations/202610070001_procurement_workflow.sql',import.meta.url),'utf8'));
   await pg.exec(await readFile(new URL('../supabase/migrations/202610070002_stock_card_values.sql',import.meta.url),'utf8'));
   await pg.exec(await readFile(new URL('../supabase/migrations/202610070003_records_reports_only.sql',import.meta.url),'utf8'));
   await pg.exec(await readFile(new URL('../supabase/migrations/202610070004_materials_assets_only.sql',import.meta.url),'utf8'));
   await pg.exec(await readFile(new URL('../supabase/migrations/202610070005_materials_reports.sql',import.meta.url),'utf8'));
   await pg.exec(await readFile(new URL('../supabase/migrations/202610070006_movement_people.sql',import.meta.url),'utf8'));
   await pg.exec(await readFile(new URL('../supabase/migrations/202610070007_material_settings.sql',import.meta.url),'utf8'));
   await pg.exec(await readFile(new URL('../supabase/migrations/202610070008_movement_dates.sql',import.meta.url),'utf8'));
   await pg.exec(await readFile(new URL('../supabase/migrations/202610070009_settings_delete.sql',import.meta.url),'utf8'));
   await pg.exec(await readFile(new URL('../supabase/migrations/202610070010_material_unit_guard.sql',import.meta.url),'utf8'));
   await pg.exec(await readFile(new URL('../supabase/migrations/202610080011_material_locations.sql',import.meta.url),'utf8'));
   await pg.exec(await readFile(new URL('../supabase/migrations/202610080012_material_sources.sql',import.meta.url),'utf8'));
   await pg.exec(await readFile(new URL('../supabase/migrations/202610080013_app_logos.sql',import.meta.url),'utf8'));
   await pg.exec(await readFile(new URL('../supabase/migrations/202610080014_organization_settings.sql',import.meta.url),'utf8'));
   assert.equal((await query("select count(*)::int as n from records where code='MIGRATION-VENDOR'")).rows[0].n,1);
   assert.equal((await query("select count(*)::int as n from records where code='LEGACY-PLAN'")).rows[0].n,1);
   await as('officer');assert.equal((await query("select * from records where code='LEGACY-PLAN'")).rows.length,0);
  });
  await as('officer');
  await t.test('Non-finite financial and depreciation values are rejected at insertion',async()=>{
   const assetExample=examples.find(r=>r.module==='materials');
   await assert.rejects(()=>insert({...assetExample,code:'INVALID-AMOUNT',amount:'NaN'}),/Invalid amount/);
  });
  await t.test('Partial records and historical statuses do not restrict recording',async()=>{
   await as('officer');
   const record=await insert({...examples.find(r=>r.module==='materials'),code:'DATA-ONLY'});
   await query('update records set status=$2 where id=$1',[record.id,'อนุมัติ']);
   await query('update records set title=$2,data=$3 where id=$1',[record.id,'แก้ข้อมูลได้ทุกสถานะ',{...record.data,notes:'บันทึกข้อมูลเพิ่มเติม'}]);
   assert.equal((await query('select title from records where id=$1',[record.id])).rows[0].title,'แก้ข้อมูลได้ทุกสถานะ');
   await as('approver');
   assert.equal((await query('update records set title=$2 where id=$1 returning *',[record.id,'แก้โดยผู้ไม่มีสิทธิ์บันทึก'])).rows.length,0);
   await as('admin');await query('delete from records where id=$1',[record.id]);
   await as('officer');
  });
  const material=await insert(examples.find(r=>r.module==='materials'));
  await t.test('Stock RPC records evidence and rejects overdraw without altering balance',async()=>{
   await query('select public.move_stock($1,$2,$3)',[material.id,10,'DB-RECEIPT']);
   await assert.rejects(()=>query('select public.move_stock($1,$2,$3)',[material.id,-11,'DB-ISSUE']),/Insufficient stock/);
   assert.equal((await query('select data from records where id=$1',[material.id])).rows[0].data.quantity,10);
   assert.equal((await query('select count(*)::int as n from stock_movements where record_id=$1',[material.id])).rows[0].n,1);
   assert.equal(Number((await query('select unit_price from stock_movements where record_id=$1',[material.id])).rows[0].unit_price),Number(material.amount));
   await query('update records set amount=$2 where id=$1',[material.id,150]);
   await query('select public.move_stock($1,$2,$3)',[material.id,1,'DB-NEW-PRICE']);
   const prices=(await query('select reason,unit_price from stock_movements where record_id=$1 order by id',[material.id])).rows;
   assert.equal(Number(prices[0].unit_price),Number(material.amount));assert.equal(Number(prices[1].unit_price),150);
   await assert.rejects(()=>query("update records set data=jsonb_set(data,'{quantity}','20') where id=$1",[material.id]),/Use move_stock/);
   await assert.rejects(()=>query("update records set data=jsonb_set(data,'{unit}','\"ชิ้น\"') where id=$1",[material.id]),/Cannot change unit/);
  });
  await t.test('Movement dates support backdating while protecting chronological balances',async()=>{
   await as('officer');const dated=await insert({...examples.find(r=>r.module==='materials'),code:'DATED-MATERIAL'});
   const dates=(await query("select (now() at time zone 'Asia/Bangkok')::date::text as today,((now() at time zone 'Asia/Bangkok')::date-1)::text as yesterday")).rows[0];
   const move=(qty,reason,day)=>query('select public.move_stock_dated($1,$2,$3,entry_date=>$4::date)',[dated.id,qty,reason,day]);
   await move(10,'TODAY',dates.today);
   await assert.rejects(()=>move(-2,'INVALID-BACKDATE',dates.yesterday),/Backdated issue/);
   await move(5,'YESTERDAY-RECEIPT',dates.yesterday);await move(-2,'YESTERDAY-ISSUE',dates.yesterday);
   const history=(await query('select movement_date::text as day,balance from stock_movements where record_id=$1 order by movement_date,created_at,id',[dated.id])).rows;
   assert.deepEqual(history.map(e=>Number(e.balance)),[5,3,13]);assert.equal(history[0].day,dates.yesterday);
   assert.equal(Number((await query('select data from records where id=$1',[dated.id])).rows[0].data.quantity),13);
   await assert.rejects(()=>move(1,'FUTURE','2999-01-01'),/Invalid movement date/);
  });
  await t.test('Setting lists validate duplicates and respect staff permissions',async()=>{
   await as('officer');
   const item=(await query("insert into material_settings(category,name) values('recipients','ผู้รับทดสอบ') returning *")).rows[0];
   const location=(await query("insert into material_settings(category,name) values('locations','ห้องเก็บทดสอบ') returning *")).rows[0];
   assert.equal(location.category,'locations');
   await query("update organization_settings set name='หน่วยงานทดสอบ',address='ที่อยู่ทดสอบ' where id=1");
   await query("insert into app_logos(slot,data_url) values('ministry','data:image/png;base64,AAAA')");
   await assert.rejects(()=>query("insert into app_logos(slot,data_url) values('unknown','data:image/png;base64,AAAA')"),/check constraint/);
   assert.equal((await query("insert into material_settings(category,name) values('sources','คลังทดสอบ') returning category")).rows[0].category,'sources');
   await assert.rejects(()=>query("insert into material_settings(category,name) values('recipients',' ผู้รับทดสอบ ')"),/duplicate key/);
   await query('update material_settings set active=false where id=$1',[item.id]);
   await as('viewer');
   assert.equal((await query('select active from material_settings where id=$1',[item.id])).rows[0].active,false);
   await assert.rejects(()=>query("insert into material_settings(category,name) values('units','ชิ้นทดสอบ')"),/row-level security/);
   assert.equal((await query('update material_settings set active=true where id=$1 returning *',[item.id])).rows.length,0);
   assert.equal((await query('delete from material_settings where id=$1 returning *',[item.id])).rows.length,0);
   await as('officer');assert.equal((await query('delete from material_settings where id=$1 returning *',[item.id])).rows.length,1);
  });
  await t.test('Viewer is read-only; anonymous users cannot read; audit writes stay protected',async()=>{
   await as('viewer');assert.ok((await query('select * from records')).rows.length>0);
   await assert.rejects(()=>insert({...examples.find(r=>r.module==='materials'),code:'VIEWER-WRITE'}),/row-level security/);
   assert.equal((await query('update records set title=$2 where id=$1 returning *',[material.id,'viewer edit'])).rows.length,0);
   await assert.rejects(()=>query('select public.move_stock($1,$2,$3)',[material.id,1,'VIEWER-STOCK']),/Permission denied/);
   await assert.rejects(()=>query("insert into audit_log(action) values('FAKE')"),/permission denied/);
   await as('anon');await assert.rejects(()=>query('select * from records'),/permission denied/);
  });
 }finally{await pg.close()}
});
