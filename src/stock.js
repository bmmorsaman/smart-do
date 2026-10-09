import {organization} from './organization.js';
import {stockEntries,isDemo,auditEntries} from './store.js';
import {csv} from './domain.js';
import {auditHtml} from './audit-view.js';
import {chronologicalMovements} from './material-calculations.js';
import {printDocument} from './printing.js';
import {stockTemplate} from './stock-template.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>Number(value).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
export async function openStock(record){
 const d=document.querySelector('#editor');
 d.innerHTML=`<h2>บัญชีวัสดุ · ${esc(record.title)}</h2><p>คงเหลือ ${esc(record.data.quantity||0)} ${esc(record.data.unit)}</p><h3 style="margin-top:24px">รายการรับจ่ายทั้งหมด</h3>${isDemo()?'<p class="muted">ข้อมูลสมมติสำหรับทดลอง ตรวจสอบยอดรับ จ่าย และคงเหลือจากประวัติด้านล่าง</p>':''}<div id="stockHistory">กำลังโหลด...</div><div class="modal-actions"><button type="button" id="close" class="secondary">ปิด</button></div>`;
 d.showModal();d.querySelector('#close').onclick=()=>d.close();
 try{
  const entries=await stockEntries(record.id);
  if(!d.open||!d.querySelector('#stockHistory'))return;
  const chronological=chronologicalMovements(record,entries);
  const headers=['วันที่รับ / จ่าย','หลักฐาน / เหตุผล','ราคาต่อหน่วย (บาท)','จำนวนรับ','มูลค่ารับ (บาท)','จำนวนจ่าย','มูลค่าจ่าย (บาท)','จำนวนคงเหลือ','มูลค่าคงเหลือ (บาท)','ผู้ทำรายการ','ผู้ควบคุมวัสดุ','ผู้รับ','บันทึกเมื่อ','รับจาก'];
  const lines=chronological.map(entry=>{
   const priced=entry.unit_price!==null&&entry.unit_price!==undefined&&Number.isFinite(Number(entry.unit_price));
   const price=priced?Number(entry.unit_price):null,delta=Number(entry.delta);
   return [entry.day,[entry.document_no,entry.reason].filter(Boolean).join(' · '),price??'',delta>0?delta:'',delta>0&&priced?delta*price:'',delta<0?-delta:'',delta<0&&priced?-delta*price:'',entry.balance,priced?Number(entry.balance)*price:'',entry.actor,entry.sender||entry.party||'',entry.recipient||'',entry.created_at,delta>0?entry.party||'':''];
  });
  const opening=chronological.length?Number(chronological[0].balance)-Number(chronological[0].delta):Number(record.data.quantity||0);
  const heading=`<h2>Stock Card · บัญชีวัสดุรายรายการ</h2><p>${esc(organization().name)}</p><p>${esc(organization().address)}</p><p>รหัส ${esc(record.code)} · ${esc(record.title)}</p><p>หน่วยนับ: ${esc(record.data.unit)} · ที่เก็บ: ${esc(record.data.location||'ยังไม่ระบุ')}</p><p>ยอดก่อนรายการแรกที่แสดง: ${esc(opening)} · คงเหลือปัจจุบัน: ${esc(record.data.quantity||0)} ${esc(record.data.unit)}</p><p>ราคาต่อหน่วยปัจจุบัน ${money(record.amount)} บาท · มูลค่าคงเหลือตามราคาปัจจุบัน ${money(Number(record.data.quantity||0)*Number(record.amount))} บาท</p><p class="muted">มูลค่า = จำนวน × ราคาต่อหน่วยที่บันทึกขณะรับจ่าย รายการเก่าที่ไม่มีราคาจะเว้นช่องมูลค่าไว้</p>`;
  const table=`<div class="tablewrap"><table><thead><tr>${headers.map(label=>`<th>${label}</th>`).join('')}</tr></thead><tbody>${lines.map(line=>`<tr>${line.map((value,index)=>`<td>${[2,4,6,8].includes(index)&&value!==''?money(value):index===0?esc(new Date(value+'T12:00:00').toLocaleDateString('th-TH')):index===12?esc(new Date(value).toLocaleString('th-TH')):esc(value)}</td>`).join('')}</tr>`).join('')||'<tr><td colspan="14">ยังไม่มีรายการรับจ่าย</td></tr>'}</tbody></table></div>`;
  d.querySelector('#stockHistory').innerHTML=`${heading}<p class="muted">แสดงรายการตามวันที่รับ–จ่าย จากเก่าไปใหม่ แยกวันเวลาที่บันทึกจริงไว้ท้ายตาราง</p>${table}<div class="modal-actions"><button type="button" id="exportStock" class="secondary">ส่งออก CSV</button><button type="button" id="printStock" class="secondary">พิมพ์ / PDF</button></div>`;
  const history=document.createElement('section');history.id='materialAudit';history.innerHTML='<h3>ประวัติทะเบียนวัสดุ</h3><p>กำลังโหลด...</p>';d.querySelector('#stockHistory').after(history);
  auditEntries(record.id).then(entries=>{if(history.isConnected)history.innerHTML='<h3>ประวัติทะเบียนวัสดุ · 200 รายการล่าสุด</h3>'+auditHtml(entries)}).catch(error=>{if(history.isConnected)history.textContent=error.message});
  d.querySelector('#exportStock').onclick=()=>{
   const content=csv([['Stock Card',record.code,record.title],['หน่วยงาน',organization().name],['ที่อยู่',organization().address],['หน่วยนับ',record.data.unit],['ยอดก่อนรายการแรกที่แสดง',opening],['ราคาต่อหน่วยปัจจุบัน',record.amount],['มูลค่าคงเหลือตามราคาปัจจุบัน',Number(record.data.quantity||0)*Number(record.amount)],['วิธีคำนวณ','จำนวน × ราคาขณะทำรายการ; รายการเก่าที่ไม่มีราคาเว้นช่องมูลค่า'],headers,...lines.map(line=>line.map((value,index)=>[2,4,6,8].includes(index)&&value!==''?Number(value).toFixed(2):value))]);
   const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
   const a=document.createElement('a');a.href=url;a.download=`stock-card-${record.code.replace(/[^\p{L}\p{N}_-]/gu,'_')}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  d.querySelector('#printStock').onclick=()=>{
   printDocument(heading+'<p>รายการรับจ่ายทั้งหมด</p>'+table,{className:'stock-print'});
  };
  d.querySelector('#printStock').textContent='พิมพ์ / PDF แบบเดิม';
  const templateButton=document.createElement('button');templateButton.type='button';templateButton.id='printStockTemplate';templateButton.className='secondary';templateButton.textContent='พิมพ์ / PDF แบบบัญชีวัสดุ';
  d.querySelector('#printStock').after(templateButton);
  templateButton.onclick=()=>printDocument(stockTemplate(record,chronological,opening),{className:'stock-template-print',pageSize:'A4 landscape',pageMargin:'48.2pt 72pt 34pt 72pt'});
 }catch(error){if(d.open&&d.querySelector('#stockHistory'))d.querySelector('#stockHistory').textContent=error.message}
}
