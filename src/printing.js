let finishPrint;
export function printDocument(html,{landscape=true,className='',pageSize='',pageMargin='12mm'}={}){
 finishPrint?.();
 const section=document.createElement('section');section.id='printDocument';section.className=className;section.innerHTML=html;
 section.querySelectorAll('button,input,select,textarea,svg').forEach(element=>element.remove());
 const openDialog=document.querySelector('dialog[open]');openDialog?.close();
 const previousFocus=document.activeElement,previousScroll=window.scrollY;
 const actions=document.createElement('div');actions.id='printPreviewActions';
 actions.innerHTML='<strong>ตัวอย่างเอกสารก่อนพิมพ์</strong><span>เลือกพิมพ์ แล้วเลือกเครื่องพิมพ์หรือบันทึกเป็น PDF</span><button type="button" id="confirmPrint">พิมพ์ / บันทึก PDF</button><button type="button" id="closePrintPreview" class="secondary">กลับไปหน้าระบบ</button>';
 const pageStyle=document.createElement('style');pageStyle.textContent=`@media print{@page{size:${pageSize||`A4 ${landscape?'landscape':'portrait'}`};margin:${pageMargin}}}`;
 document.head.append(pageStyle);document.body.append(actions,section);document.body.classList.add('document-print');
 const cleanup=()=>{window.removeEventListener('afterprint',cleanup);document.removeEventListener('keydown',onKey);document.body.classList.remove('document-print');section.remove();actions.remove();pageStyle.remove();if(openDialog?.isConnected&&!openDialog.open)openDialog.showModal();previousFocus?.focus();window.scrollTo(0,previousScroll);if(finishPrint===cleanup)finishPrint=undefined};
 const onKey=event=>{if(event.key==='Escape'){event.preventDefault();cleanup()}};
 document.addEventListener('keydown',onKey);
 finishPrint=cleanup;window.addEventListener('afterprint',cleanup);
 actions.querySelector('#closePrintPreview').onclick=cleanup;
 actions.querySelector('#confirmPrint').onclick=async()=>{
  const button=actions.querySelector('#confirmPrint');button.disabled=true;
  try{await document.fonts.ready;if(section.isConnected)window.print()}finally{button.disabled=false}
 };
 window.scrollTo(0,0);actions.querySelector('#confirmPrint').focus();
}
