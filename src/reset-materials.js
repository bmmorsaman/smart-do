import {db,isDemo} from './store.js';
export function showResetMaterials(user){
 if(user.role!=='admin'||isDemo())return;
 const section=document.createElement('section');section.className='report';
 section.innerHTML='<h3>รีเซ็ตข้อมูลวัสดุ</h3><p>ลบทะเบียนวัสดุ รายการรับ–จ่าย และประวัติเดิมทั้งหมดอย่างถาวร เก็บรายการตั้งค่า โลโก้ ข้อมูลหน่วยงาน บัญชีผู้ใช้ และลำดับรหัสวัสดุไว้ ควรส่งออกรายงานที่ต้องการเก็บก่อนดำเนินการ</p><button id="resetMaterials" class="danger">รีเซ็ต / ลบข้อมูลวัสดุทั้งหมด</button>';
 document.querySelector('.settings-grid').after(section);
 section.querySelector('button').onclick=()=>{
  const d=document.querySelector('#editor');d.innerHTML='<h2>ยืนยันรีเซ็ตข้อมูลวัสดุ</h2><p>ข้อมูลวัสดุและประวัติรับ–จ่ายทั้งหมดจะถูกลบและกู้คืนผ่านหน้าเว็บไม่ได้ การตั้งค่าและบัญชีผู้ใช้ยังคงอยู่</p><form id="resetMaterialsForm"><div class="fields"><label class="wide">พิมพ์ ลบข้อมูลวัสดุทั้งหมด<input name="confirmation" required autocomplete="off"></label><label class="wide">รหัสผ่าน Admin ปัจจุบัน<input name="password" type="password" required maxlength="128" autocomplete="current-password"></label></div><p id="resetMaterialsError" class="error" role="alert"></p><div class="modal-actions"><button type="button" id="cancelReset" class="secondary">ยกเลิก</button><button class="danger">ยืนยันลบข้อมูล</button></div></form>';
  d.querySelector('#cancelReset').onclick=()=>d.close();d.querySelector('form').onsubmit=async event=>{event.preventDefault();const form=event.target,fields=new FormData(form),buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);d.oncancel=e=>e.preventDefault();try{const {error}=await db.resetMaterials({confirmation:fields.get('confirmation'),password:fields.get('password')});if(error)throw Error(error.message);location.reload()}catch(e){d.querySelector('#resetMaterialsError').textContent=e.message;buttons.forEach(b=>b.disabled=false)}finally{form.elements.password.value='';d.oncancel=null}};d.showModal();
 };
}
