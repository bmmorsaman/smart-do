import {organization} from './organization.js';
import {printDocument} from './printing.js';
import {summarizeMaterial,chronologicalMovements} from './material-calculations.js';
import {csv} from './domain.js';
import {localDate,validDate} from './procurement.js';
import {stockEntries} from './store.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>Number(v).toLocaleString('th-TH',{maximumFractionDigits:3});
const money=v=>Number(v).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const date=v=>v?new Date(v.length===10?v+'T12:00:00':v).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'}):'—';
const types={
 movements:['สรุปรับ–จ่ายวัสดุ','สรุปจำนวนรับ จ่าย และคงเหลือตามช่วงวันที่ แยกตามทะเบียนวัสดุ',true],
 balances:['ทะเบียนและมูลค่าวัสดุคงเหลือ','ข้อมูลทะเบียน หมวด หน่วยนับ ผู้ควบคุม สถานที่เก็บ จำนวนและมูลค่าคงเหลือปัจจุบัน',false],
 receipts:['รายงานรับวัสดุ','รายการจากหน้ารับวัสดุ: จำนวน มูลค่า และผู้ควบคุมวัสดุ ไม่มีผู้รับ',true],
 issues:['รายงานจ่ายวัสดุ','รายการจากหน้าจ่ายวัสดุ: จำนวน มูลค่า ผู้ควบคุมวัสดุ และผู้รับ',true],
 ledger:['Stock Card / ประวัติวัสดุ','ประวัติรับ–จ่ายของวัสดุแต่ละรายการ พร้อมจำนวน มูลค่า และยอดหลังทำรายการ',true],
 low:['วัสดุหมด / ถึงจุดสั่งซื้อ','วัสดุที่ยอดเป็นศูนย์หรือคงเหลือไม่เกินจุดสั่งซื้อที่ตั้งไว้ในทะเบียน',false],
};
export async function showMaterialReports({rows,shell,type='movements'}){
 if(!types[type])type='movements';
 const [title,description,dated]=types[type],current=['balances','low'].includes(type),details=['ledger','receipts','issues'].includes(type),today=localDate();
 const headers=current?['รหัสวัสดุ','ชื่อวัสดุ','หมวด','หน่วยนับ','ราคาต่อหน่วย (บาท)','จำนวนคงเหลือ','มูลค่าคงเหลือ (บาท)','จุดสั่งซื้อ','สถานะ',...(type==='low'?['ขาดจากจุดสั่งซื้อ']:[])]:details?['วันที่รับ / จ่าย','รหัสวัสดุ','ชื่อวัสดุ','ประเภท','จำนวน','หน่วยนับ','ราคาต่อหน่วย (บาท)','มูลค่า (บาท)','ยอดหลังรายการ','ผู้ควบคุมวัสดุ','ผู้รับ']:['รหัสวัสดุ','ชื่อวัสดุ','หน่วยนับ','ยอดก่อนช่วงวันที่','จำนวนรับ','จำนวนจ่าย','ยอดสิ้นช่วง','มูลค่ารับ (บาท)','มูลค่าจ่าย (บาท)','มูลค่าคงเหลือ ณ สิ้นช่วง (ราคาปัจจุบัน)'];
 const numeric=current?[4,5,6,7,...(type==='low'?[9]:[])]:details?[4,6,7,8]:[3,4,5,6,7,8,9];
 if(current)headers.push('ผู้ควบคุมวัสดุ','สถานที่เก็บ');
 if(type==='receipts'){headers[0]='วันที่รับวัสดุ';headers[9]='ผู้ควบคุมวัสดุ';headers.pop()}
 if(type==='issues'){headers[0]='วันที่จ่ายวัสดุ';headers[9]='ผู้ควบคุมวัสดุ'}
 if(details)headers.push('เลขที่เอกสาร','รับจาก','บันทึกเมื่อ');
 const monetary=current?[4,6]:details?[6,7]:[7,8,9];
 shell(`<p class="muted">เลือกประเภทรายงานและเงื่อนไข แล้วส่งออกหรือพิมพ์ข้อมูลที่แสดง</p><div class="toolbar report-filters"><label>ประเภทรายงาน<select id="reportType">${Object.entries(types).map(([key,[label]])=>`<option value="${key}" ${key===type?'selected':''}>${label}</option>`).join('')}</select></label><label>วัสดุ<select id="reportMaterial"><option value="">ทุกวัสดุ</option>${rows.map(r=>`<option value="${esc(r.id)}">${esc(r.code)} · ${esc(r.title)}</option>`).join('')}</select></label><label>หมวดวัสดุ<select id="reportGroup"><option value="">ทุกหมวด</option>${[...new Set(rows.map(r=>r.data.group).filter(Boolean))].sort().map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('')}</select></label><label>ค้นหารหัส / ชื่อวัสดุ<input id="reportSearch" type="search" placeholder="พิมพ์รหัสหรือชื่อ"></label>${dated?`<label>จากวันที่<input id="reportFrom" type="date" value="${today.slice(0,7)}-01"></label><label>ถึงวันที่<input id="reportTo" type="date" value="${today}"></label>`:''}</div><div class="toolbar"><button id="calculateReport">แสดงรายงาน</button><button id="exportReport" class="secondary" disabled>ส่งออก CSV</button><button id="printReport" class="secondary" disabled>พิมพ์ / PDF</button></div><p id="reportHint" class="banner">${description}</p><div id="materialReport" aria-live="polite"></div>`);
 const target=document.querySelector('#materialReport'),button=document.querySelector('#calculateReport'),exportButton=document.querySelector('#exportReport'),printButton=document.querySelector('#printReport'),material=document.querySelector('#reportMaterial'),group=document.querySelector('#reportGroup'),search=document.querySelector('#reportSearch'),controls=[material,group,search,...(dated?[document.querySelector('#reportFrom'),document.querySelector('#reportTo')]:[])];
 let output=[],metadata=[],summaries=[],note='',busy=false;
 document.querySelector('#reportType').onchange=e=>showMaterialReports({rows,shell,type:e.target.value});
 const calculate=async()=>{
  if(busy)return;busy=true;button.disabled=true;exportButton.disabled=true;printButton.disabled=true;controls.forEach(c=>c.disabled=true);target.textContent='กำลังจัดทำรายงาน...';
  try{
   output=[];summaries=[];note='';let from='',to='';
   if(dated){from=document.querySelector('#reportFrom').value;to=document.querySelector('#reportTo').value;if(!validDate(from)||!validDate(to)||from>to)throw Error('กรุณาระบุวันที่เริ่มต้นและสิ้นสุดให้ถูกต้อง')}
   const terms=search.value.trim().toLowerCase().split(/\s+/).filter(Boolean),selected=rows.filter(r=>(!material.value||r.id===material.value)&&(!group.value||r.data.group===group.value)&&terms.every(t=>`${r.code} ${r.title}`.toLowerCase().includes(t)));
   metadata=[['รายงาน',title],['หน่วยงาน',organization().name],['ที่อยู่',organization().address],['ขอบเขตวันที่',dated?`${from} ถึง ${to}`:`ยอดปัจจุบัน ณ ${today}`],['วัสดุ',material.selectedOptions[0].textContent],['หมวด',group.value||'ทุกหมวด'],['คำค้น',search.value.trim()||'ทั้งหมด'],['จัดทำเมื่อ',new Date().toLocaleString('th-TH')]];
   for(const r of selected){
    const qty=Number(r.data.quantity||0),min=Number(r.data.minimum||0);
    if(current){if(type==='low'&&qty>min)continue;output.push([r.code,r.title,r.data.group||'ไม่ระบุหมวด',r.data.unit,Number(r.amount),qty,qty*Number(r.amount),min,qty===0?'หมดคลัง':qty<=min?'ถึงจุดสั่งซื้อ':'ปกติ',...(type==='low'?[Math.max(0,min-qty)]:[])])}
    else{const entries=chronologicalMovements(r,await stockEntries(r.id));if(!target.isConnected)return;
     if(type==='movements'){const s=summarizeMaterial(r,entries,from,to);output.push([r.code,r.title,r.data.unit,s.opening,s.received,s.issued,s.closing,s.receivedValue,s.issuedValue,s.closing*Number(r.amount)])}
     else for(const e of entries){const day=e.day,delta=Number(e.delta);if(day<from||day>to||(type==='issues'&&delta>=0)||(type==='receipts'&&delta<=0))continue;const priced=e.unit_price!==null&&e.unit_price!==undefined&&Number.isFinite(Number(e.unit_price));output.push([day,r.code,r.title,delta>0?'รับเข้า':'จ่ายออก',Math.abs(delta),r.data.unit,priced?Number(e.unit_price):'',priced?Math.abs(delta)*Number(e.unit_price):'',Number(e.balance),e.sender||e.party||'',e.recipient||'',e.document_no||'',delta>0?e.party||'':'',e.created_at])}
    }
   }
   if(!target.isConnected)return;
   if(current)output=output.map(row=>{const record=rows.find(r=>r.code===row[0]);return [...row,record.data.custodian||'',record.data.location||'']});
   if(type==='receipts')output=output.map(row=>[...row.slice(0,10),...row.slice(-3)]);
   const sum=index=>output.reduce((n,r)=>n+Number(r[index]||0),0);
   if(current){summaries=[['วัสดุที่แสดง',`${output.length} รายการ`],['มูลค่าคงเหลือ',`${money(sum(6))} บาท`],['หมดคลัง',`${output.filter(r=>r[5]===0).length} รายการ`],['ถึงจุดสั่งซื้อ (รวมหมด)',`${output.filter(r=>r[5]<=r[7]).length} รายการ`]];note='มูลค่าคงเหลือ = จำนวนคงเหลือ × ราคาต่อหน่วยปัจจุบัน';if(type==='low')note+=' จำนวนที่ขาดจากจุดสั่งซื้อเป็นผลต่าง ไม่ใช่จำนวนสั่งซื้อที่ระบบแนะนำ'}
   else if(details){output.sort((a,b)=>String(a[0]).localeCompare(String(b[0]))||String(a.at(-1)).localeCompare(String(b.at(-1))));summaries=[['รายการเคลื่อนไหว',`${output.length} ครั้ง`],['วัสดุ',`${new Set(output.map(r=>r[1])).size} รายการ`],['มูลค่ารายการ',`${money(sum(7))} บาท`]];note='ยอดหลังรายการเป็นยอดคงเหลือของวัสดุนั้นหลังรับหรือจ่ายแต่ละครั้ง มูลค่ารายการ = จำนวน × ราคาที่บันทึกขณะทำรายการ วันที่รับ–จ่ายเป็นวันที่ระบุในแบบฟอร์ม ส่วนบันทึกเมื่อเป็นเวลาบันทึกจริง'}
   else{summaries=[['วัสดุที่แสดง',`${output.length} รายการ`],['มูลค่ารับ',`${money(sum(7))} บาท`],['มูลค่าจ่าย',`${money(sum(8))} บาท`],['มูลค่าคงเหลือ',`${money(sum(9))} บาท`]];note='มูลค่าคงเหลือ ณ สิ้นช่วง = ยอดสิ้นช่วง × ราคาต่อหน่วยปัจจุบัน ยอดสิ้นช่วง = ยอดก่อนช่วงวันที่ + จำนวนรับ − จำนวนจ่าย ไม่รวมจำนวนของวัสดุต่างหน่วยเข้าด้วยกัน รายงานใช้วันที่รับ–จ่ายที่ระบุ ยอดย้อนหลังอาศัยประวัติที่บันทึกไว้ หากไม่มีประวัติใช้ยอดปัจจุบัน'}
   const cell=(v,i)=>{if(v===''||v===null||v===undefined)return '—';if(details&&i===0)return esc(date(v));if(details&&i===headers.length-1)return esc(new Date(v).toLocaleString('th-TH'));return numeric.includes(i)?(monetary.includes(i)?money(v):number(v)):esc(v)};
   target.innerHTML=`<section class="report-output"><h3>${title}</h3><p class="muted">${esc(organization().name)} · ${dated?`${date(from)} ถึง ${date(to)}`:`ข้อมูลปัจจุบัน ณ ${date(today)}`}</p><p class="muted">${esc(material.selectedOptions[0].textContent)} · ${esc(group.value||'ทุกหมวด')}${search.value.trim()?` · ค้นหา ${esc(search.value.trim())}`:''} · จัดทำเมื่อ ${esc(metadata.at(-1)[1])}</p><p class="muted">${esc(organization().address)}</p><div class="stats report-summary">${summaries.map(([label,value])=>`<div class="stat"><span class="muted">${label}</span><strong>${value}</strong></div>`).join('')}</div><p class="report-note">${esc(note)}</p><div class="tablewrap"><table><thead><tr>${headers.map((h,i)=>`<th class="${numeric.includes(i)?'numeric':''}">${h}</th>`).join('')}</tr></thead><tbody>${output.map(row=>`<tr>${row.map((v,i)=>`<td class="${numeric.includes(i)?'numeric':''}">${cell(v,i)}</td>`).join('')}</tr>`).join('')}</tbody></table>${output.length?'':'<div class="empty">ไม่พบข้อมูลตามเงื่อนไข ลองเปลี่ยนวัสดุ หมวด หรือช่วงวันที่</div>'}</div></section>`;
   document.querySelector('#reportHint').textContent=description;exportButton.disabled=false;printButton.disabled=false;
  }catch(error){if(target.isConnected)target.textContent=error.message}finally{busy=false;button.disabled=false;controls.forEach(c=>c.disabled=false)}
 };
 material.onchange=calculate;group.onchange=calculate;button.onclick=calculate;
 for(const input of controls.filter(c=>c.tagName==='INPUT'))input.oninput=()=>{exportButton.disabled=true;printButton.disabled=true;document.querySelector('#reportHint').textContent='เงื่อนไขเปลี่ยนแล้ว กดแสดงรายงานเพื่อปรับข้อมูลให้ตรงกับเงื่อนไขใหม่'};
 exportButton.onclick=()=>{const content=csv([...metadata,...summaries,['คำอธิบาย',note],headers,...output]);const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`material-${type}-${today}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 printButton.onclick=()=>printDocument(target.innerHTML,{className:'material-report-print'});
 await calculate();
}
