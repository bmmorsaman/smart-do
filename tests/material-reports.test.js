import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeMaterial,countDifference,chronologicalMovements} from '../src/material-calculations.js';
const record={data:{quantity:7}};
const entries=[{id:1,created_at:'2026-10-01T06:00:00Z',delta:10,balance:10,unit_price:5},{id:2,created_at:'2026-10-03T06:00:00Z',delta:-3,balance:7,unit_price:5}];
test('Period reports reconcile opening, receipts, issues and closing',()=>{
 assert.deepEqual(summarizeMaterial(record,entries,'2026-10-02','2026-10-04'),{opening:10,received:0,issued:3,closing:7,receivedValue:0,issuedValue:15,unpriced:0});
 assert.equal(summarizeMaterial(record,entries,'2026-09-01','2026-09-30').closing,0);
 assert.throws(()=>summarizeMaterial(record,entries,'2026-10-04','2026-10-02'));
});
test('Unpriced legacy movements are reported instead of inventing prices',()=>{
 assert.equal(summarizeMaterial(record,[{...entries[0],unit_price:null}],'2026-10-01','2026-10-07').unpriced,1);
});
test('Count differences use the saved ledger snapshot, including a zero count',()=>{
 assert.equal(countDifference({data:{quantity:20,count_book_quantity:7,counted_quantity:0}}),-7);
 assert.equal(countDifference({data:{quantity:20,counted_quantity:null}}),null);
});
test('Reports use effective movement dates and recalculate balances after backdating',()=>{
 const r={data:{quantity:13}},history=[
  {id:1,delta:10,balance:10,movement_date:'2026-10-07',created_at:'2026-10-07T06:00:00Z',unit_price:5},
  {id:2,delta:5,balance:15,movement_date:'2026-10-06',created_at:'2026-10-07T06:01:00Z',unit_price:5},
  {id:3,delta:-2,balance:13,movement_date:'2026-10-06',created_at:'2026-10-07T06:02:00Z',unit_price:5}
 ];
 assert.deepEqual(chronologicalMovements(r,history).map(e=>e.balance),[5,3,13]);
 const yesterday=summarizeMaterial(r,history,'2026-10-06','2026-10-06');assert.equal(yesterday.opening,0);assert.equal(yesterday.received,5);assert.equal(yesterday.issued,2);assert.equal(yesterday.closing,3);
 const today=summarizeMaterial(r,history,'2026-10-07','2026-10-07');assert.equal(today.opening,3);assert.equal(today.received,10);assert.equal(today.closing,13);
});
