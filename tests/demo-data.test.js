import test from 'node:test';
import assert from 'node:assert/strict';
import {demoRecords,demoMovements,demoSettings} from '../src/demo-data.js';
import {countDifference} from '../src/material-calculations.js';
test('Complete demo reconciles all movement balances and covers material scenarios',()=>{
 const now=new Date(2026,9,7,9),records=demoRecords(now),movements=demoMovements(now),settings=demoSettings();
 assert.equal(records.length,16);assert.equal(new Set(records.map(r=>r.code)).size,16);
 for(const r of records){let balance=0;for(const e of movements.filter(e=>e.code===r.code)){balance+=e.delta;assert.ok(balance>=0);assert.ok(new Date(e.created_at)<=now);assert.ok(e.delta>0?!e.recipient:settings.recipients.includes(e.recipient));if(e.delta<0)assert.ok(settings.custodians.includes(e.sender))}assert.equal(balance,r.data.quantity);assert.ok(settings.groups.includes(r.data.group));assert.ok(settings.units.includes(r.data.unit))}
 assert.deepEqual([...new Set(records.map(r=>r.data.group))].sort(),[...settings.groups].sort());
 assert.deepEqual([...new Set(records.map(r=>r.data.unit))].sort(),[...settings.units].sort());
 assert.deepEqual([...new Set(movements.map(e=>e.sender))].sort(),[...settings.custodians].sort());
 assert.deepEqual([...new Set(movements.map(e=>e.recipient).filter(Boolean))].sort(),[...settings.recipients].sort());
 assert.deepEqual([...new Set(records.map(r=>r.data.location))].sort(),[...settings.locations].sort());
 assert.deepEqual([...new Set(movements.map(e=>e.party).filter(Boolean))].sort(),[...settings.sources].sort());
 assert.ok(movements.every(e=>e.document_no));assert.equal(new Set(movements.map(e=>e.document_no)).size,movements.length);
 assert.ok(movements.filter(e=>e.code==='MAT-001').length>6);
 assert.ok(movements.some(e=>e.unit_price!==undefined&&e.unit_price!==records.find(r=>r.code===e.code).amount));
 assert.ok(records.every(r=>r.data.counted_quantity===undefined));
 assert.ok(records.some(r=>r.data.quantity===0));assert.ok(records.some(r=>r.amount===0));assert.ok(movements.some(e=>e.unpriced));assert.ok(movements.some(e=>!Number.isInteger(e.delta)));
 assert.ok(records.some(r=>!movements.some(e=>e.code===r.code)));
});
test('Demo movement timestamps remain valid on month and year boundaries',()=>{
 for(const now of [new Date(2026,0,1),new Date(2026,9,1),new Date(2026,11,31)]){const movements=demoMovements(now);assert.ok(movements.every(e=>new Date(e.created_at)<=now));assert.ok(movements.some(e=>new Date(e.created_at).getMonth()!==now.getMonth()))}
});
