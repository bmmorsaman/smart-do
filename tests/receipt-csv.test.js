import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReceiptCsv,receiptColumns} from '../src/receipt-csv.js';
import {csv} from '../src/domain.js';
const records=[{id:'1',code:'MAT-001',amount:15,data:{unit:'ชิ้น'}}],options={custodians:['ผู้ควบคุม'],sources:['บริษัท, ก'],today:'2026-11-02'};
const row=['MAT-001','2026-11-01',3,'DOC-1','บริษัท, ก','ผู้ควบคุม'];
test('Receipt CSV accepts multiple rows and quoted sources with dated receipt details',()=>{
 const parsed=parseReceiptCsv(csv([receiptColumns,row,[...row.slice(0,2),2,...row.slice(3)]]),records,options);
 assert.equal(parsed.length,2);assert.equal(parsed[0].record.id,'1');assert.equal(parsed[0].quantity,3);assert.equal(parsed[0].details.party,'บริษัท, ก');assert.equal(parsed[1].quantity,2);
});
test('Receipt CSV rejects unknown material, invalid dates, nonpositive quantity and invalid settings',()=>{
 for(const [index,value] of [[0,'MISSING'],[1,'2026-11-03'],[1,'2026-02-30'],[2,0],[2,-1],[2,'Infinity'],[5,'unknown'],[4,'unknown']]){const r=[...row];r[index]=value;assert.throws(()=>parseReceiptCsv(csv([receiptColumns,r]),records,options),/แถว 2/)}
});
