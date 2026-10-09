import {organization} from './organization.js';
import {modules,fiscalYear} from './domain.js';
import {fields,canEditField,documentRows} from './procurement.js';
import {save} from './store.js';
import {settingOptions} from './settings.js';
import {printDocument} from './printing.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function printRecord(record){
 printDocument(`<h2>รายงานข้อมูล · ${esc(modules[record.module][0])}</h2><p>${esc(organization().name)}</p><p>${esc(organization().address)}</p><p>ข้อมูลจากทะเบียนในระบบ</p><table><tbody>${documentRows(record).map(([label,value])=>`<tr><th>${esc(label)}</th><td>${esc(value)||'................................'}</td></tr>`).join('')}</tbody></table><p class="signature">ผู้จัดทำรายงาน ................................</p>`,{landscape:false,className:'record-print'});
}

export function openEditor({record:r,page,rows,user,onReload,onNavigate}){
 const d=document.querySelector('#editor');
 const canWrite=['admin','officer'].includes(user.role);
 const canSave=(fields[page]||[]).some(([key])=>canEditField(r,key,user.role));
 let dirty=false;
 const fieldHtml=([key,label,type])=>{
  const value=r?.data?.[key]??'',disabled=canEditField(r,key,user.role)?'':'disabled';
  let input;
  if(['group','unit','custodian','location'].includes(key))input=`<select name="${key}" ${['group','unit'].includes(key)?'required':''} ${disabled}>${settingOptions({group:'groups',unit:'units',custodian:'custodians',location:'locations'}[key],value)}</select>`;
  else input=`<input name="${key}" type="${type}" ${type==='number'?'min="0" step="any"':''} value="${esc(value)}" ${disabled}>`;
  return `<label class="${type==='textarea'?'wide':''}">${label}${input}</label>`;
 };
 d.innerHTML=`<h2>${r?'รายละเอียด':'เพิ่ม'}${modules[page][2]}</h2><p class="muted">บันทึกข้อมูลเพื่อคำนวณ จัดเก็บ และออกรายงาน</p><form id="recordForm"><div class="fields"><label>รหัสวัสดุ<input name="code" placeholder="ระบบกำหนดให้อัตโนมัติเมื่อบันทึก" ${r?'required':'readonly'} maxlength="100" value="${esc(r?.code)}" ${canWrite?'':'disabled'}></label><label>ชื่อรายการ<input name="title" required maxlength="300" value="${esc(r?.title)}" ${canWrite?'':'disabled'}></label><label>ราคาต่อหน่วย (บาท)<input name="amount" type="number" min="0" step="0.01" required value="${r?.amount??0}" ${canWrite?'':'disabled'}></label>${fields[page].map(fieldHtml).join('')}<label class="wide">หมายเหตุ<textarea name="notes" ${canWrite?'':'disabled'}>${esc(r?.data?.notes)}</textarea></label></div>${page==='requisitions'?'<p class="banner">ใบเบิกไม่ตัดยอดอัตโนมัติ ผู้จ่ายลงบัญชีผ่านคลังวัสดุและระบุเลขใบเบิกทุกครั้ง</p>':''}<div id="linkedRecords"></div><div id="formError" class="error" role="alert"></div><div class="modal-actions"><button type="button" id="close" class="secondary">ปิด</button>${r?'<button type="button" id="printRecord" class="secondary">พิมพ์เอกสาร</button>':''}${canSave?'<button id="saveRecord">บันทึก</button>':''}</div></form>`;
 const form=d.querySelector('#recordForm');
 const candidate=()=>{
  const f=new FormData(form),data={...r?.data};
  if(canWrite)data.notes=f.get('notes');
  fields[page].forEach(([key,,type])=>{if(canEditField(r,key,user.role)){const value=f.get(key);data[key]=type==='number'?(value===''?null:Number(value)):value}});
  return {...r,module:page,code:canWrite?String(f.get('code')).trim():r.code,title:canWrite?String(f.get('title')).trim():r.title,amount:canWrite?Number(f.get('amount')):r.amount,fiscal_year:r?.fiscal_year??fiscalYear(),status:r?.status||'ร่าง',data};
 };
 form.oninput=()=>{dirty=true};form.onchange=()=>{dirty=true};
 const run=async fn=>{
  d.querySelector('#formError').textContent='';
  const buttons=[...d.querySelectorAll('.modal-actions button')];buttons.forEach(button=>button.disabled=true);
  try{await fn()}catch(error){d.querySelector('#formError').textContent=error.message}finally{buttons.forEach(button=>button.disabled=false)}
 };
 d.querySelector('#close').onclick=()=>d.close();
 d.querySelector('#printRecord')?.addEventListener('click',()=>{if(dirty){d.querySelector('#formError').textContent='บันทึกการแก้ไขก่อนพิมพ์เอกสาร';return}printRecord(r)});
 form.onsubmit=event=>{event.preventDefault();if(!canSave)return;run(async()=>{
  const row=candidate();
  if(page==='materials'&&!r)row.data.quantity=0;
  await save(row);d.close();await onReload();
 })};
 d.showModal();
}
