const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={code:'รหัสวัสดุ',title:'ชื่อวัสดุ',amount:'ราคาต่อหน่วย',group:'หมวดวัสดุ',unit:'หน่วยนับ',minimum:'จุดสั่งซื้อ',location:'สถานที่เก็บ',custodian:'ผู้ควบคุมวัสดุ',quantity:'จำนวนคงเหลือ',notes:'หมายเหตุ'};
const flatten=r=>({...r?.data,code:r?.code,title:r?.title,amount:r?.amount});
export function auditHtml(entries){
 return entries.map(e=>{
  const before=flatten(e.old_data),after=flatten(e.new_data),record=e.new_data||e.old_data||{},kind=e.correction==='delete'?'ลบรายการรับ–จ่าย':e.correction==='edit'?'แก้ไขรายการรับ–จ่าย':e.action==='DELETE'?'ลบทะเบียน':e.action==='INSERT'?'เพิ่มทะเบียน':before.quantity!==after.quantity?'รับ–จ่ายวัสดุ':'แก้ไขทะเบียน';
  const changes=Object.entries(labels).filter(([key])=>JSON.stringify(before[key]??'')!==JSON.stringify(after[key]??''));
  const movementChanges=e.correction?[['movement_date','วันที่รับ–จ่าย'],['document_no','เลขที่เอกสาร'],['delta','จำนวนรับ (+) / จ่าย (−)'],['sender','ผู้ควบคุมวัสดุ'],['party','รับจาก'],['recipient','ผู้รับ']].filter(([key])=>JSON.stringify(e.movement_before?.[key]??'')!==JSON.stringify(e.movement_after?.[key]??'')):[];
  return `<details><summary>${esc(new Date(e.created_at).toLocaleString('th-TH'))} · ${esc(record.code)} · ${esc(record.title)} · ${kind} (${esc(e.action)})</summary><p class="muted">ผู้บันทึก: ${esc(e.actor||'ไม่ระบุ')}</p><div class="tablewrap"><table><thead><tr><th>ข้อมูล</th><th>ก่อนแก้ไข</th><th>หลังแก้ไข</th></tr></thead><tbody>${changes.map(([key,label])=>`<tr><td>${label}</td><td>${esc(before[key]??'—')}</td><td>${esc(after[key]??'—')}</td></tr>`).join('')}${movementChanges.map(([key,label])=>`<tr><td>${label}</td><td>${esc(e.movement_before?.[key]??'—')}</td><td>${esc(e.movement_after?.[key]??'—')}</td></tr>`).join('')}</tbody></table>${changes.length||movementChanges.length?'':'<p class="muted">ข้อมูลทะเบียนที่แสดงไม่มีการเปลี่ยนแปลง</p>'}</div></details>`;
 }).join('')||'<p class="empty">ไม่มีประวัติตามเงื่อนไข</p>';
}
