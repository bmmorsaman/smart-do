import {modules} from './domain.js';

export const legalSources=[
 {title:'ระเบียบกระทรวงการคลัง พ.ศ. 2560',url:'https://sakarat.go.th/doc/law2564/รบ.กระทรวงการคลังว่าด้วยการจัดซื้อจัดจ้า.pdf',detail:'ข้อ 21–22, 203–219'},
 {title:'กรมบัญชีกลาง: กฎหมายพัสดุและฉบับแก้ไข',url:'https://www.cgd.go.th/cs/nbr/nbr/กฎหมาย_พัสดุ.html',detail:'ตรวจฉบับแก้ไขและหนังสือเวียนที่ใช้กับหน่วยงาน'},
 {title:'ว 804 ลงวันที่ 12 พฤศจิกายน 2568',url:'https://www.moc.go.th/th/file/get/file/2025111345adc18eb5c1fbc972d389b3a989552c140910.pdf',detail:'แนวทางเฉพาะการจัดซื้อครั้งหนึ่งไม่เกิน 50,000 บาท'}
];
export const fields={
 materials:[['group','หมวดวัสดุ','text'],['unit','หน่วยนับ','text'],['minimum','จุดสั่งซื้อ','number'],['location','สถานที่เก็บ','text'],['custodian','ผู้ควบคุมวัสดุ','text']],
};
export function canEditField(record,key,role){return ['admin','officer'].includes(role)}
export function validateChange(record,previous){
 if(previous&&(record.id!==previous.id||record.module!==previous.module||record.created_at!==previous.created_at))throw Error('รหัสอ้างอิงข้อมูลเปลี่ยนไม่ได้');
}
export function validateMaterial(record,previous){
 if(record.module!=='materials')throw Error('ระบบรองรับเฉพาะวัสดุ');
 if(!String(record.code||'').trim()||String(record.code).length>100||!String(record.title||'').trim()||String(record.title).length>300)throw Error('ระบุรหัสและชื่อวัสดุให้ถูกต้อง');
 if(!Number.isFinite(Number(record.amount))||Number(record.amount)<0||Number(record.amount)>=1e14)throw Error('ราคาต่อหน่วยไม่ถูกต้อง');
 if(!String(record.data?.unit||'').trim()||!String(record.data?.group||'').trim())throw Error('เลือกหมวดวัสดุและหน่วยนับ');
 if(!Number.isFinite(Number(record.data.minimum||0))||Number(record.data.minimum||0)<0)throw Error('จุดสั่งซื้อต้องเป็นจำนวนตั้งแต่ศูนย์');
 if(previous&&Number(record.data.quantity||0)!==Number(previous.data.quantity||0))throw Error('เปลี่ยนยอดผ่านหน้ารับหรือจ่ายวัสดุเท่านั้น');
 if(!previous&&Number(record.data.quantity||0)!==0)throw Error('ทะเบียนใหม่เริ่มต้นยอดศูนย์ แล้วบันทึกรับวัสดุ');
}
export function validDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T00:00:00Z');return !isNaN(date)&&date.toISOString().slice(0,10)===value;
}
export function localDate(now=new Date()){
 return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
export function addDays(date,count){
 if(!validDate(date))return '';
 const value=new Date(date+'T00:00:00Z');value.setUTCDate(value.getUTCDate()+count);return value.toISOString().slice(0,10);
}
export function followUps(records,today=localDate()){
 const alerts=[];
 for(const r of records){
  const d=r.data||{};

  const push=(message,due)=>alerts.push({id:r.id,module:r.module,code:r.code,message,due,overdue:due<today});
  if(r.module==='loans'&&!d.returned&&validDate(d.due)&&d.due<today)push('ยืมเกินกำหนด · ติดตามทวงคืนภายใน 7 วันนับแต่ครบกำหนด',addDays(d.due,7));
  if(r.module==='contracts'&&!d.delivery_date&&validDate(d.due))push('ติดตามการส่งมอบตามสัญญา',d.due);
  if(r.module==='maintenance'&&validDate(d.scheduled_date))push('ถึงรอบบำรุงรักษา',d.scheduled_date);
  if(r.module==='annual'&&!d.report_date&&validDate(d.report_due))push('เสนอรายงานตรวจสอบประจำปี',d.report_due);
  if(r.module==='disposals'&&validDate(d.order_date)&&!d.date)push('ติดตามจำหน่าย · โดยปกติภายใน 60 วันนับถัดจากวันสั่งการ',addDays(d.order_date,60));
  if(r.module==='disposals'&&validDate(d.ledger_date)&&!d.sao_notice_date)push('แจ้ง สตง. หลังลงจ่ายออกจากทะเบียน',addDays(d.ledger_date,30));
 }
 return alerts.sort((a,b)=>a.due.localeCompare(b.due));
}
export function linkedRecords(record,records){
 return (fields[record.module]||[]).filter(f=>f[2].startsWith('ref:')&&record.data?.[f[0]]).map(([key,label,type])=>({label,code:record.data[key],record:records.find(r=>r.module===type.slice(4)&&r.code===record.data[key])}));
}
export function documentRows(record){
 return [['รหัสวัสดุ',record.code],['รายการ',record.title],['ราคาต่อหน่วย (บาท)',record.amount],...(fields[record.module]||[]).map(([key,label])=>[label,record.data?.[key]??'']),['จำนวนคงเหลือ',record.data?.quantity||0],['มูลค่าคงเหลือ (บาท)',Number(record.amount)*Number(record.data?.quantity||0)],['หมายเหตุ',record.data?.notes||'']];
}
export const workflowGuide=Object.entries(modules).map(([module,[registry]])=>({module,registry}));
