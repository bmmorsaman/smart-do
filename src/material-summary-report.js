import {summarizeMaterial,chronologicalMovements} from './material-calculations.js';
export const materialSummaryHeaders=['รหัสวัสดุ','รายการ','ราคาต่อหน่วย (บาท)','ราคารวมวัสดุคงเหลือยกมา (บาท)','จำนวนจัดซื้อ / รับเข้า','หน่วย','ราคาต่อหน่วยจัดซื้อ (บาท)','รวมราคาวัสดุจัดซื้อ (บาท)','จำนวนวัสดุที่ใช้ไป / จ่ายออก','หน่วย','ราคาต่อหน่วยใช้ไป (บาท)','ราคารวมวัสดุใช้ไป (บาท)','ราคารวมคงเหลือ (บาท)'];
export function materialSummaryRow(record,entries,from,to){
 const s=summarizeMaterial(record,entries,from,to),price=Number(record.amount),unit=record.data.unit;
 const selected=chronologicalMovements(record,entries).filter(e=>e.day>=from&&e.day<=to);
 const missing=sign=>selected.some(e=>Math.sign(Number(e.delta))===sign&&(e.unit_price==null||!Number.isFinite(Number(e.unit_price))));
 const received=missing(1)?'':s.receivedValue,issued=missing(-1)?'':s.issuedValue;
 return [record.code,record.title,price,s.opening*price,s.received,unit,received===''?'':s.received?received/s.received:0,received,s.issued,unit,issued===''?'':s.issued?issued/s.issued:0,issued,s.closing*price];
}
