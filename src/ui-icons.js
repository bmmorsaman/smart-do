import {createElement,icons} from 'lucide';
const buttonIcons=[
 [/รีเซ็ต/,'RotateCcw'],[/เพิ่มตัวอย่าง/,'Sparkles'],[/ดาวน์โหลด|ส่งออก/,'Download'],[/นำเข้า/,'Upload'],
 [/พิมพ์/,'Printer'],[/บันทึก/,'Save'],[/ลบ/,'Trash2'],[/ปิดใช้งาน|เปิดใช้งาน/,'Power'],
 [/^ปิด$/,'X'],[/เพิ่ม/,'Plus'],[/Stock Card/,'NotebookTabs'],[/รายละเอียด|ดูรายการ/,'FileText'],
 [/รับวัสดุ/,'PackagePlus'],[/จ่ายวัสดุ/,'PackageMinus'],[/แสดงรายงาน/,'ChartColumn'],[/ทดลอง/,'FlaskConical']
];
const headingIcons=[[/ผู้ควบคุม|ผู้ควบคุมวัสดุ/,'UserRoundCog'],[/ผู้รับ/,'UsersRound'],[/หมวด/,'Tags'],[/หน่วยนับ/,'Ruler'],[/สถานที่เก็บ/,'MapPin'],[/Stock Card/,'NotebookTabs'],[/ประวัติ/,'History'],[/นำเข้า/,'Upload'],[/คงเหลือ/,'Package'],[/รายงาน/,'ChartColumn']];
export function installUiIcons(root){
 let queued=false;
 const render=()=>{
  queued=false;
  for(const table of root.querySelectorAll('.tablewrap')){table.tabIndex=0;table.setAttribute('role','region');table.setAttribute('aria-label','ตารางข้อมูล เลื่อนซ้ายและขวาเพื่อดูคอลัมน์ทั้งหมด')}
  for(const element of root.querySelectorAll('button,.settings-grid h3,.report-output h3,dialog h2')){
   if(element.querySelector('svg,[data-lucide]'))continue;
   const rules=element.tagName==='BUTTON'?buttonIcons:headingIcons,name=rules.find(([pattern])=>pattern.test(element.textContent.trim()))?.[1];
   if(!name)continue;const icon=createElement(icons[name]);icon.setAttribute('aria-hidden','true');icon.setAttribute('focusable','false');element.prepend(icon);
  }
 };
 const observer=new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(render)}});
 observer.observe(root,{childList:true,subtree:true});render();
 return ()=>observer.disconnect();
}
