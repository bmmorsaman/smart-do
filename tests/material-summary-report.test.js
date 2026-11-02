import test from 'node:test';
import assert from 'node:assert/strict';
import {materialSummaryRow,materialSummaryHeaders} from '../src/material-summary-report.js';
test('Material report uses period balances and weighted historical prices',()=>{
 const r={code:'MAT-001',title:'Paper',amount:20,data:{quantity:12,unit:'ream'}};
 const entries=[{id:1,delta:10,unit_price:10,movement_date:'2026-10-01',created_at:'2026-10-01'},{id:2,delta:5,unit_price:16,movement_date:'2026-10-02',created_at:'2026-10-02'},{id:3,delta:-3,unit_price:12,movement_date:'2026-10-03',created_at:'2026-10-03'}];
 const row=materialSummaryRow(r,entries,'2026-10-02','2026-10-03');
 assert.equal(row.length,materialSummaryHeaders.length);
 assert.deepEqual(row,['MAT-001','Paper',20,200,5,'ream',16,80,3,'ream',12,36,240]);
 entries[1].unit_price=null;const unknown=materialSummaryRow(r,entries,'2026-10-02','2026-10-03');assert.equal(unknown[6],'');assert.equal(unknown[7],'');assert.equal(unknown[11],36);
});
