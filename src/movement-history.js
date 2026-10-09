import {stockEntries,correctMovement} from './store.js';
import {settingOptions} from './settings.js';
import {localDate} from './procurement.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function showMovementHistory(target,record,direction,user,onReload){
 target.innerHTML='<h3>รายการที่บันทึกแล้ว</h3><p role="status">กำลังโหลด...</p>';
 try{
  const entries=(await stockEntries(record.id)).filter(e=>Math.sign(e.delta)===direction).sort((a,b)=>b.created_at.localeCompare(a.created_at));
  if(!target.isConnected)return;
  const editable=['admin','officer'].includes(user.role);
  target.innerHTML=`<h3>รายการ${direction>0?'รับ':'จ่าย'}ที่บันทึกแล้ว</h3><p class="muted">แก้ไขหรือลบเมื่อบันทึกผิด ระบบคำนวณคงเหลือใหม่และเก็บประวัติการเปลี่ยนแปลง</p><input type="search" data-history-search placeholder="ค้นหาวันที่ เลขที่เอกสาร หรือบุคคล" aria-label="ค้นหาประวัติรับจ่าย"><div class="tablewrap"><table><thead><tr><th>วันที่</th><th>เลขที่เอกสาร</th><th>จำนวน</th><th>มูลค่า</th><th>ผู้ควบคุมวัสดุ</th><th>${direction>0?'รับจาก':'ผู้รับ'}</th>${editable?'<th>จัดการ</th>':''}</tr></thead><tbody></tbody></table></div><p data-history-status role="status"></p>`;
  const status=target.querySelector('[data-history-status]'),tbody=target.querySelector('tbody');
  const render=()=>{
   const terms=target.querySelector('input').value.toLowerCase().trim().split(/\s+/).filter(Boolean);
   const matches=entries.filter(e=>terms.every(t=>`${e.movement_date} ${e.document_no||''} ${e.sender||''} ${e.party||''} ${e.recipient||''}`.toLowerCase().includes(t)));
   tbody.innerHTML=matches.map(e=>`<tr><td>${esc(e.movement_date||e.created_at.slice(0,10))}</td><td>${esc(e.document_no||'—')}</td><td>${esc(Math.abs(e.delta))} ${esc(record.data.unit)}</td><td>${e.unit_price==null?'—':esc((Math.abs(e.delta)*e.unit_price).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}))}</td><td>${esc(e.sender)}</td><td>${esc(direction>0?e.party:e.recipient)}</td>${editable?`<td><button type="button" class="secondary" data-edit-movement="${esc(e.id)}">แก้ไข</button><button type="button" class="danger" data-delete-movement="${esc(e.id)}">ลบ</button></td>`:''}</tr>`).join('');
   status.textContent=`พบ ${matches.length} รายการ`;
   tbody.querySelectorAll('[data-edit-movement]').forEach(b=>b.onclick=()=>edit(entries.find(e=>String(e.id)===b.dataset.editMovement)));
   tbody.querySelectorAll('[data-delete-movement]').forEach(b=>b.onclick=async()=>{const e=entries.find(e=>String(e.id)===b.dataset.deleteMovement);if(!confirm(`ลบรายการ${direction>0?'รับ':'จ่าย'} ${record.code} จำนวน ${Math.abs(e.delta)} ${record.data.unit} วันที่ ${e.movement_date}? ยอดคงเหลือจะคำนวณใหม่`))return;b.disabled=true;try{await correctMovement(e,null);await onReload()}catch(error){status.textContent=error.message;b.disabled=false}});
  };
  function edit(entry){
   const dialog=document.querySelector('#editor');
   dialog.innerHTML=`<h2>แก้ไขรายการ${direction>0?'รับ':'จ่าย'}วัสดุ</h2><p>${esc(record.code)} · ${esc(record.title)}</p><form id="correctMovementForm"><div class="fields"><label>วันที่<input name="movement_date" type="date" min="1900-01-01" max="${localDate()}" required></label><label>เลขที่เอกสาร<input name="document_no" maxlength="100"></label><label>จำนวน (${esc(record.data.unit)})<input name="quantity" type="number" min="0.001" max="100000000" step="any" required></label><label>มูลค่า (บาท)<input name="value" readonly></label><label>ผู้ควบคุมวัสดุ<select name="sender" required>${settingOptions('custodians',entry.sender)}</select></label>${direction>0?`<label>รับจาก<select name="party">${settingOptions('sources',entry.party)}</select></label>`:`<label>ผู้รับ<select name="recipient" required>${settingOptions('recipients',entry.recipient)}</select></label>`}</div><p class="muted">ใช้ราคาต่อหน่วยเดิมขณะทำรายการ และตรวจยอดย้อนหลังไม่ให้ติดลบ</p><p id="correctionError" class="error" role="alert"></p><div class="modal-actions"><button type="submit">บันทึกการแก้ไข</button><button type="button" data-cancel class="secondary">ยกเลิก</button></div></form>`;
   const form=dialog.querySelector('form');for(const key of ['movement_date','document_no','sender','party','recipient'])if(form.elements[key])form.elements[key].value=entry[key]||'';form.elements.quantity.value=Math.abs(entry.delta);
   const value=()=>{form.elements.value.value=entry.unit_price==null?'':(Number(form.elements.quantity.value)*Number(entry.unit_price)).toFixed(2)};value();form.oninput=value;
   dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.showModal();
   form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('[type="submit"]');button.disabled=true;try{const details=Object.fromEntries(new FormData(form));details.quantity=Number(details.quantity);await correctMovement(entry,details);dialog.close();await onReload()}catch(error){form.querySelector('#correctionError').textContent=error.message;button.disabled=false}};
  }
  target.querySelector('input').oninput=render;render();
 }catch(error){if(target.isConnected)target.innerHTML=`<p class="error">${esc(error.message)}</p>`}
}
