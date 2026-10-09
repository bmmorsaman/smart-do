import {organization} from './organization.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const qty=v=>Number(v).toLocaleString('th-TH',{maximumFractionDigits:3});
export function stockTemplate(record,entries,opening){
 const pages=[],perPage=12,widths=[14,22,14,7,8,6,6,9,14],total=widths.reduce((a,b)=>a+b,0);
 for(let start=0;start<Math.max(entries.length,1);start+=perPage){
  const carry=start?entries[start-1].balance:opening;
  const rows=entries.slice(start,start+perPage).map(e=>{
   const delta=Number(e.delta),priced=e.unit_price!=null&&Number.isFinite(Number(e.unit_price)),cents=priced?Math.round(Number(e.unit_price)*100):0;
   const party=delta>0?`รับจาก ${e.party||'........................'}`:`จ่ายให้ ${e.recipient||'........................'}`;
   return `<tr><td>${esc(new Date(e.day+'T12:00:00').toLocaleDateString('th-TH'))}</td><td>${esc(party)}</td><td>${esc(e.document_no)}</td><td class="amount">${priced?qty(Math.floor(cents/100)):''}</td><td class="amount">${priced?String(cents%100).padStart(2,'0'):''}</td><td class="amount">${delta>0?qty(delta):''}</td><td class="amount">${delta<0?qty(-delta):''}</td><td class="amount">${qty(e.balance)}</td><td>${esc(e.reason)}</td></tr>`;
  });
  while(rows.length<perPage)rows.push('<tr>'+Array(9).fill('<td>&nbsp;</td>').join('')+'</tr>');
  pages.push(`<article class="stock-template-page"><h2>บัญชีวัสดุ</h2><div class="word-agency"><p>${esc(organization().name)}</p><p>${esc(organization().address)}</p></div><p>หน่วยงาน <span class="word-line">${esc(organization().name)}</span></p><p>แผ่นที่ <span class="word-line short">${pages.length+1}</span></p><p>ประเภท <span class="word-line">${esc(record.title)}</span></p><div class="word-material"><p>ขนาดหรือลักษณะ <span class="word-line">${esc(record.data.description||'')}</span></p><p>หน่วยนับ <span class="word-line">${esc(record.data.unit)}</span></p><p>ที่เก็บ <span class="word-line">${esc(record.data.location||'')}</span></p></div><table><colgroup>${widths.map(w=>`<col style="width:${w/total*100}%">`).join('')}</colgroup><thead><tr><th rowspan="2">วัน เดือน ปี</th><th rowspan="2">รับจาก / จ่ายให้</th><th rowspan="2">เลขที่เอกสาร</th><th colspan="2">ราคาต่อหน่วย</th><th colspan="3">จำนวน</th><th rowspan="2">หมายเหตุ</th></tr><tr><th>บาท</th><th>สตางค์</th><th>รับ</th><th>จ่าย</th><th>คงเหลือ</th></tr></thead><tbody><tr><td></td><td>${start?'ยอดยกมาจากแผ่นก่อน':'ยอดยกมา'}</td><td></td><td></td><td></td><td></td><td></td><td class="amount">${qty(carry)}</td><td></td></tr>${rows.join('')}</tbody></table><div class="word-signature"><p>ผู้บันทึก.............................................</p><p>(.............................................)</p></div></article>`);
 }
 return pages.join('');
}
