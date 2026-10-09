import test from 'node:test';import assert from 'node:assert/strict';import {fiscalYear,depreciation,csv} from '../src/domain.js';
test('Thai fiscal year changes on October 1',()=>{assert.equal(fiscalYear(new Date(2026,8,30)),2569);assert.equal(fiscalYear(new Date(2026,9,1)),2570)});
test('Depreciation clamps to residual and handles not-yet-acquired assets',()=>{assert.equal(depreciation(10001,1,5,'2020-01-01','2030-01-01').net,1);assert.equal(depreciation(10001,1,5,'2030-01-01','2026-01-01').accumulated,0);assert.equal(depreciation(10001,1,5,'2025-01-01','2026-01-01').accumulated,2000)});
test('Invalid depreciation is rejected',()=>assert.throws(()=>depreciation(100,200,5,'2025-01-01','2026-01-01')));
test('Depreciation rejects non-finite settings and missing dates',()=>{
 for(const settings of [[100,NaN,5],[100,1,NaN],[100,1,Infinity],[100,-1,5],[100,1,0]])assert.throws(()=>depreciation(...settings,'2025-01-01','2026-01-01'));
 for(const date of [null,undefined,'','invalid']){
  assert.throws(()=>depreciation(100,1,5,date,'2026-01-01'));
  assert.throws(()=>depreciation(100,1,5,'2025-01-01',date));
 }
});
test('CSV escapes quotes and neutralizes spreadsheet formulas',()=>{assert.equal(csv([['=1+1','a"b']]),'\uFEFF"\'=1+1","a""b"')});
test('CSV neutralizes formulas hidden behind whitespace',()=>{
 for(const value of [' =1+1','\t=1+1','\r@SUM(1)','\n+1','  -1'])assert.equal(csv([[value]]),'\uFEFF"\''+value+'"');
 assert.equal(csv([['ข้อความ',125,null]]),'\uFEFF"ข้อความ","125",""');
});
