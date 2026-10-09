import test from 'node:test';
import assert from 'node:assert/strict';
import {createService,stockChange,filtered} from '../server/service.js';
import {hashPassword,verifyPassword,digest} from '../server/security.js';
import {createApiClient} from '../src/api-client.js';
const material={module:'materials',code:'MAT-TEST',title:'วัสดุทดสอบ',amount:125,data:{group:'สำนักงาน',unit:'รีม',minimum:2,quantity:0}};
function memory(){
 const tables=new Map();const table=name=>{if(!tables.has(name))tables.set(name,new Map());return tables.get(name)};
 const repo={get:async(name,id)=>structuredClone(table(name).get(id)||null),list:async(name,filter={})=>structuredClone([...table(name).values()].filter(row=>Object.entries(filter).every(([key,value])=>row[key]===value))),put:async(name,id,value)=>table(name).set(id,structuredClone(value)),delete:async(name,id)=>table(name).delete(id),rate:async()=>1,transaction:async fn=>{const before=structuredClone(tables);try{return await fn(repo)}catch(e){tables.clear();for(const [key,value] of before)tables.set(key,value);throw e}}};return repo;
}
async function fixture(){const repo=memory();await repo.put('users','admin',{id:'admin',email:'admin@example.org',full_name:'ผู้ดูแล',role:'admin',active:true,...await hashPassword('admin-password')});const service=createService(repo),login=await service({action:'login',email:'admin@example.org',password:'admin-password'});let n=0;const call=(input,bearer=login.token)=>service({request_id:'request-'+(++n),...input},bearer);return {repo,service,call,login}}
const select=table=>({action:'query',query:{table,operation:'select',filters:[],orders:[]}});
const upsert=(table,value)=>({action:'query',query:{table,operation:'upsert',value}});

test('Admin creates non-email login IDs with duplicate protection and existing email compatibility',async()=>{
 const f=await fixture();
 const create=email=>f.call({action:'manage-users',input:{action:'create',email,password:'staff-password',full_name:'Staff',role:'officer'}});
 const created=await create(' Staff01 ');assert.equal(created.user.email,'staff01');
 const login=await f.service({action:'login',email:' STAFF01 ',password:'staff-password'});
 assert.equal(login.user.id,created.user.id);
 await assert.rejects(create('STAFF01'),/มีบัญชีแล้ว/);
 await assert.rejects(create('staff one'),/ช่องว่าง/);
 const emailLogin=await f.service({action:'login',email:'admin@example.org',password:'admin-password'});
 assert.equal(emailLogin.user.role,'admin');
});
test('Mongo movement correction updates balances, preserves snapshots, audits deletion and protects stale edits',async()=>{
 const f=await fixture();await f.call(upsert('records',material));const record=(await f.call(select('records')))[0];
 const move=delta=>f.call({action:'movement',name:'move_stock_dated',args:{material_id:record.id,delta,entry_date:'2026-10-01',reason:delta>0?'รับ':'จ่าย',sender_name:'ผู้ควบคุม',recipient_name:delta<0?'ผู้รับ':''}});
 await move(10);await move(-3);let entries=await f.call(select('stock_movements')),received=entries.find(e=>e.delta>0),issued=entries.find(e=>e.delta<0);
 const change=(entry,operation,details)=>({action:'correct-movement',movement_id:entry.id,expected_version:entry.updated_at||entry.created_at,operation,details});
 const details={quantity:12,movement_date:'2026-10-01',document_no:'แก้เอกสาร',sender:'ผู้ควบคุมใหม่',party:'บริษัท'};
 assert.equal(await f.call(change(received,'edit',details)),9);
 entries=await f.call(select('stock_movements'));const revised=entries.find(e=>e.id===received.id);assert.equal(revised.unit_price,125);assert.equal(revised.created_at,received.created_at);assert.equal(revised.sender,'ผู้ควบคุมใหม่');
 await assert.rejects(f.call(change(received,'edit',details)),/เปลี่ยนแล้ว/);
 await assert.rejects(f.call(change(revised,'delete')),/ติดลบ/);assert.equal((await f.call(select('records')))[0].data.quantity,9);
 assert.equal(await f.call(change(issued,'delete')),12);assert.equal((await f.call(select('stock_movements'))).length,1);
 const log=await f.call(select('audit_log'));assert.equal(log.filter(e=>e.correction).length,2);assert.equal(log.find(e=>e.correction==='delete').movement_before.id,issued.id);
 await f.repo.put('users','viewer',{id:'viewer',role:'viewer',active:true});await f.repo.put('sessions',digest('viewer-token'),{user_id:'viewer',expires:new Date(Date.now()+60000)});
 await assert.rejects(f.call(change(revised,'delete'),'viewer-token'),/สิทธิ์/);
});
test('Mongo credentials support Thai passwords and use salted hashes',async()=>{const u=await hashPassword('รหัสผ่าน🔑123');assert.equal(await verifyPassword('รหัสผ่าน🔑123',u),true);assert.equal(await verifyPassword('wrong',u),false);assert.equal(u.password_hash.includes('รหัสผ่าน'),false)});
test('Mongo API enforces authentication and Admin user management',async()=>{
 const f=await fixture();await assert.rejects(f.service(select('records')),/เข้าสู่ระบบ/);
 await assert.rejects(f.call({action:'login',email:'admin@example.org',password:'wrong'}),/รหัสผ่าน/);
 const created=await f.call({action:'manage-users',input:{action:'create',email:'viewer@example.org',password:'viewer-password',full_name:'ผู้ดูข้อมูล',role:'viewer'}});assert.equal(created.user.password_hash,undefined);
 const viewer=await f.service({action:'login',email:'viewer@example.org',password:'viewer-password'});
 await assert.rejects(f.call(upsert('records',material),viewer.token),/สิทธิ์/);await assert.rejects(f.call({action:'manage-users',input:{action:'list'}},viewer.token),/Admin/);
 const profiles=await f.call(select('profiles'),viewer.token);assert.equal(profiles.length,1);assert.equal(profiles[0].id,created.user.id);assert.equal(profiles[0].salt,undefined);
 await assert.rejects(f.call(select('users')),/คำสั่ง/);await f.call({action:'logout'});await assert.rejects(f.call(select('records')),/เข้าสู่ระบบ/);
});
test('Mongo stock transaction preserves history, snapshots and idempotency and rolls back overdraw',async()=>{
 const f=await fixture();await f.call(upsert('records',material));const record=(await f.call(select('records')))[0];
 const movement=(delta,date='2026-10-01')=>({action:'movement',name:'move_stock_dated',args:{material_id:record.id,delta,entry_date:date,reason:delta>0?'รับเข้า':'จ่ายออก',sender_name:'ผู้ควบคุมวัสดุ',recipient_name:delta<0?'ผู้รับ':'',party_name:'บริษัท',document_ref:'DOC-001'}});
 assert.equal(await f.call(movement(10)),10);assert.equal(await f.call(movement(-3)),7);
 const before=(await f.call(select('stock_movements'))).length;await assert.rejects(f.call(movement(-20)),/ไม่เพียงพอ/);assert.equal((await f.call(select('stock_movements'))).length,before);assert.equal((await f.call(select('records')))[0].data.quantity,7);
 const repeat={...movement(2),request_id:'same-write'};assert.equal(await f.call(repeat),9);assert.equal(await f.call(repeat),9);
 const current=(await f.call(select('records')))[0];await assert.rejects(f.call(upsert('records',{...current,data:{...current.data,quantity:88}})),/รับหรือจ่าย/);
 await assert.rejects(f.call(upsert('records',{...current,data:{...current.data,unit:'กล่อง'}})),/หน่วยนับ/);
 const ledger=await f.call(select('stock_movements'));assert.equal(ledger[0].unit_price,125);assert.equal(ledger[0].document_no,'DOC-001');assert.equal((await f.call(select('audit_log'))).length,4);
});
test('Mongo backdated stock checks chronological balance and valid dates',()=>{
 const r={id:'mat',amount:10,data:{quantity:7}};const entries=[{id:'1',delta:10,movement_date:'2026-10-03',created_at:'2026-10-03T00:00:00Z'},{id:'2',delta:-3,movement_date:'2026-10-04',created_at:'2026-10-04T00:00:00Z'}];
 const args={delta:-1,entry_date:'2026-10-01',reason:'จ่าย',sender_name:'ผู้ควบคุม',recipient_name:'ผู้รับ'};
 assert.throws(()=>stockChange(r,entries,args,{full_name:'ผู้ดูแล'},new Date('2026-10-09')),/ไม่เพียงพอ/);
 assert.throws(()=>stockChange(r,entries,{...args,entry_date:'2026-02-30'},{full_name:'ผู้ดูแล'}),/วันที่/);
});
test('Stock entries saved in the same millisecond retain receipt-before-issue order',()=>{
 const now=new Date('2026-10-09T10:00:00Z'),record={id:'mat',amount:125,data:{quantity:0}},user={full_name:'ผู้ควบคุม'};
 const args={entry_date:'2026-10-09',reason:'รับจ่าย',sender_name:'ผู้ควบคุม',recipient_name:'ผู้รับ'};
 const received=stockChange(record,[],{...args,delta:10},user,now);
 const issued=stockChange(received.next,[received.movement],{...args,delta:-3},user,now);
 assert.ok(issued.movement.created_at>received.movement.created_at);assert.equal(issued.next.data.quantity,7);
});
test('Mongo query validation rejects operator injection and excessive pagination',()=>{
 assert.throws(()=>filtered([],{filters:[{field:'$where',operator:'eq',value:'x'}],orders:[]}),/ตัวกรอง/);
 assert.throws(()=>filtered([],{filters:[{field:'id',operator:'eq',value:{$ne:null}}],orders:[]}),/ตัวกรอง/);
 assert.throws(()=>filtered([],{filters:[],orders:[],range:[0,2000]}),/ช่วงข้อมูล/);
});
test('Mongo settings duplicates, organization, logo and restricted deletes',async()=>{
 const f=await fixture();await f.call(upsert('material_settings',{category:'sources',name:'บริษัท',active:true}));await assert.rejects(f.call(upsert('material_settings',{category:'sources',name:'บริษัท'})),/ซ้ำ/);
 const row=(await f.call(select('material_settings')))[0];await f.call({action:'query',query:{table:'material_settings',operation:'delete',filters:[{field:'id',operator:'eq',value:row.id}]}});assert.equal((await f.call(select('material_settings'))).length,0);
 await f.call(upsert('organization_settings',{name:'หน่วยงาน',address:'ที่อยู่'}));assert.equal((await f.call(select('organization_settings')))[0].id,1);
 await assert.rejects(f.call({action:'query',query:{table:'records',operation:'delete',filters:[]}}),/ห้ามลบ/);
});
test('Frontend Mongo adapter sends auth token and preserves existing query contracts',async()=>{
 const f=await fixture(),saved=new Map(),storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 const client=createApiClient('/api/data',{storage,transport:async(url,options)=>{try{return {status:200,json:async()=>({ok:true,data:await f.service(JSON.parse(options.body),options.headers.Authorization?.slice(7))})}}catch{throw Error('transport')}}});
 assert.equal((await client.auth.signInWithPassword({email:'admin@example.org',password:'admin-password'})).error,null);assert.equal((await client.auth.getUser()).data.user.role,'admin');await client.from('records').upsert(material);assert.equal((await client.from('records').select('*').in('module',['materials']).order('code').range(0,999)).data.length,1);
 await client.auth.signOut();assert.equal((await client.auth.getSession()).data.session,null);
});
