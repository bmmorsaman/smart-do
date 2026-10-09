import {csv} from './domain.js';
import {materialCsvColumns} from './material-csv.js';
export function materialImportTemplate({groups,units,locations=[]}){
 if(!groups.length||!units.length)throw Error('กรุณาเพิ่มหมวดวัสดุและหน่วยนับในเมนูตั้งค่าก่อนดาวน์โหลดแม่แบบ');
 return csv([materialCsvColumns,['','วัสดุตัวอย่าง (แก้เป็นชื่อจริง)',groups[0],units[0],0,0,locations[0]||'']]);
}
