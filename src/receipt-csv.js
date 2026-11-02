import {validDate,localDate} from './procurement.js';
export const receiptColumns=['รหัสวัสดุ','วันที่รับวัสดุ','จำนวน','เลขที่เอกสาร','รับจาก','ผู้ควบคุมวัสดุ'];
export function parseReceiptCsv(text,materials,{custodians=[],sources=[],today=localDate()}={}){
 const rows=[];let row=[],value='',quoted=false;
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(value);value=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(v=>v.trim()))rows.push(row);row=[];value=''}else value+=c}
 if(quoted)throw Error('เครื่องหมายคำพูดใน CSV ไม่ครบ');row.push(value);if(row.some(v=>v.trim()))rows.push(row);
 if(rows[0]?.length!==6||receiptColumns.some((h,i)=>rows[0][i]?.trim()!==h))throw Error('หัวตารางไม่ตรง กรุณาใช้แม่แบบรับวัสดุ');
 if(rows.length<2||rows.length>1001)throw Error('นำเข้าได้ 1–1,000 รายการต่อไฟล์');
 return rows.slice(1).map((r,i)=>{
  const [code,day,qty,document_no,party,sender]=r.map(v=>v.trim()),record=materials.find(m=>m.code===code);
  const fail=msg=>{throw Error(`แถว ${i+2}: ${msg}`)};
  if(r.length!==6||!record)fail('ไม่พบรหัสวัสดุในทะเบียน');
  if(!validDate(day)||day<'1900-01-01'||day>today)fail('วันที่ต้องเป็น YYYY-MM-DD และไม่เกินวันนี้');
  if(!qty||!Number.isFinite(Number(qty))||Number(qty)<=0||Number(qty)>1e8)fail('จำนวนต้องมากกว่าศูนย์และไม่เกิน 100,000,000');
  if(!custodians.includes(sender))fail('ผู้ควบคุมวัสดุต้องตรงกับรายการตั้งค่าที่เปิดใช้งาน');
  if(party&&!sources.includes(party))fail('รับจากต้องตรงกับรายการตั้งค่าที่เปิดใช้งาน');
  if(document_no.length>100||party.length>200||sender.length>200)fail('ข้อความยาวเกินกำหนด');
  return {record,quantity:Number(qty),details:{movement_date:day,document_no,party,sender}};
 });
}
