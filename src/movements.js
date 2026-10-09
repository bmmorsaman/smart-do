import {movement} from './store.js';
import {openStock} from './stock.js';
import {settingOptions} from './settings.js';
import {localDate} from './procurement.js';
import {showMovementHistory} from './movement-history.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function showMovements({rows,user,shell,onReload,initialRecord=null,direction=1}){
 const receiving=direction===1,title=receiving?'รับวัสดุ':'จ่ายวัสดุ';
 const materials=rows.filter(r=>r.module==='materials');let selected=null;
 const editable=['admin','officer'].includes(user.role);
 shell(`<p class="muted">${receiving?'ค้นหาวัสดุที่รับเข้า แล้วระบุจำนวนและผู้ควบคุมวัสดุ':'ค้นหาวัสดุที่ต้องการเบิก แล้วระบุจำนวน ผู้ควบคุมวัสดุ และผู้รับ'}</p><div class="toolbar"><input id="movementSearch" type="search" aria-label="ค้นหาวัสดุรับจ่าย" placeholder="ค้นหารหัส ชื่อวัสดุ หรือหมวดวัสดุ"><span id="movementMatches" class="muted" aria-live="polite"></span></div><div id="movementResults"></div><section id="movementEntry" class="report" hidden></section>`);
 const results=document.querySelector('#movementResults'),entry=document.querySelector('#movementEntry');
 document.querySelector(`[data-page="${receiving?'receipts':'issues'}"]`)?.classList.add('active');
 function select(record){
  selected=record;entry.hidden=false;
  entry.innerHTML=`<h3>${esc(record.code)} · ${esc(record.title)}</h3><p>คงเหลือ <strong>${esc(record.data.quantity||0)} ${esc(record.data.unit)}</strong> · ราคาต่อหน่วย ${esc(record.amount)} บาท</p>${editable?`<form id="movementForm"><div class="fields"><label>เลขที่เอกสาร<input name="document_no" maxlength="100" placeholder="ระบุเลขที่เอกสารรับหรือจ่าย"></label><label>${receiving?'วันที่รับวัสดุ':'วันที่จ่ายวัสดุ'}<input name="movement_date" type="date" value="${localDate()}" min="1900-01-01" max="${localDate()}" required></label><label>จำนวน (${esc(record.data.unit)})<input name="quantity" type="number" min="0.001" ${receiving?'':`max="${Number(record.data.quantity||0)}"`} step="any" required></label>${receiving?'<label>รับจาก<input name="party" maxlength="200" placeholder="ชื่อหน่วยงาน บริษัท หรือผู้ส่งมอบ"></label>':''}<label>มูลค่า (บาท)<input name="value" value="0.00" readonly aria-label="มูลค่าคำนวณอัตโนมัติ"></label><label>${receiving?'ผู้ควบคุมวัสดุ':'ผู้ควบคุมวัสดุ'}<input name="sender" maxlength="200" required></label>${receiving?'':'<label>ผู้รับ<input name="recipient" maxlength="200" required></label>'}</div><p id="movementPreview" class="banner" aria-live="polite">ระบุจำนวนเพื่อดูยอดหลังทำรายการ</p><div id="movementError" class="error" role="alert"></div><button type="submit">บันทึก${title}</button></form>`:'<p class="muted">บัญชีนี้มีสิทธิ์อ่านข้อมูล</p>'}<div class="modal-actions"><button id="movementLedger" class="secondary">ดู Stock Card / ประวัติรับ–จ่าย</button></div>`;
  entry.querySelector('#movementLedger').onclick=()=>openStock(selected,onReload,true);
  if(editable){
   const sender=entry.querySelector('[name="sender"]'),recipient=entry.querySelector('[name="recipient"]');
   sender.outerHTML=`<select name="sender" required>${settingOptions('custodians')}</select>`;
   entry.querySelector('[name="sender"]').value=record.data.custodian||'';
   if(recipient)recipient.outerHTML=`<select name="recipient" required>${settingOptions('recipients')}</select>`;
   const source=entry.querySelector('[name="party"]');
   if(source)source.outerHTML=`<select name="party">${settingOptions('sources')}</select>`;
  }
  const form=entry.querySelector('form');
  const history=document.createElement('section');history.style.marginTop='28px';entry.append(history);showMovementHistory(history,record,direction,user,onReload);
  if(form){
   if(!receiving&&Number(record.data.quantity||0)<=0){form.querySelector('[type="submit"]').disabled=true;entry.querySelector('#movementError').textContent='วัสดุหมดคลัง ยังจ่ายไม่ได้';}
   const preview=()=>{const f=new FormData(form),qty=Number(f.get('quantity')),delta=qty*direction,balance=Number(record.data.quantity||0)+delta;form.elements.value.value=(qty*Number(record.amount)).toFixed(2);entry.querySelector('#movementPreview').textContent=qty>0?`ยอดหลังทำรายการ ${balance} ${record.data.unit||''} · มูลค่ารายการ ${(qty*Number(record.amount)).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})} บาท${balance<0?' · จำนวนจ่ายเกินยอดคงเหลือ':''}`:'ระบุจำนวนเพื่อดูยอดหลังทำรายการ'};
   form.oninput=preview;form.onchange=preview;
   form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form),button=form.querySelector('[type="submit"]');button.disabled=true;entry.querySelector('#movementError').textContent='';try{await movement(record.id,Number(f.get('quantity'))*direction,receiving?'รับเข้า':'จ่ายออก',{movement_date:f.get('movement_date'),document_no:String(f.get('document_no')||'').trim(),sender:f.get('sender'),party:receiving?f.get('party'):'',recipient:receiving?'':f.get('recipient')});await onReload();const notice=document.createElement('p');notice.className='banner';notice.setAttribute('role','status');notice.textContent=`บันทึก${title} ${record.code} จำนวน ${f.get('quantity')} ${record.data.unit} สำเร็จ`;document.querySelector('#movementResults')?.before(notice)}catch(error){if(entry.isConnected){entry.querySelector('#movementError').textContent=error.message;button.disabled=false}}};
   form.querySelector('[name="quantity"]').focus();
  }
 }
 function search(){
  const terms=document.querySelector('#movementSearch').value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches=materials.filter(r=>terms.every(t=>`${r.code} ${r.title} ${r.data.group||''}`.toLocaleLowerCase().includes(t)));
  document.querySelector('#movementMatches').textContent=`พบ ${matches.length} รายการ`;
  results.innerHTML=`<div class="tablewrap"><table><thead><tr><th>รหัส</th><th>วัสดุ / หมวด</th><th>คงเหลือ</th><th>เลือก</th></tr></thead><tbody>${matches.map(r=>`<tr><td>${esc(r.code)}</td><td>${esc(r.title)}<br><span class="muted">${esc(r.data.group||'')}</span></td><td>${esc(r.data.quantity||0)} ${esc(r.data.unit)}</td><td><button data-material="${esc(r.id)}">${editable?title:'ดูรายการ'}</button></td></tr>`).join('')}</tbody></table>${matches.length?'':'<div class="empty">ไม่พบวัสดุ ลองค้นหารหัสหรือชื่ออื่น</div>'}</div>`;
  results.querySelectorAll('[data-material]').forEach(b=>b.onclick=()=>select(materials.find(r=>r.id===b.dataset.material)));
 }
 document.querySelector('#movementSearch').oninput=search;search();if(initialRecord)select(initialRecord);
}
