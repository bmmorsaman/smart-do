import {validDate} from './procurement.js';
export function correctLedger(record,entries,id,details,actor,today,now=new Date().toISOString()){
 const previous=entries.find(e=>String(e.id)===String(id));if(!previous)throw Error('ไม่พบรายการรับ–จ่าย');
 let replacement=null;
 if(details){
  const quantity=Number(details.quantity),date=details.movement_date;
  if(!Number.isFinite(quantity)||quantity<=0||quantity>1e8||!validDate(date)||date<'1900-01-01'||date>today)throw Error('จำนวนหรือวันที่ไม่ถูกต้อง');
  const text=(v,max,required=false)=>{if(typeof v!=='string'||v.trim().length>max||required&&!v.trim())throw Error('ข้อมูลรายการไม่ถูกต้อง');return v.trim()};
  replacement={...previous,delta:Math.sign(previous.delta)*quantity,movement_date:date,document_no:text(details.document_no||'',100),sender:text(details.sender||'',200,true),party:previous.delta>0?text(details.party||'',200):'',recipient:previous.delta<0?text(details.recipient||'',200,true):'',updated_at:now,updated_by:actor};
 }
 const opening=Number(record.data.quantity)-entries.reduce((n,e)=>n+Number(e.delta),0);
 let balance=opening;
 const nextEntries=entries.filter(e=>String(e.id)!==String(id));if(replacement)nextEntries.push(replacement);
 nextEntries.sort((a,b)=>(a.movement_date||a.created_at.slice(0,10)).localeCompare(b.movement_date||b.created_at.slice(0,10))||a.created_at.localeCompare(b.created_at)||String(a.id).localeCompare(String(b.id)));
 for(const entry of nextEntries){balance+=Number(entry.delta);if(balance<-1e-9)throw Error('แก้ไขหรือลบไม่ได้ เพราะยอดวัสดุจะติดลบ ณ วันที่รับ–จ่าย');entry.balance=Math.abs(balance)<1e-9?0:balance}
 return {previous,replacement,entries:nextEntries,record:{...record,data:{...record.data,quantity:Math.abs(balance)<1e-9?0:balance},updated_at:now}};
}
