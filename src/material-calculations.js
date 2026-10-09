import {localDate,validDate} from './procurement.js';
export function movementDate(entry){return validDate(entry.movement_date)?entry.movement_date:localDate(new Date(entry.created_at))}
export function chronologicalMovements(record,entries){
 let balance=Number(record.data.quantity||0)-entries.reduce((sum,e)=>sum+Number(e.delta),0);
 return entries.map(e=>({...e,day:movementDate(e)})).sort((a,b)=>a.day.localeCompare(b.day)||a.created_at.localeCompare(b.created_at)||Number(a.id||0)-Number(b.id||0)).map(e=>{balance+=Number(e.delta);return {...e,balance}});
}
export function summarizeMaterial(record,entries,from,to){
 if(!validDate(from)||!validDate(to)||from>to)throw Error('ระบุช่วงวันที่ให้ถูกต้อง');
 const dated=chronologicalMovements(record,entries);
 const selected=dated.filter(e=>e.day>=from&&e.day<=to);
 const before=dated.filter(e=>e.day<from),after=dated.find(e=>e.day>to);
 const opening=selected.length?Number(selected[0].balance)-Number(selected[0].delta):before.length?Number(before.at(-1).balance):after?Number(after.balance)-Number(after.delta):Number(record.data.quantity||0);
 let received=0,issued=0,receivedValue=0,issuedValue=0,unpriced=0;
 for(const e of selected){
  const delta=Number(e.delta);if(delta>0)received+=delta;else issued-=delta;
  if(e.unit_price===null||e.unit_price===undefined){unpriced++;continue}
  if(delta>0)receivedValue+=delta*Number(e.unit_price);else issuedValue-=delta*Number(e.unit_price);
 }
 return {opening,received,issued,closing:opening+received-issued,receivedValue,issuedValue,unpriced};
}
export function countDifference(record){
 const value=record.data.counted_quantity;
 if(value===null||value===undefined||value==='')return null;
 return Number(value)-Number(record.data.count_book_quantity??record.data.quantity??0);
}
