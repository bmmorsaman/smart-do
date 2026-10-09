import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';

// Run against npm run dev: node tests/browser-smoke.mjs
const executable=process.env.BROWSER_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile=await mkdtemp(join(tmpdir(),'smart-do-browser-'));
const browser=spawn(executable,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9227',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
let socket;
const pending=new Map();let sequence=0;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
 let targets;
 for(let attempt=0;attempt<50;attempt++){
  try{targets=await fetch('http://127.0.0.1:9227/json').then(r=>r.json());if(targets.some(t=>t.type==='page'))break}catch{}
  await delay(200);
 }
 assert.ok(targets?.some(t=>t.type==='page'),'Browser debugging endpoint available');
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});
 socket.onmessage=e=>{const message=JSON.parse(e.data);if(message.id){const request=pending.get(message.id);pending.delete(message.id);message.error?request.reject(Error(message.error.message)):request.resolve(message.result)}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text+': '+result.exceptionDetails.exception?.description);return result.result.value};
 await send('Page.navigate',{url:process.env.APP_URL||'http://127.0.0.1:5173/'});
 for(let attempt=0;attempt<50;attempt++){if(await evaluate('!!document.querySelector("#demo")'))break;await delay(200)}
 const checks=await evaluate(`(async()=>{
  const checks=[];
  const expect=(condition,label)=>{if(!condition)throw Error(label);checks.push(label)};
  const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,50))}throw Error('Timed out waiting for UI')};
  expect(document.title.includes('Smart'),'Landing page renders');
  localStorage.setItem('thai-procurement-demo-v1',JSON.stringify([{id:'existing-material',module:'materials',code:'MAT-001',title:'กระดาษที่แก้ชื่อไว้',amount:125,status:'ร่าง',fiscal_year:2570,data:{quantity:17,minimum:10,unit:'รีม',notes:'ข้อมูลเดิมต้องไม่ถูกทับ'}}]));
  document.querySelector('#demo').click();await wait(()=>document.querySelector('[data-page="materials"]'));
  expect(document.body.textContent.includes('โหมดทดลอง'),'Demo login works without Supabase');
  expect(!document.querySelector('[data-page="users"]'),'User management is hidden without real Admin email login');
  expect(!document.querySelector('[data-page="assets"]')&&!document.querySelector('[data-page="requests"]')&&!document.querySelector('[data-page="loans"]'),'Only materials registry appears in navigation');
  expect([...document.querySelectorAll('nav [data-page]')].every(button=>button.querySelector('svg')&&!button.querySelector('i[data-lucide]')),'Every navigation menu displays its icon');
  const seeded=JSON.parse(localStorage.getItem('thai-procurement-demo-v1'));
  expect(seeded.length===16,'Complete demo contains sixteen materials');
  expect(seeded.find(r=>r.code==='MAT-001').data.quantity===25&&seeded.find(r=>r.code==='MAT-001').title==='กระดาษ A4','New demo version resets old examples as requested');
  document.querySelector('[data-page="settings"]').click();
  const org=document.querySelector('#organizationForm');org.elements.name.value='หน่วยงานวัสดุทดสอบ';org.elements.address.value='123 หมู่ 1 ตำบลทดสอบ อำเภอทดสอบ จังหวัดทดสอบ';org.requestSubmit();await wait(()=>document.querySelector('#organizationStatus').textContent==='บันทึกข้อมูลหน่วยงานแล้ว');
  expect(document.querySelector('[data-org-name]').textContent==='หน่วยงานวัสดุทดสอบ','Configured organization updates system brand');
  for(const slot of ['ministry','health_center']){
   const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;canvas.getContext('2d').fillRect(0,0,32,32);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),transfer=new DataTransfer();transfer.items.add(new File([blob],'logo.png',{type:'image/png'}));
   const input=document.querySelector('[data-logo-upload="'+slot+'"]');input.files=transfer.files;input.dispatchEvent(new Event('change'));await wait(()=>document.querySelector('#logoStatus').textContent==='บันทึกโลโก้แล้ว'&&!input.disabled);
   expect(document.querySelector('aside [data-logo="'+slot+'"]').src.startsWith('data:image/png;base64,'),'Uploaded logo appears in brand: '+slot);
  }
  document.querySelector('[data-page="dashboard"]').click();expect(document.querySelector('aside [data-logo="ministry"]').src.startsWith('data:image/png;base64,'),'Uploaded logo persists across pages');document.querySelector('[data-page="settings"]').click();
  for(const slot of ['ministry','health_center']){document.querySelector('[data-logo-reset="'+slot+'"]').click();await wait(()=>document.querySelector('aside [data-logo="'+slot+'"]').src.includes('/logos/'))}
  for(const [category,name] of [['custodians','ผู้จ่าย'],['custodians','ผู้จ่ายใหม่'],['recipients','ผู้รับ'],['recipients','ผู้รับใหม่'],['groups','หมวดตั้งค่า'],['units','หน่วยตั้งค่า']]){const form=document.querySelector('[data-setting-add="'+category+'"]');form.querySelector('input').value=name;form.requestSubmit();await wait(()=>document.querySelector('[data-setting-add="'+category+'"] input')?.value==='')}
  expect(localStorage.getItem('thai-material-settings-v1').includes('หมวดตั้งค่า')&&localStorage.getItem('thai-material-settings-v1').includes('ผู้รับใหม่'),'Settings persist all four list categories');
  const locationForm=document.querySelector('[data-setting-add="locations"]');locationForm.querySelector('input').value='ห้องเก็บทดสอบ';locationForm.requestSubmit();await wait(()=>document.querySelector('[data-setting-add="locations"] input')?.value==='');
  expect(localStorage.getItem('thai-material-settings-v1').includes('ห้องเก็บทดสอบ'),'Storage locations persist in settings');
  const sourceForm=document.querySelector('[data-setting-add="sources"]');sourceForm.querySelector('input').value='คลังวัสดุหน่วยงานทดสอบ';sourceForm.requestSubmit();await wait(()=>document.querySelector('[data-setting-add="sources"] input')?.value==='');
  expect(localStorage.getItem('thai-material-settings-v1').includes('คลังวัสดุหน่วยงานทดสอบ'),'Receipt sources persist in settings');
  const duplicateForm=document.querySelector('[data-setting-add="recipients"]');duplicateForm.querySelector('input').value='ผู้รับใหม่';duplicateForm.requestSubmit();await wait(()=>document.querySelector('#settingsError').textContent);expect(document.querySelector('#settingsError').textContent.includes('มีชื่อนี้'),'Settings reject duplicate names');
  const deleteForm=document.querySelector('[data-setting-add="groups"]');deleteForm.querySelector('input').value='หมวดลบตัวอย่าง';deleteForm.requestSubmit();await wait(()=>document.querySelector('[data-setting-add="groups"] input')?.value==='');
  const disposable=JSON.parse(localStorage.getItem('thai-material-settings-v1')).find(e=>e.name==='หมวดลบตัวอย่าง'),confirmOriginal=window.confirm;window.confirm=()=>true;document.querySelector('[data-setting-delete="'+disposable.id+'"]').click();await wait(()=>!document.querySelector('[data-setting-delete="'+disposable.id+'"]'));window.confirm=confirmOriginal;
  expect(!localStorage.getItem('thai-material-settings-v1').includes('หมวดลบตัวอย่าง')&&JSON.parse(localStorage.getItem('thai-procurement-demo-v1')).length===16,'Deleting a setting leaves materials intact');
  for(const module of ['materials']){
   document.querySelector('[data-page="'+module+'"]').click();
   expect(document.querySelectorAll('#results tbody tr').length===16,'Demo registry renders: '+module);
  }
  document.querySelector('[data-page="materials"]').click();
  expect(!document.querySelector('[data-delete]'),'Material deletion matches SQL restriction');
  document.querySelector('[data-stock]').click();
  const quantity=document.querySelector('[name="quantity"]');quantity.value='2';
  document.querySelector('[name="document_no"]').value='RCV-TEST-001';
  document.querySelector('[name="party"]').value='คลังวัสดุหน่วยงานทดสอบ';
  expect(document.querySelector('[name="party"]').tagName==='SELECT','Receipt source selects from settings');
  document.querySelector('[name="sender"]').value='ผู้จ่าย';expect(!document.querySelector('[name="recipient"]'),'Receipt form omits recipient');
  const initial=JSON.parse(localStorage.getItem('thai-procurement-demo-v1')).find(r=>r.module==='materials').data.quantity;
  document.querySelector('#movementForm').requestSubmit();await wait(()=>!document.querySelector('#movementForm'));
  expect(JSON.parse(localStorage.getItem('thai-procurement-demo-v1')).find(r=>r.module==='materials').data.quantity===initial+2,'Stock receipt persists');
  document.querySelector('[data-page="materials"]').click();document.querySelector('[data-issue]').click();document.querySelector('[name="quantity"]').value='999999';document.querySelector('[name="sender"]').value='ผู้จ่าย';document.querySelector('[name="recipient"]').value='ผู้รับ';document.querySelector('#movementForm').dispatchEvent(new Event('submit',{cancelable:true}));await wait(()=>document.querySelector('#movementError')?.textContent);document.querySelector('#movementLedger').click();
  await wait(()=>document.querySelector('#stockHistory')?.textContent.includes('ผู้จ่าย'));
  const receipt=[...document.querySelectorAll('#stockHistory tbody tr')].filter(r=>r.textContent.includes('ผู้จ่าย')).at(-1);
  const receiptPrice=JSON.parse(localStorage.getItem('thai-procurement-demo-v1')).find(r=>r.module==='materials').amount;
  expect(receipt&&receipt.textContent.includes('ผู้จ่าย')&&receipt.cells[4].textContent===Number(receiptPrice*2).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})&&document.querySelector('#stockHistory').textContent.includes('มูลค่าคงเหลือ'),'Stock ledger displays document evidence and monetary values');
  expect(receipt.textContent.includes('คลังวัสดุหน่วยงานทดสอบ'),'Receipt source persists separately from material controller');
  expect(receipt.textContent.includes('RCV-TEST-001'),'Receipt document number persists in Stock Card');
  expect(document.querySelector('#movementError').textContent.includes('ไม่เพียงพอ'),'Stock overdraw rejected');document.querySelector('#close').click();
  document.querySelector('[data-page="issues"]').click();
  const search=document.querySelector('#movementSearch');search.value='MAT-001';search.dispatchEvent(new Event('input'));
  expect(document.querySelectorAll('#movementResults tbody tr').length===1,'Movement tab searches materials by code');
  document.querySelector('[data-material]').click();
  const issueBefore=JSON.parse(localStorage.getItem('thai-procurement-demo-v1')).find(r=>r.code==='MAT-001').data.quantity;
  const issueForm=document.querySelector('#movementForm');issueForm.querySelector('[name="quantity"]').value='1';issueForm.querySelector('[name="sender"]').value='ผู้จ่ายใหม่';issueForm.querySelector('[name="recipient"]').value='ผู้รับใหม่';issueForm.dispatchEvent(new Event('input'));
  expect(issueForm.querySelector('[name="sender"]').tagName==='SELECT'&&issueForm.querySelector('[name="recipient"]').tagName==='SELECT','Issue form selects custodian and recipient from settings');
  expect(document.querySelector('#movementPreview').textContent.includes(String(issueBefore-1)),'Movement form previews resulting balance');
  issueForm.requestSubmit();await wait(()=>!document.querySelector('#movementForm'));
  expect(JSON.parse(localStorage.getItem('thai-procurement-demo-v1')).find(r=>r.code==='MAT-001').data.quantity===issueBefore-1,'Dedicated movement tab persists stock issue');
  document.querySelector('[data-page="materials"]').click();document.querySelector('#add').click();document.querySelector('[name="code"]').value='SMOKE-001';document.querySelector('[name="title"]').value='รายการทดสอบ';document.querySelector('[name="amount"]').value='100';document.querySelector('[name="group"]').value='หมวดตั้งค่า';document.querySelector('[name="unit"]').value='หน่วยตั้งค่า';document.querySelector('#recordForm').requestSubmit();await wait(()=>!document.querySelector('dialog[open]'));
  expect(document.querySelector('#results').textContent.includes('SMOKE-001'),'Record creation persists');
  let row=[...document.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('SMOKE-001'));row.querySelector('[data-edit]').click();
  expect(!document.querySelector('#readiness')&&!document.querySelector('[data-next]'),'Editor has no readiness or approval controls');
  expect(!document.querySelector('[name="fiscal_year"]')&&!document.querySelector('[name="receipt_ref"]')&&!document.querySelector('[name="counted_quantity"]'),'Registry omits removed fiscal and inspection fields');
  expect(document.querySelector('[name="group"]').tagName==='SELECT'&&document.querySelector('[name="unit"]').tagName==='SELECT'&&document.querySelector('[name="group"]').textContent.includes('หมวดตั้งค่า'),'Material editor selects configured groups and units');
  document.querySelector('[name="notes"]').value='ข้อมูลรายงานเพิ่มเติม';document.querySelector('#recordForm').requestSubmit();await wait(()=>!document.querySelector('dialog[open]'));
  row=[...document.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('SMOKE-001'));row.querySelector('[data-edit]').click();
  const originalPrint=window.print;window.print=()=>{};document.querySelector('#printRecord').click();
  expect(document.querySelector('#printDocument').textContent.includes('ข้อมูลรายงานเพิ่มเติม'),'Printed report includes recorded information');
  window.dispatchEvent(new Event('afterprint'));window.print=originalPrint;document.querySelector('#close').click();
  document.querySelector('[data-page="reports"]').click();await wait(()=>document.querySelectorAll('#materialReport tbody tr').length===17);expect(document.querySelector('#materialReport').textContent.includes('มูลค่ารับ'),'Period materials report renders');expect(document.querySelector('#reportType').options.length===6,'Report options match the six supported material functions');
  document.querySelector('[data-page="audit"]').click();await wait(()=>document.querySelector('#auditResults details'));
  expect(document.querySelector('#auditResults').textContent.includes('INSERT')&&document.querySelector('#auditResults').textContent.includes('UPDATE'),'Demo audit includes creation and stock/status updates');
  const history=JSON.parse(localStorage.getItem('thai-procurement-demo-v1-audit'));
  expect(history.some(entry=>entry.action==='UPDATE'&&entry.old_data?.data?.quantity===initial&&entry.new_data?.data?.quantity===initial+2),'Audit preserves stock before and after values');
  document.querySelector('#auditSearch').value='SMOKE-001';document.querySelector('#auditSearch').dispatchEvent(new Event('input'));expect([...document.querySelectorAll('#auditResults summary')].every(e=>e.textContent.includes('SMOKE-001')),'Audit search filters history by material code');
  document.querySelector('[data-page="reports"]').click();await wait(()=>document.querySelector('#exportReport')&&!document.querySelector('#exportReport').disabled);
  for(const type of ['balances','low','ledger','issues']){document.querySelector('#reportType').value=type;document.querySelector('#reportType').dispatchEvent(new Event('change'));await wait(()=>!document.querySelector('#exportReport').disabled);expect(document.querySelector('#materialReport table')!==null,'Additional report renders: '+type)}
  expect(document.querySelector('#materialReport').textContent.includes('ผู้รับใหม่'),'Issue report includes recorded evidence');
  document.querySelector('#reportType').value='receipts';document.querySelector('#reportType').dispatchEvent(new Event('change'));await wait(()=>!document.querySelector('#exportReport').disabled);
  expect([...document.querySelectorAll('#materialReport tbody tr')].every(r=>r.cells[3].textContent==='รับเข้า')&&document.querySelectorAll('#materialReport tbody tr').length>1,'Receipt report includes receipts only');
  expect(document.querySelectorAll('#materialReport .stat').length===3&&!document.querySelector('#materialReport').textContent.includes('ไม่ทราบราคา'),'Reports show summary cards without unknown-price entries');
  document.querySelector('#reportFrom').value='2099-01-01';document.querySelector('#reportFrom').dispatchEvent(new Event('input'));
  expect(document.querySelector('#exportReport').disabled&&document.querySelector('#printReport').disabled,'Changed report criteria prevent stale exports and printing');
  document.querySelector('#calculateReport').click();await wait(()=>!document.querySelector('#calculateReport').disabled);
  expect(document.querySelector('#materialReport').textContent.includes('วันที่เริ่มต้น')&&document.querySelector('#exportReport').disabled,'Invalid report date range is explained');
  document.querySelector('#reportType').value='balances';document.querySelector('#reportType').dispatchEvent(new Event('change'));await wait(()=>!document.querySelector('#exportReport').disabled);
  expect(document.querySelector('#materialReport').textContent.includes('ผู้ควบคุมวัสดุ'),'Balance report includes material custodian');
  const reportPrint=window.print;window.print=()=>{};document.querySelector('#printReport').click();
  expect(document.querySelector('#printDocument').textContent.includes('คงเหลือ')&&!document.querySelector('#printDocument').querySelector('#reportType'),'Report print includes calculated output without filter controls');
  window.dispatchEvent(new Event('afterprint'));window.print=reportPrint;
  document.querySelector('[data-page="materials"]').click();document.querySelector('#importMaterials').click();
  const transfer=new DataTransfer();transfer.items.add(new File(['รหัสวัสดุ,ชื่อวัสดุ,หมวด,หน่วย,ราคาต่อหน่วย,จุดสั่งซื้อ,ที่เก็บ\\nIMPORT-001,วัสดุนำเข้า,วัสดุสำนักงาน,ชิ้น,25,5,ห้องเก็บ'], 'materials.csv',{type:'text/csv'}));document.querySelector('#importFile').files=transfer.files;document.querySelector('#importFile').dispatchEvent(new Event('change'));await wait(()=>!document.querySelector('#importSave').disabled);document.querySelector('#importSave').click();await wait(()=>!document.querySelector('dialog[open]'));
  expect(JSON.parse(localStorage.getItem('thai-procurement-demo-v1')).find(r=>r.code==='IMPORT-001')?.data.quantity===0,'CSV import creates zero-balance material ready for receipt');
  document.querySelector('[data-page="receipts"]').click();document.querySelector('#movementSearch').value='IMPORT-001';document.querySelector('#movementSearch').dispatchEvent(new Event('input'));document.querySelector('[data-material]').click();
  const datedForm=document.querySelector('#movementForm'),clockNow=new Date(),previousMonth=new Date(clockNow.getFullYear(),clockNow.getMonth(),0),previousDate=previousMonth.getFullYear()+'-'+String(previousMonth.getMonth()+1).padStart(2,'0')+'-'+String(previousMonth.getDate()).padStart(2,'0');
  datedForm.querySelector('[name="quantity"]').value='4';datedForm.querySelector('[name="sender"]').value=datedForm.querySelector('[name="sender"]').options[1].value;datedForm.querySelector('[name="movement_date"]').value='2999-01-01';datedForm.dispatchEvent(new Event('submit',{cancelable:true}));await wait(()=>document.querySelector('#movementError').textContent);
  expect(document.querySelector('#movementError').textContent.includes('ไม่เกินวันนี้'),'Future movement dates are rejected');
  datedForm.querySelector('[name="movement_date"]').value=previousDate;datedForm.requestSubmit();await wait(()=>!document.querySelector('#movementForm'));
  const importedId=JSON.parse(localStorage.getItem('thai-procurement-demo-v1')).find(r=>r.code==='IMPORT-001').id,datedEntry=JSON.parse(localStorage.getItem('thai-procurement-demo-v1-movements')).find(e=>e.record_id===importedId);
  expect(datedEntry.movement_date===previousDate&&new Date(datedEntry.created_at)>previousMonth,'Backdated receipts preserve the actual recording timestamp');
  document.querySelector('[data-page="reports"]').click();await wait(()=>!document.querySelector('#exportReport').disabled);document.querySelector('#reportType').value='receipts';document.querySelector('#reportType').dispatchEvent(new Event('change'));await wait(()=>!document.querySelector('#exportReport').disabled);
  document.querySelector('#reportMaterial').value=importedId;document.querySelector('#reportFrom').value=previousDate;document.querySelector('#reportTo').value=previousDate;document.querySelector('#calculateReport').click();await wait(()=>!document.querySelector('#calculateReport').disabled);
  expect(document.querySelectorAll('#materialReport tbody tr').length===1&&document.querySelector('#materialReport').textContent.includes('IMPORT-001')&&document.querySelector('#materialReport').textContent.includes('บันทึกเมื่อ'),'Reports filter by movement date independently of recording time');
  document.querySelector('[data-page="materials"]').click();
  document.querySelector('#resetDemo').click();await wait(()=>document.querySelectorAll('#results tbody tr').length===16);
  const resetRows=JSON.parse(localStorage.getItem('thai-procurement-demo-v1')),resetMovements=JSON.parse(localStorage.getItem('thai-procurement-demo-v1-movements'));
  expect(!resetRows.some(r=>['IMPORT-001','SMOKE-001'].includes(r.code))&&resetRows.find(r=>r.code==='MAT-001').data.quantity===25,'Demo reset removes trial edits and restores complete examples');
  expect(resetRows.every(r=>resetMovements.filter(e=>e.record_id===r.id).reduce((n,e)=>n+Number(e.delta),0)===r.data.quantity),'Reset movement history reconciles every material balance');
  expect(!localStorage.getItem('thai-material-settings-v1').includes('หมวดตั้งค่า'),'Demo reset restores configured example lists');
  return checks;
 })()`);
 checks.forEach(label=>console.log('PASS',label));
 const preview=await evaluate(`(async()=>{
  document.querySelector('[data-page="materials"]').click();document.querySelector('[data-edit]').click();
  const originalPrint=window.print;let calls=0;window.print=()=>calls++;
  document.querySelector('#printRecord').click();
  const visible=getComputedStyle(document.querySelector('#printDocument')).display!=='none'&&!document.querySelector('#editor').open&&calls===0;
  document.querySelector('#confirmPrint').click();await document.fonts.ready;await new Promise(r=>setTimeout(r,20));
  const requested=calls===1;document.querySelector('#closePrintPreview').click();
  const restored=document.querySelector('#editor').open&&!document.querySelector('#printDocument')&&!document.querySelector('#printPreviewActions');
  document.querySelector('#editor').close();window.print=originalPrint;return {visible,requested,restored};
 })()`);
 assert.ok(preview.visible&&preview.requested&&preview.restored,JSON.stringify(preview));console.log('PASS Visible preview, explicit print and dialog restoration');
 await mkdir('.tmp/responsive-check',{recursive:true});
 for(const width of [320,390,768,1024,1440,1920]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<=600});
  for(const page of ['dashboard','materials','receipts','issues','reports','audit','settings']){
   await evaluate(`(async()=>{document.querySelector('#editor')?.close();document.querySelector('[data-page="${page}"]').click();await new Promise(r=>setTimeout(r,100));if(['receipts','issues'].includes('${page}'))document.querySelector('[data-material]').click();await document.fonts.ready;window.scrollTo(0,0)})()`);
   const layout=await evaluate(`(()=>{const width=document.documentElement.clientWidth,nav=[...document.querySelectorAll('nav button')];return {width,scroll:document.documentElement.scrollWidth,navVisible:nav.every(b=>{const rect=b.getBoundingClientRect();return rect.left>=0&&rect.right<=width+1&&rect.height>=44}),main:document.querySelector('main').getBoundingClientRect().width}})()`);
   assert.ok(layout.scroll<=layout.width+1&&layout.navVisible&&layout.main>250,`${width}px ${page}: ${JSON.stringify(layout)}`);
   assert.ok(await evaluate("[...document.querySelectorAll('.fields input,.fields select,.report-filters input,.report-filters select')].every(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>=44&&r.height<=64})"),`${width}px ${page}: usable form controls`);
   if((width===390&&['receipts','reports','settings'].includes(page))||(width===768&&page==='dashboard')||(width===1440&&page==='dashboard')){
    const screenshot=await send('Page.captureScreenshot',{format:'png'});await writeFile(`.tmp/responsive-check/${width}-${page}.png`,Buffer.from(screenshot.data,'base64'));
   }
  }
  await evaluate("document.querySelector('[data-page=materials]').click();document.querySelector('[data-edit]').click()");
  const modal=await evaluate("(()=>{const d=document.querySelector('#editor'),r=d.getBoundingClientRect();return {fits:r.left>=0&&r.right<=innerWidth&&r.height<=innerHeight,overflow:d.scrollWidth>d.clientWidth+1}})()");
  assert.ok(modal.fits&&!modal.overflow,`${width}px material dialog: ${JSON.stringify(modal)}`);
  await evaluate("document.querySelector('#editor').close()");
  console.log('PASS Responsive seven pages and material dialog: '+width+'px');
 }
 await send('Emulation.clearDeviceMetricsOverride');
 await mkdir('.tmp/print-check',{recursive:true});
 await send('Emulation.setEmulatedMedia',{media:'print'});
 for(const type of ['registry','record','stock','stock-template','movements','balances','receipts','issues','ledger','low']){
  await evaluate(`(async()=>{
   window.dispatchEvent(new Event('afterprint'));document.querySelector('#editor')?.close();window.print=()=>{};
   const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,50))}throw Error('Print data not ready')};
   const type=${JSON.stringify(type)};
   if(['registry','record','stock','stock-template'].includes(type)){
    document.querySelector('[data-page="materials"]').click();
    if(type==='registry')document.querySelector('#print').click();
    if(type==='record'){document.querySelector('[data-edit]').click();document.querySelector('#printRecord').click()}
    if(type==='stock'||type==='stock-template'){document.querySelector('[data-ledger]').click();await wait(()=>document.querySelector('#printStock'));document.querySelector(type==='stock'?'#printStock':'#printStockTemplate').click()}
   }else{
    document.querySelector('[data-page="reports"]').click();const selector=document.querySelector('#reportType');selector.value=type;selector.dispatchEvent(new Event('change'));
    await wait(()=>document.querySelector('#printReport')&&!document.querySelector('#printReport').disabled);document.querySelector('#printReport').click();
   }
   await document.fonts.ready;
  })()`);
  const layout=await evaluate(`(()=>{const doc=document.querySelector('#printDocument'),table=doc?.querySelector('table');return {visible:!!doc&&getComputedStyle(doc).display!=='none',appHidden:getComputedStyle(document.querySelector('#app')).display==='none',controls:doc?.querySelectorAll('button,input,select').length,overflow:!!table&&table.scrollWidth>table.clientWidth+2,columns:table?.querySelectorAll('thead th').length,text:doc?.textContent.length}})()`);
  assert.ok(layout.visible&&layout.appHidden&&!layout.controls&&!layout.overflow&&layout.text>100,`${type} print layout: ${JSON.stringify(layout)}`);
  const pdf=await send('Page.printToPDF',{preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
  const bytes=Buffer.from(pdf.data,'base64');assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.ok(bytes.length>5000);
  if(type==='stock-template')assert.ok(bytes.toString('latin1').includes('Sarabun'),'Stock Card PDF embeds Sarabun font');
  await writeFile(`.tmp/print-check/${type}.pdf`,bytes);
  console.log('PASS Actual PDF and print layout: '+type);
 }
 await evaluate("(()=>{document.querySelector('#printReport').click();const body=document.querySelector('#printDocument tbody'),sample=body.firstElementChild;for(let i=0;i<150;i++)body.append(sample.cloneNode(true))})()");
 const longPdf=await send('Page.printToPDF',{preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
 const longBytes=Buffer.from(longPdf.data,'base64');assert.ok((longBytes.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length>1,'Long report spans multiple PDF pages');
 await writeFile('.tmp/print-check/multiple-pages.pdf',longBytes);console.log('PASS Multi-page PDF');
 await evaluate("window.dispatchEvent(new Event('afterprint'))");
 assert.equal(await evaluate("!!document.querySelector('#printDocument')||document.body.classList.contains('document-print')"),false,'Print cleanup restores screen');
}finally{
 socket?.close();browser.kill();
 await delay(500);
 await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
