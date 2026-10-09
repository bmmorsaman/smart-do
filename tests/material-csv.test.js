import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMaterialCsv,materialCsvColumns} from '../src/material-csv.js';
const header=materialCsvColumns.join(',');
test('Material CSV parses quoted names and creates zero-balance materials',()=>{
 const rows=parseMaterialCsv('\uFEFF'+header+'\r\nNEW-1,"แฟ้ม, เอกสาร",วัสดุสำนักงาน,ชิ้น,12.5,5,ห้องเก็บ\r\n');
 assert.equal(rows[0].title,'แฟ้ม, เอกสาร');assert.equal(rows[0].amount,12.5);assert.equal(rows[0].data.quantity,0);
});
test('Material CSV rejects invalid columns, financial values and incomplete quotes',()=>{
 assert.throws(()=>parseMaterialCsv('รหัส,ชื่อ\nA,B'));
 for(const value of ['Infinity','NaN','-1'])assert.throws(()=>parseMaterialCsv(header+`\nA,วัสดุ,วัสดุสำนักงาน,ชิ้น,${value},0,ห้อง`));
 assert.throws(()=>parseMaterialCsv(header+'\nA,"ชื่อไม่ปิด,วัสดุสำนักงาน,ชิ้น,5,0,ห้อง'));
});
