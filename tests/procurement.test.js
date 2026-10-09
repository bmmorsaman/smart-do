import test from 'node:test';
import assert from 'node:assert/strict';
import {canEditField,validateChange,validateMaterial,validDate,followUps,documentRows} from '../src/procurement.js';
test('Recording permissions do not depend on historical approval status',()=>{
 for(const status of ['ร่าง','เสนออนุมัติ','อนุมัติ','ดำเนินการ','เสร็จสิ้น','ยกเลิก']){
  assert.equal(canEditField({status},'title','officer'),true);
  assert.equal(canEditField({status},'title','viewer'),false);
 }
});
test('Record identity remains protected while content may be updated',()=>{
 const old={id:'one',module:'requests',created_at:'2026-10-07',data:{}};
 assert.doesNotThrow(()=>validateChange({...old,title:'ข้อมูลเพิ่มเติม'},old));
 assert.throws(()=>validateChange({...old,id:'two'},old));
});
test('Reports omit approval status and preserve business details',()=>{
 const rows=documentRows({code:'MAT-001',module:'materials',title:'กระดาษ',amount:125,fiscal_year:2570,status:'อนุมัติ',data:{unit:'รีม'}});
 assert.ok(rows.some(([key,value])=>key==='หน่วยนับ'&&value==='รีม'));
 assert.ok(!rows.some(([key])=>key.includes('สถานะ')));
});
test('Calendar validation and dated follow-up reports remain available',()=>{
 assert.equal(validDate('2026-02-29'),false);assert.equal(validDate('2028-02-29'),true);
 const alerts=followUps([{module:'loans',status:'ดำเนินการ',data:{due:'2026-09-29'}}],'2026-10-07');
 assert.equal(alerts[0].due,'2026-10-06');
});
test('Materials require valid financial values, classification and controlled stock changes',()=>{
 const material={module:'materials',code:'MAT-NEW',title:'วัสดุ',amount:12.5,data:{group:'วัสดุสำนักงาน',unit:'ชิ้น',quantity:0,minimum:2}};
 assert.doesNotThrow(()=>validateMaterial(material));
 assert.throws(()=>validateMaterial({...material,amount:NaN}));
 assert.throws(()=>validateMaterial({...material,data:{...material.data,unit:''}}));
 assert.throws(()=>validateMaterial({...material,data:{...material.data,quantity:5}}));
 assert.throws(()=>validateMaterial({...material,data:{...material.data,quantity:2}},material));
});
