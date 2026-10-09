import {db,isDemo,seedDemoSettings} from './store.js';
import {showLogoSettings} from './branding.js';
const storageKey='thai-material-settings-v1';
export const settingCategories={custodians:'ผู้ควบคุมวัสดุ',recipients:'ผู้รับ',groups:'หมวดวัสดุ',units:'หน่วยนับ',locations:'สถานที่เก็บ',sources:'รับจาก'};
let entries=[];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function loadSettings(existingRows=[]){
 if(isDemo()){
  entries=JSON.parse(localStorage.getItem(storageKey)||'[]');
  if(existingRows.length&&!localStorage.getItem(storageKey+'-initialized')){
   for(const r of existingRows)for(const [category,key] of [['groups','group'],['units','unit'],['custodians','custodian'],['locations','location']]){const name=String(r.data[key]||'').trim();if(name&&!entries.some(e=>e.category===category&&e.name.toLocaleLowerCase()===name.toLocaleLowerCase()))entries.push({id:crypto.randomUUID(),category,name,active:true})}
   localStorage.setItem(storageKey+'-initialized','1');
  }
  localStorage.setItem(storageKey,JSON.stringify(entries));
 }
 else{entries=[];for(let offset=0;;offset+=1000){const result=await db.from('material_settings').select('*').order('name').order('id').range(offset,offset+999);if(result.error)throw result.error;entries.push(...result.data);if(result.data.length<1000)break}}
 return entries;
}
export function settingOptions(category,current=''){
 const values=[...new Set(entries.filter(e=>e.category===category&&e.active).map(e=>e.name))].sort((a,b)=>a.localeCompare(b,'th'));
 if(current&&!values.includes(current))values.unshift(current);
 return `<option value="">เลือก${esc(settingCategories[category])}...</option>${values.map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(v)}</option>`).join('')}`;
}
export function settingValues(category){return entries.filter(e=>e.category===category&&e.active).map(e=>e.name)}
async function writeSetting(record){
 const name=String(record.name||'').trim();if(!name||name.length>200||!settingCategories[record.category])throw Error('ระบุชื่อ 1–200 ตัวอักษร');
 if(entries.some(e=>e.id!==record.id&&e.category===record.category&&e.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('มีชื่อนี้อยู่แล้วในรายการ');
 if(isDemo()){const item={...record,name,id:record.id||crypto.randomUUID()};entries=entries.filter(e=>e.id!==item.id);entries.push(item);localStorage.setItem(storageKey,JSON.stringify(entries))}
 else{const {error}=await db.from('material_settings').upsert({...record,name});if(error)throw error}
 await loadSettings();
}
export function showSettings({shell,user}){
 const editable=['admin','officer'].includes(user.role);
 shell(`<p class="muted">จัดการรายการสำหรับเลือกในทะเบียนและการจ่ายวัสดุ ปิดใช้งานเพื่อหยุดเลือกชื่อเดิม ข้อมูลที่บันทึกไปแล้วจะคงชื่อเดิมไว้</p><div id="settingsError" class="error" role="alert"></div><div class="settings-grid">${Object.entries(settingCategories).map(([key,label])=>`<section class="report"><h3>${label}</h3>${editable?`<form data-setting-add="${key}" class="toolbar"><input name="name" required maxlength="200" placeholder="เพิ่ม${label}" aria-label="เพิ่ม${label}"><button>เพิ่ม</button></form>`:''}<div class="tablewrap"><table><thead><tr><th>ชื่อ</th><th>สถานะ</th>${editable?'<th>จัดการ</th>':''}</tr></thead><tbody>${entries.filter(e=>e.category===key).sort((a,b)=>a.name.localeCompare(b.name,'th')).map(e=>`<tr><td>${editable?`<input data-setting-name="${e.id}" value="${esc(e.name)}" maxlength="200" aria-label="แก้ชื่อ ${esc(e.name)}">`:esc(e.name)}</td><td>${e.active?'ใช้งาน':'ปิดใช้งาน'}</td>${editable?`<td><button data-setting-save="${e.id}" class="secondary">บันทึกชื่อ</button><button data-setting-toggle="${e.id}" class="secondary">${e.active?'ปิดใช้งาน':'เปิดใช้งาน'}</button></td>`:''}</tr>`).join('')}</tbody></table>${entries.some(e=>e.category===key)?'':'<p class="empty">ยังไม่มีรายการ เพิ่มชื่อเพื่อใช้เลือกในแบบฟอร์ม</p>'}</div></section>`).join('')}</div>`);
 const run=async(button,fn)=>{button.disabled=true;document.querySelector('#settingsError').textContent='';try{await fn();showSettings({shell,user})}catch(e){document.querySelector('#settingsError').textContent=e.message;button.disabled=false}};
 if(isDemo()&&editable){const button=document.createElement('button');button.textContent='เพิ่มตัวอย่างตั้งค่า';button.className='secondary';document.querySelector('.settings-grid').before(button);button.onclick=()=>run(button,async()=>{await seedDemoSettings();await loadSettings()})}
 document.querySelectorAll('[data-setting-add]').forEach(form=>form.onsubmit=e=>{e.preventDefault();run(form.querySelector('button'),()=>writeSetting({category:form.dataset.settingAdd,name:new FormData(form).get('name'),active:true}))});
 document.querySelectorAll('[data-setting-save]').forEach(b=>b.onclick=()=>run(b,()=>{const item=entries.find(e=>e.id===b.dataset.settingSave);return writeSetting({...item,name:document.querySelector(`[data-setting-name="${item.id}"]`).value})}));
 document.querySelectorAll('[data-setting-toggle]').forEach(b=>b.onclick=()=>run(b,()=>{const item=entries.find(e=>e.id===b.dataset.settingToggle);return writeSetting({...item,active:!item.active})}));
 if(editable)document.querySelectorAll('[data-setting-toggle]').forEach(toggle=>{
  const button=document.createElement('button');button.textContent='ลบ';button.className='danger';button.dataset.settingDelete=toggle.dataset.settingToggle;toggle.after(button);
  button.onclick=()=>{const item=entries.find(e=>e.id===button.dataset.settingDelete);if(!confirm(`ลบ "${item.name}" จากรายการตั้งค่า? ข้อมูลที่บันทึกไว้แล้วจะยังคงอยู่`))return;run(button,async()=>{
   if(isDemo()){entries=entries.filter(e=>e.id!==item.id);localStorage.setItem(storageKey,JSON.stringify(entries))}
   else{const {error}=await db.from('material_settings').delete().eq('id',item.id);if(error)throw error}
   await loadSettings();
  })};
 });
 showLogoSettings(user);
 document.querySelector('[data-page="settings"]')?.classList.add('active');
}
