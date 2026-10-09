import test from 'node:test';
import assert from 'node:assert/strict';
import {correctLedger} from '../src/movement-corrections.js';
test('Corrections retain opening stock, historical price, actor and recalculate every balance',()=>{
 const record={data:{quantity:12}},entries=[{id:1,delta:10,balance:15,movement_date:'2026-10-01',created_at:'2026-10-01T10:00:00Z',unit_price:125,actor:'เดิม'},{id:2,delta:-3,balance:12,movement_date:'2026-10-02',created_at:'2026-10-02T10:00:00Z',unit_price:125}];
 const result=correctLedger(record,structuredClone(entries),1,{quantity:8,movement_date:'2026-10-01',sender:'ผู้ควบคุม',party:'บริษัท',document_no:'DOC'},'ผู้แก้','2026-10-09');
 assert.equal(result.record.data.quantity,10);assert.deepEqual(result.entries.map(e=>e.balance),[13,10]);assert.equal(result.replacement.actor,'เดิม');assert.equal(result.replacement.unit_price,125);assert.equal(result.previous.delta,10);
 const deleted=correctLedger(record,structuredClone(entries),2,null,'ผู้ลบ','2026-10-09');assert.equal(deleted.record.data.quantity,15);
 assert.throws(()=>correctLedger({data:{quantity:7}},structuredClone(entries),1,{quantity:1,movement_date:'2026-10-03',sender:'ผู้ควบคุม'},'ผู้แก้','2026-10-09'),/ติดลบ/);
});
