export const settingsCsvCategories={custodians:'ผู้ควบคุมวัสดุ',recipients:'ผู้รับ',groups:'หมวดวัสดุ',units:'หน่วยนับ',locations:'สถานที่เก็บ',sources:'รับจาก'};
export function parseSettingsCsv(text,existing=[]){
 const rows=[];let row=[],value='',quoted=false;
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(value);value=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(v=>v.trim()))rows.push(row);row=[];value=''}else value+=c}
 if(quoted)throw Error('เครื่องหมายคำพูดใน CSV ไม่ครบ');row.push(value);if(row.some(v=>v.trim()))rows.push(row);
 if(rows[0]?.length!==2||rows[0][0].trim()!=='ประเภท'||rows[0][1].trim()!=='ชื่อ')throw Error('หัวตารางต้องเป็น ประเภท,ชื่อ กรุณาใช้แม่แบบ');
 if(rows.length<2||rows.length>1001)throw Error('นำเข้าได้ 1–1,000 รายการต่อครั้ง');
 const seen=new Set(existing.map(e=>e.category+'\0'+e.name.trim().toLowerCase()));let skipped=0;
 const records=[];
 for(const [i,r] of rows.slice(1).entries()){
  const category=Object.keys(settingsCsvCategories).find(k=>k===r[0]?.trim()||settingsCsvCategories[k]===r[0]?.trim()),name=r[1]?.trim();
  if(r.length!==2||!category||!name||name.length>200)throw Error(`ข้อมูลแถว ${i+2} ไม่ถูกต้อง: ตรวจประเภทและชื่อ 1–200 ตัวอักษร`);
  const key=category+'\0'+name.toLowerCase();if(seen.has(key)){skipped++;continue}seen.add(key);records.push({category,name,active:true});
 }
 return {records,skipped};
}
