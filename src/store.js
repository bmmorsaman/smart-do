import {createApiClient} from './api-client.js';
import {demoRecords,demoVersion,demoMovements,demoSettings,demoSettingsVersion} from './demo-data.js';
import {validateChange,validateMaterial} from './procurement.js';
import {modules} from './domain.js';
import {validDate,localDate} from './procurement.js';
import {chronologicalMovements} from './material-calculations.js';
import {correctLedger} from './movement-corrections.js';
export const db=createApiClient();
let demo=false;
export const isDemo=()=>demo;
export function enableDemo(){demo=true}
const storageKey='thai-procurement-demo-v1';
function demoRows(){return JSON.parse(localStorage.getItem(storageKey)||'[]')}
function userError(error){
 const messages={'Cannot change unit after stock movements':'วัสดุมีประวัติรับ–จ่ายแล้ว เปลี่ยนหน่วยนับไม่ได้','Backdated issue exceeds stock on movement date':'วันที่จ่ายย้อนหลังมียอดวัสดุไม่เพียงพอ กรุณาตรวจวันที่รับเข้า','Insufficient stock':'วัสดุไม่เพียงพอ','Invalid movement date':'วันที่รับหรือจ่ายไม่ถูกต้อง หรือเกินวันนี้','Permission denied':'บัญชีนี้ไม่มีสิทธิ์บันทึกรายการ'};
 const match=Object.keys(messages).find(key=>String(error.message).includes(key));return match?new Error(messages[match]):error;
}
const auditKey=storageKey+'-audit';
const movementKey=storageKey+'-movements';
function logDemo(action,before,after){
 const entries=JSON.parse(localStorage.getItem(auditKey)||'[]');
 entries.unshift({id:crypto.randomUUID(),record_id:after?.id||before?.id,actor:'ผู้ทดสอบระบบ',action,old_data:before||null,new_data:after||null,created_at:new Date().toISOString()});
 localStorage.setItem(auditKey,JSON.stringify(entries.slice(0,200)));
}
export async function seedDemo(){
 if(!demo)throw Error('เพิ่มตัวอย่างได้เฉพาะโหมดทดลอง');
 for(const key of [storageKey,movementKey,auditKey,'thai-material-settings-v1']){
  const stored=localStorage.getItem(key);if(!stored)continue;
  const updated=stored.replaceAll('ผู้คุมคลังตัวอย่าง ก','ผู้ควบคุมวัสดุตัวอย่าง ก').replaceAll('ผู้คุมคลังตัวอย่าง ข','ผู้ควบคุมวัสดุตัวอย่าง ข');
  if(updated!==stored)localStorage.setItem(key,updated);
 }
 const versionKey=storageKey+'-seed-version';
 if(localStorage.getItem(versionKey)===demoVersion){if(localStorage.getItem('thai-material-settings-v1-seed-version')!==demoSettingsVersion)await seedDemoSettings();return;}
 await resetDemo();
}
export async function seedDemoSettings(){
 if(!demo)throw Error('เพิ่มตัวอย่างตั้งค่าได้เฉพาะโหมดทดลอง');
 const key='thai-material-settings-v1',settings=JSON.parse(localStorage.getItem(key)||'[]');
 for(const [category,names] of Object.entries(demoSettings()))for(const name of names)if(!settings.some(e=>e.category===category&&e.name.toLocaleLowerCase()===name.toLocaleLowerCase()))settings.push({id:crypto.randomUUID(),category,name,active:true});
 localStorage.setItem(key,JSON.stringify(settings));localStorage.setItem(key+'-seed-version',demoSettingsVersion);
}
export async function resetDemo(){
 if(!demo)throw Error('รีเซ็ตได้เฉพาะข้อมูลทดลอง');
 const now=new Date(),records=demoRecords(now),movements=demoMovements(now),entries=[],audit=[];
 const withoutCount=record=>{const copy=structuredClone(record);for(const key of ['counted_quantity','count_book_quantity','count_date','count_by'])delete copy.data[key];return copy};
 for(const record of records){const first=movements.find(e=>e.code===record.code);record.id=crypto.randomUUID();record.created_at=first?new Date(new Date(first.created_at).getTime()-1).toISOString():now.toISOString();record.updated_at=now.toISOString();const inserted=withoutCount(record);inserted.data.quantity=0;audit.push({id:crypto.randomUUID(),record_id:record.id,actor:'ผู้ทดสอบระบบ',action:'INSERT',old_data:null,new_data:inserted,created_at:record.created_at})}
 const balances=new Map(records.map(r=>[r.code,0]));
 for(const item of movements){const record=records.find(r=>r.code===item.code),before=withoutCount(record);before.data.quantity=balances.get(item.code);const balance=before.data.quantity+item.delta;balances.set(item.code,balance);const after=withoutCount(record);after.data.quantity=balance;after.updated_at=item.created_at;
  entries.push({id:entries.length+1,record_id:record.id,delta:item.delta,balance,unit_price:item.unpriced?null:Number(item.unit_price??record.amount),document_no:item.document_no,party:item.party,reason:item.reason,sender:item.sender,recipient:item.recipient,actor:'ผู้ทดสอบระบบ',movement_date:localDate(new Date(item.created_at)),created_at:item.created_at});
  audit.push({id:crypto.randomUUID(),record_id:record.id,actor:'ผู้ทดสอบระบบ',action:'UPDATE',old_data:before,new_data:after,movement_date:localDate(new Date(item.created_at)),created_at:item.created_at});
 }
 for(const record of records)if(record.data.counted_quantity!==undefined)audit.push({id:crypto.randomUUID(),record_id:record.id,actor:'ผู้ทดสอบระบบ',action:'UPDATE',old_data:withoutCount(record),new_data:structuredClone(record),created_at:now.toISOString()});
 const settings=Object.entries(demoSettings()).flatMap(([category,names])=>names.map(name=>({id:crypto.randomUUID(),category,name,active:true})));
 localStorage.setItem(storageKey,JSON.stringify(records));localStorage.setItem(movementKey,JSON.stringify(entries.reverse()));localStorage.setItem(auditKey,JSON.stringify(audit.sort((a,b)=>b.created_at.localeCompare(a.created_at))));
 localStorage.setItem('thai-material-settings-v1',JSON.stringify(settings));localStorage.setItem('thai-material-settings-v1-seed-version',demoSettingsVersion);localStorage.setItem('thai-material-settings-v1-initialized','1');localStorage.setItem(storageKey+'-seed-version',demoVersion);
}
export async function auditEntries(id){
 if(demo)return JSON.parse(localStorage.getItem(auditKey)||'[]').filter(entry=>modules[entry.new_data?.module||entry.old_data?.module]&&(!id||entry.record_id===id)).slice(0,200);
 let request=db.from('audit_log').select('*').order('created_at',{ascending:false}).order('id',{ascending:false}).limit(200);if(id)request=request.eq('record_id',id);
 const {data,error}=await request;
 if(error)throw error;return data;
}
export async function stockEntries(id){
 if(demo)return JSON.parse(localStorage.getItem(movementKey)||'[]').filter(entry=>entry.record_id===id);
 const entries=[];let offset=0;
 for(;;){const {data,error}=await db.from('stock_movements').select('*').eq('record_id',id).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+999);if(error)throw error;entries.push(...data);if(data.length<1000)return entries;offset+=1000}
}
export async function correctMovement(entry,details){
 if(demo){
  const rows=demoRows(),record=rows.find(r=>r.id===entry.record_id),all=JSON.parse(localStorage.getItem(movementKey)||'[]');
  const before=structuredClone(record),result=correctLedger(record,all.filter(e=>e.record_id===record.id),entry.id,details,'ผู้ทดสอบระบบ',localDate());
  rows[rows.findIndex(r=>r.id===record.id)]=result.record;
  localStorage.setItem(storageKey,JSON.stringify(rows));localStorage.setItem(movementKey,JSON.stringify([...all.filter(e=>e.record_id!==record.id),...result.entries]));
  logDemo('UPDATE',before,result.record);
  const logs=JSON.parse(localStorage.getItem(auditKey)||'[]');Object.assign(logs[0],{correction:details?'edit':'delete',movement_before:result.previous,movement_after:result.replacement});localStorage.setItem(auditKey,JSON.stringify(logs));return;
 }
 const {error}=await db.correctMovement({movement_id:String(entry.id),expected_version:entry.updated_at||entry.created_at,operation:details?'edit':'delete',details});if(error)throw error;
}
export async function list(){if(demo)return demoRows().filter(record=>modules[record.module]);const records=[];for(let offset=0;;offset+=1000){const {data,error}=await db.from('records').select('*').in('module',Object.keys(modules)).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+999);if(error)throw error;records.push(...data);if(data.length<1000)return records}}
export async function save(record){if(!modules[record.module])throw Error('ระบบรองรับเฉพาะวัสดุ');if(demo){let rows=demoRows();const existing=rows.find(r=>r.id===record.id);validateChange(record,existing,rows,'admin');validateMaterial(record,existing);if(existing&&record.data.unit!==existing.data.unit&&JSON.parse(localStorage.getItem(movementKey)||'[]').some(e=>e.record_id===record.id))throw Error('วัสดุมีประวัติรับ–จ่ายแล้ว เปลี่ยนหน่วยนับไม่ได้');if(rows.some(r=>r.id!==record.id&&r.module===record.module&&r.code===record.code))throw Error('รหัสรายการซ้ำในทะเบียน');if(!existing)record.id=crypto.randomUUID();record.created_at=existing?.created_at||new Date().toISOString();record.updated_at=new Date().toISOString();rows=rows.filter(r=>r.id!==record.id);rows.unshift(record);localStorage.setItem(storageKey,JSON.stringify(rows));logDemo(existing?'UPDATE':'INSERT',existing,record);return}validateMaterial(record,record.id?record:null);const {error}=await db.from('records').upsert(record);if(error)throw userError(error)}
export async function remove(id){if(demo){const rows=demoRows(),existing=rows.find(r=>r.id===id);if(existing&&Number(existing.data.quantity)!==0)throw Error('ลบไม่ได้: ยังมีวัสดุคงเหลือ กรุณาตรวจและแก้รายการรับ–จ่ายให้ถูกต้องก่อน');localStorage.setItem(storageKey,JSON.stringify(rows.filter(r=>r.id!==id)));if(existing)logDemo('DELETE',existing,null);return}const {error}=await db.from('records').delete().eq('id',id);if(error)throw error}
export async function profile(){if(demo)return {role:'admin',full_name:'ผู้ทดสอบระบบ'};const identity=await db.auth.getUser();if(identity.error)throw identity.error;const user=identity.data.user;if(!user)return null;const {data,error}=await db.from('profiles').select('*').eq('id',user.id).single();if(error)throw error;return {...data,email:user.email}}
export async function movement(id,quantity,note,details={}){
 const entryDate=details.movement_date??localDate();
 if(!validDate(entryDate)||entryDate<'1900-01-01'||entryDate>localDate())throw Error('ระบุวันที่รับหรือจ่ายให้ถูกต้อง และไม่เกินวันนี้');
 if(String(details.sender||'').length>200||String(details.recipient||'').length>200)throw Error('ชื่อผู้ควบคุมหรือผู้รับยาวเกินกำหนด');
 if(String(details.document_no||'').length>100||String(details.party||'').length>200||String(details.department||'').length>200)throw Error('ข้อมูลเอกสารหรือผู้รับยาวเกินกำหนด');
 if(!Number.isFinite(quantity)||quantity===0||Math.abs(quantity)>100000000||!String(note??'').trim()||String(note).length>300)throw Error('ระบุจำนวนและข้อมูลรับจ่ายให้ถูกต้อง');
 if(demo){
  const rows=demoRows(),r=rows.find(r=>r.id===id&&r.module==='materials');
  if(!r||Number(r.data.quantity||0)+quantity<0)throw Error('วัสดุไม่เพียงพอ');
  const before=structuredClone(r),timestamp=new Date().toISOString(),entries=JSON.parse(localStorage.getItem(movementKey)||'[]');
  const next={id:entries.reduce((max,e)=>Math.max(max,Number(e.id)||0),0)+1,sender:details.sender||'',recipient:details.recipient||'',document_no:details.document_no||'',party:details.party||'',department:details.department||'',record_id:id,delta:quantity,balance:Number(r.data.quantity||0)+quantity,unit_price:Number(r.amount),reason:note,actor:'ผู้ทดสอบระบบ',movement_date:entryDate,created_at:timestamp};
  const updated={...r,data:{...r.data,quantity:next.balance}},history=chronologicalMovements(updated,[...entries.filter(e=>e.record_id===id),next]);
  if(history.some(e=>e.balance<0))throw Error('วันที่จ่ายย้อนหลังมียอดวัสดุไม่เพียงพอ กรุณาตรวจวันที่รับเข้า');
  r.data.quantity=next.balance;r.updated_at=timestamp;
  const balances=new Map(history.map(e=>[e.id,e.balance]));entries.unshift(next);for(const e of entries)if(e.record_id===id)e.balance=balances.get(e.id);
  localStorage.setItem(storageKey,JSON.stringify(rows));localStorage.setItem(movementKey,JSON.stringify(entries));logDemo('UPDATE',before,r);return;
 }
 const {error}=await db.rpc('move_stock_dated',{material_id:id,delta:quantity,reason:note,document_ref:details.document_no||'',party_name:details.party||'',department_name:details.department||'',sender_name:details.sender||'',recipient_name:details.recipient||'',entry_date:entryDate});
 if(error)throw userError(error);
}
