import {randomUUID} from 'node:crypto';
import {account,AppError,digest,hashPassword,verifyPassword,token,publicUser,requireText} from './security.js';
import {validDate,validateMaterial} from '../src/procurement.js';
import {correctLedger} from '../src/movement-corrections.js';
const tables=['records','stock_movements','audit_log','material_settings','organization_settings','app_logos','profiles'];
const categories=['custodians','recipients','groups','units','locations','sources'];
const clean=row=>{const {normalized_name,...value}=row;return value};
export function filtered(rows,q){
 if(!Array.isArray(q.filters)||q.filters.length>10||!Array.isArray(q.orders)||q.orders.length>10)throw new AppError('ตัวกรองไม่ถูกต้อง');
 for(const f of q.filters)if(!/^[a-z_]+$/.test(f.field)||!['eq','in'].includes(f.operator)||f.operator==='in'&&(!Array.isArray(f.value)||f.value.length>100)||f.operator==='eq'&&typeof f.value==='object')throw new AppError('ตัวกรองไม่ถูกต้อง');
 rows=rows.filter(row=>q.filters.every(f=>f.operator==='eq'?row[f.field]===f.value:f.value.includes(row[f.field])));
 for(const o of [...q.orders].reverse()){if(!/^[a-z_]+$/.test(o.field))throw new AppError('การเรียงไม่ถูกต้อง');rows.sort((a,b)=>{const x=a[o.field],y=b[o.field],n=typeof x==='number'&&typeof y==='number'?x-y:String(x??'').localeCompare(String(y??''));return o.ascending?n:-n})}
 const start=q.range?.[0]||0,end=q.range?q.range[1]+1:q.limit||1000;
 if(!Number.isInteger(start)||start<0||!Number.isInteger(end)||end<start||end-start>1000)throw new AppError('ช่วงข้อมูลไม่ถูกต้อง');
 rows=rows.slice(start,end).map(clean);
 if(q.columns&&q.columns!=='*'){const fields=q.columns.split(',');if(fields.some(k=>! /^[a-z_]+$/.test(k)))throw new AppError('คอลัมน์ไม่ถูกต้อง');rows=rows.map(row=>Object.fromEntries(fields.map(k=>[k,row[k]])))}
 if(q.single&&rows.length!==1)throw new AppError('ไม่พบข้อมูล');
 return q.single||q.maybeSingle?rows[0]||null:rows;
}
export function stockChange(record,entries,args,user,now=new Date()){
 const delta=args.delta,date=args.entry_date,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 if(!Number.isFinite(delta)||delta===0||Math.abs(delta)>1e8||!validDate(date)||date<'1900-01-01'||date>today)throw new AppError('จำนวนหรือวันที่รับ–จ่ายไม่ถูกต้อง');
 const latest=entries.reduce((n,e)=>Math.max(n,Date.parse(e.created_at)||0),0),timestamp=new Date(Math.max(now.getTime(),latest+1)).toISOString();
 const movement={id:randomUUID(),record_id:record.id,delta,unit_price:Number(record.amount),reason:requireText(args.reason,300),sender:requireText(args.sender_name,200),recipient:requireText(args.recipient_name||'',200,delta<0),party:delta>0?requireText(args.party_name||'',200,false):'',document_no:requireText(args.document_ref||'',100,false),department:requireText(args.department_name||'',200,false),actor:user.full_name,movement_date:date,created_at:timestamp};
 const next=structuredClone(record);next.data.quantity=Number(record.data.quantity)+delta;next.updated_at=now.toISOString();
 let balance=Number(record.data.quantity)-entries.reduce((n,e)=>n+e.delta,0);
 for(const m of [...entries,movement].sort((a,b)=>a.movement_date.localeCompare(b.movement_date)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id))){balance+=m.delta;if(balance<0)throw new AppError('วัสดุไม่เพียงพอ ณ วันที่จ่าย');if(m.id===movement.id)movement.balance=balance}
 return {next,movement};
}
export function createService(repo){
 const audit=async(tx,before,after,user,extra={})=>{const row={id:randomUUID(),record_id:after.id,actor:user.full_name,action:before?'UPDATE':'INSERT',old_data:before,new_data:after,created_at:new Date().toISOString(),...extra};await tx.put('audit_log',row.id,row)};
 const write=async(input,user,fn)=>{
  const id=requireText(input.request_id,100);if(!/^[\w-]+$/.test(id))throw new AppError('รหัสคำขอไม่ถูกต้อง');
  return repo.transaction(async tx=>{const key=user.id+':'+id,previous=await tx.get('requests',key);if(previous)return previous.result;const result=await fn(tx);await tx.put('requests',key,{result,expires:new Date(Date.now()+86400000)});return result});
 };
 return async(input,bearer)=>{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new AppError('คำขอไม่ถูกต้อง');
  if(input.action==='login'){
   const email=requireText(input.email,254).toLowerCase(),password=input.password;
   if(typeof password!=='string'||password.length>128)throw new AppError('ID / อีเมลหรือรหัสผ่านไม่ถูกต้อง',401);
   if(await repo.rate(digest(email))>10)throw new AppError('ลองเข้าสู่ระบบหลายครั้ง กรุณารอ 15 นาที',429);
   const user=(await repo.list('users',{email}))[0];if(!user||!user.active||!await verifyPassword(password,user))throw new AppError('ID / อีเมลหรือรหัสผ่านไม่ถูกต้อง',401);
   await repo.delete('login_attempts',digest(email));const value=token();await repo.put('sessions',digest(value),{user_id:user.id,expires:new Date(Date.now()+6*3600000)});return {token:value,user:publicUser(user)};
  }
  const session=typeof bearer==='string'&&bearer.length<200?await repo.get('sessions',digest(bearer)):null;
  const user=session&&new Date(session.expires)>new Date()?await repo.get('users',session.user_id):null;
  if(!user?.active)throw new AppError('กรุณาเข้าสู่ระบบใหม่',401);
  if(input.action==='identity')return publicUser(user);
  if(input.action==='logout'){await repo.delete('sessions',digest(bearer));return null}
  if(input.action==='manage-users'){
   if(user.role!=='admin')throw new AppError('ใช้ได้เฉพาะ Admin',403);
   if(input.input?.action==='list')return {users:(await repo.list('users')).map(publicUser)};
   if(input.input?.action!=='create')throw new AppError('คำสั่งไม่ถูกต้อง');
   const a=account(input.input),credentials=await hashPassword(a.password);
   return write(input,user,async tx=>{if((await tx.list('users',{email:a.email})).length)throw new AppError('ID / อีเมลนี้มีบัญชีแล้ว');const row={id:randomUUID(),email:a.email,full_name:a.full_name,role:a.role,active:true,...credentials};await tx.put('users',row.id,row);return {user:publicUser(row)}});
  }
  if(input.action==='movement'){
   if(!['admin','officer'].includes(user.role))throw new AppError('ไม่มีสิทธิ์บันทึก',403);
   if(input.name!=='move_stock_dated')throw new AppError('คำสั่งไม่ถูกต้อง');
   return write(input,user,async tx=>{const id=requireText(input.args?.material_id,100),record=await tx.get('records',id);if(!record)throw new AppError('ไม่พบวัสดุ');const {next,movement}=stockChange(record,await tx.list('stock_movements',{record_id:id}),input.args,user);await tx.put('records',id,next);await tx.put('stock_movements',movement.id,movement);await audit(tx,record,next,user);return next.data.quantity});
  }
  if(input.action==='correct-movement'){
   if(!['admin','officer'].includes(user.role))throw new AppError('ไม่มีสิทธิ์แก้ไขรายการ',403);
   if(!['edit','delete'].includes(input.operation))throw new AppError('คำสั่งไม่ถูกต้อง');
   return write(input,user,async tx=>{
    const id=requireText(input.movement_id,100),previous=await tx.get('stock_movements',id);if(!previous)throw new AppError('ไม่พบรายการรับ–จ่าย');
    if(input.expected_version!==(previous.updated_at||previous.created_at))throw new AppError('รายการเปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่ก่อนแก้ไข',409);
    const record=await tx.get('records',previous.record_id);if(!record)throw new AppError('ไม่พบวัสดุ');
    const now=new Date(),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
    let result;try{result=correctLedger(record,await tx.list('stock_movements',{record_id:record.id}),id,input.operation==='edit'?input.details:null,user.full_name,today,now.toISOString())}catch(error){throw new AppError(error.message)}
    await tx.put('records',record.id,result.record);
    if(input.operation==='delete')await tx.delete('stock_movements',id);
    for(const entry of result.entries)await tx.put('stock_movements',entry.id,entry);
    await audit(tx,record,result.record,user,{correction:input.operation,movement_before:result.previous,movement_after:result.replacement});
    return result.record.data.quantity;
   });
  }
  if(input.action!=='query'||!tables.includes(input.query?.table))throw new AppError('คำสั่งไม่ถูกต้อง');
  const q=input.query,table=q.table;
  if(q.operation==='select')return filtered(table==='profiles'?[publicUser(user)]:await repo.list(table),q);
  if(!['admin','officer'].includes(user.role)||['profiles','stock_movements','audit_log'].includes(table))throw new AppError('ไม่มีสิทธิ์แก้ไขข้อมูล',403);
  return write(input,user,async tx=>{
   if(q.operation==='delete'){
    const f=q.filters?.[0];if(!['material_settings','app_logos'].includes(table)||q.filters.length!==1||f.operator!=='eq'||f.field!==(table==='app_logos'?'slot':'id')||typeof f.value!=='string')throw new AppError('ห้ามลบข้อมูลนี้');await tx.delete(table,f.value);return null;
   }
   if(q.operation!=='upsert'||!q.value||typeof q.value!=='object'||Array.isArray(q.value))throw new AppError('ข้อมูลไม่ถูกต้อง');
   const v=q.value;let row,id,old;
   if(table==='records'){
    id=v.id?requireText(v.id,100):randomUUID();old=await tx.get(table,id);if(v.id&&!old)throw new AppError('ไม่พบทะเบียน');validateMaterial(v,old);
    if(old&&old.data.unit!==v.data.unit&&(await tx.list('stock_movements',{record_id:id})).length)throw new AppError('วัสดุมีประวัติแล้ว เปลี่ยนหน่วยนับไม่ได้');
    if((await tx.list(table,{code:v.code.trim()})).some(r=>r.id!==id))throw new AppError('รหัสวัสดุซ้ำ');
    const data={};for(const key of ['group','unit','location','custodian','notes'])data[key]=requireText(v.data[key]||'',key==='notes'?2000:200,['group','unit'].includes(key));
    data.minimum=Number(v.data.minimum||0);data.quantity=old?.data.quantity||0;
    row={id,module:'materials',code:v.code.trim(),title:v.title.trim(),amount:Number(v.amount),status:typeof v.status==='string'?v.status:'',fiscal_year:v.fiscal_year,data,created_at:old?.created_at||new Date().toISOString(),updated_at:new Date().toISOString()};
   }else if(table==='material_settings'){
    if(!categories.includes(v.category))throw new AppError('หมวดตั้งค่าไม่ถูกต้อง');id=v.id?requireText(v.id,100):randomUUID();old=await tx.get(table,id);const name=requireText(v.name,200);if(old&&old.category!==v.category)throw new AppError('เปลี่ยนหมวดไม่ได้');const normalized_name=name.toLowerCase();if((await tx.list(table,{category:v.category,normalized_name})).some(r=>r.id!==id))throw new AppError('ชื่อรายการซ้ำ');row={id,category:v.category,name,normalized_name,active:v.active!==false};
   }else if(table==='organization_settings'){id=1;row={id,name:requireText(v.name,300),address:requireText(v.address,1000)}}
   else if(table==='app_logos'){if(!['ministry','health_center'].includes(v.slot)||typeof v.data_url!=='string'||v.data_url.length>500000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v.data_url))throw new AppError('โลโก้ไม่ถูกต้อง');id=v.slot;row={slot:id,data_url:v.data_url}}
   await tx.put(table,id,row);if(table==='records')await audit(tx,old,row,user);return null;
  });
 };
}
