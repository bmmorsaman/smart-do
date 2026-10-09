import {fiscalYear} from './domain.js';
export const materialCsvColumns=['รหัสวัสดุ','ชื่อวัสดุ','หมวด','หน่วย','ราคาต่อหน่วย','จุดสั่งซื้อ','ที่เก็บ'];
const columns=materialCsvColumns;
export function parseMaterialCsv(text){
 const rows=[];let row=[],value='',quoted=false;
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(value);value=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(v=>v.trim()))rows.push(row);row=[];value=''}else value+=c}
 if(quoted)throw Error('เครื่องหมายคำพูดใน CSV ไม่ครบ');row.push(value);if(row.some(v=>v.trim()))rows.push(row);
 if(!rows.length||columns.some((h,i)=>rows[0][i]?.trim()!==h))throw Error('หัวตารางไม่ตรง กรุณาใช้ไฟล์ตัวอย่าง');
 return rows.slice(1).map((r,i)=>{if(r.length!==columns.length||!r[0]?.trim()||!r[1]?.trim()||!r[3]?.trim()||!r[4]?.trim()||!Number.isFinite(Number(r[4]))||Number(r[4])<0||(r[5]&&!Number.isFinite(Number(r[5])))||Number(r[5]||0)<0)throw Error(`ข้อมูลแถว ${i+2} ไม่ถูกต้อง`);if(r[0].trim().length>100||r[1].trim().length>300)throw Error(`ข้อความแถว ${i+2} ยาวเกินกำหนด`);return {module:'materials',code:r[0].trim(),title:r[1].trim(),amount:Number(r[4]),fiscal_year:fiscalYear(),status:'ร่าง',data:{group:r[2].trim(),unit:r[3].trim(),minimum:Number(r[5]||0),location:r[6].trim(),quantity:0}}});
}
