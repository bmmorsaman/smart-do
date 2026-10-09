import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMaterialCsv,materialCsvColumns} from '../src/material-csv.js';
import {materialImportTemplate} from '../src/material-import-template.js';
const header=materialCsvColumns.join(',');
test('Downloaded template round trips with configured values and automatic material codes',()=>{
 const template=materialImportTemplate({groups:['หมวด, เฉพาะ'],units:['กล่อง'],locations:['ห้อง "หนึ่ง"']});
 assert.ok(template.startsWith('\uFEFF'));
 const [row]=parseMaterialCsv(template);assert.equal(row.code,'');assert.equal(row.data.group,'หมวด, เฉพาะ');assert.equal(row.data.unit,'กล่อง');assert.equal(row.data.location,'ห้อง "หนึ่ง"');assert.equal(row.data.quantity,0);
 assert.equal(parseMaterialCsv(template+'\r\n"","รายการสอง","หมวด, เฉพาะ","กล่อง","5","0",""').length,2);
 assert.throws(()=>materialImportTemplate({groups:[],units:['ชิ้น']}),/ตั้งค่า/);
});
test('Material CSV parses quoted names and creates zero-balance materials',()=>{
 const rows=parseMaterialCsv('\uFEFF'+header+'\r\nNEW-1,"แฟ้ม, เอกสาร",วัสดุสำนักงาน,ชิ้น,12.5,5,ห้องเก็บ\r\n');
 assert.equal(rows[0].title,'แฟ้ม, เอกสาร');assert.equal(rows[0].amount,12.5);assert.equal(rows[0].data.quantity,0);
});
test('Material CSV rejects invalid columns, financial values and incomplete quotes',()=>{
 assert.throws(()=>parseMaterialCsv('รหัส,ชื่อ\nA,B'));
 for(const value of ['Infinity','NaN','-1'])assert.throws(()=>parseMaterialCsv(header+`\nA,วัสดุ,วัสดุสำนักงาน,ชิ้น,${value},0,ห้อง`));
 assert.throws(()=>parseMaterialCsv(header+'\nA,"ชื่อไม่ปิด,วัสดุสำนักงาน,ชิ้น,5,0,ห้อง'));
});
