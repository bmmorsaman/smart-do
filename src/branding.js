import {db,isDemo} from './store.js';
import {organization,setOrganization,defaultOrganization} from './organization.js';
const key='thai-material-demo-logos-v1';
const slots={ministry:['โลโก้หน่วยงาน','/logos/ministry.svg'],health_center:['โลโก้ รพ.สต.','/logos/health-center.svg']};
let logos={};
export const logoUrl=slot=>logos[slot]||slots[slot][1];
export async function loadBranding(){
 if(isDemo())setOrganization(JSON.parse(localStorage.getItem('thai-material-demo-organization-v1')||'null')||defaultOrganization);
 else{const {data}=await db.from('organization_settings').select('name,address').eq('id',1).maybeSingle();setOrganization(data||defaultOrganization)}
 if(isDemo())logos=JSON.parse(localStorage.getItem(key)||'{}');
 else{const {data,error}=await db.from('app_logos').select('slot,data_url');if(error){logos={};return}logos=Object.fromEntries(data.map(r=>[r.slot,r.data_url]))}
}
function refreshLogos(){for(const img of document.querySelectorAll('[data-logo]'))img.src=logoUrl(img.dataset.logo)}
async function saveLogo(slot,data){
 if(isDemo()){const next={...logos};if(data)next[slot]=data;else delete next[slot];localStorage.setItem(key,JSON.stringify(next));logos=next}
 else{const result=data?await db.from('app_logos').upsert({slot,data_url:data}):await db.from('app_logos').delete().eq('slot',slot);if(result.error)throw result.error;await loadBranding()}
 refreshLogos();
}
export function showLogoSettings(user){
 showOrganizationSettings(user);
 const editable=['admin','officer'].includes(user.role),section=document.createElement('section');section.className='report logo-settings';
 section.innerHTML=`<h3>โลโก้ระบบ</h3><p class="muted">เลือกภาพ PNG, JPEG หรือ WebP ไม่เกิน 2 MB ระบบปรับขนาดให้เหมาะกับโลโก้</p><div class="logo-settings-grid">${Object.entries(slots).map(([slot,[label]])=>`<div><h4>${label}</h4><img class="logo-preview" data-logo="${slot}" src="${logoUrl(slot)}" alt="${label}">${editable?`<label>อัปโหลด${label}<input type="file" data-logo-upload="${slot}" accept="image/png,image/jpeg,image/webp"></label><button type="button" data-logo-reset="${slot}" class="secondary">คืนค่าโลโก้เดิม</button>`:''}</div>`).join('')}</div><p id="logoStatus" role="status"></p>`;
 document.querySelector('.settings-grid').before(section);
 const run=async(task,input)=>{input.disabled=true;const status=section.querySelector('#logoStatus');status.textContent='กำลังบันทึกโลโก้...';try{await task();status.textContent='บันทึกโลโก้แล้ว'}catch(e){status.textContent=e.message}finally{input.disabled=false}};
 section.querySelectorAll('[data-logo-upload]').forEach(input=>input.onchange=()=>run(async()=>{
  const file=input.files[0];if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024)throw Error('เลือกภาพ PNG, JPEG หรือ WebP ขนาดไม่เกิน 2 MB');
  let bitmap;try{bitmap=await createImageBitmap(file)}catch{throw Error('อ่านภาพไม่ได้ กรุณาเลือกไฟล์ภาพใหม่')}
  try{const scale=Math.min(1,256/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);await saveLogo(input.dataset.logoUpload,canvas.toDataURL('image/png'))}finally{bitmap.close();input.value=''}
 },input));
 section.querySelectorAll('[data-logo-reset]').forEach(button=>button.onclick=()=>run(()=>saveLogo(button.dataset.logoReset,null),button));
}
function showOrganizationSettings(user){
 const editable=['admin','officer'].includes(user.role),current=organization(),section=document.createElement('section');section.className='report';
 section.innerHTML='<h3>ข้อมูลหน่วยงาน</h3><form id="organizationForm"><div class="fields"><label>ชื่อหน่วยงาน<input name="name" maxlength="300" required></label><label>ที่อยู่หน่วยงาน<textarea name="address" maxlength="1000" required></textarea></label></div><p id="organizationStatus" role="status"></p>'+(editable?'<button>บันทึกข้อมูลหน่วยงาน</button>':'')+'</form>';
 document.querySelector('.settings-grid').before(section);
 const form=section.querySelector('form');form.elements.name.value=current.name;form.elements.address.value=current.address;
 for(const input of form.querySelectorAll('input,textarea'))input.disabled=!editable;
 if(editable)form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('button'),status=section.querySelector('#organizationStatus'),next={name:form.elements.name.value.trim(),address:form.elements.address.value.trim()};
  if(!next.name||!next.address){status.textContent='กรอกชื่อและที่อยู่หน่วยงาน';return}
  button.disabled=true;status.textContent='กำลังบันทึก...';
  try{if(isDemo())localStorage.setItem('thai-material-demo-organization-v1',JSON.stringify(next));else{const {error}=await db.from('organization_settings').upsert({id:1,...next});if(error)throw error}setOrganization(next);document.querySelectorAll('[data-org-name]').forEach(node=>node.textContent=next.name);document.title=`Smart วัสดุ | ${next.name}`;status.textContent='บันทึกข้อมูลหน่วยงานแล้ว'}catch(e){status.textContent=e.message}finally{button.disabled=false}
 };
}
