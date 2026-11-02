import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSettingsCsv,settingsCsvCategories} from '../src/settings-csv.js';
import {csv} from '../src/domain.js';
test('Settings CSV supports all categories, Thai quoted names and skips existing or repeated names',()=>{
 const input=csv([['ประเภท','ชื่อ'],...Object.values(settingsCsvCategories).map(label=>[label,'ชื่อ, "ทดสอบ"']),['units','ชิ้น'],['หน่วยนับ','ชิ้น']]);
 const result=parseSettingsCsv(input,[{category:'units',name:'ชิ้น',active:false}]);assert.equal(result.records.length,6);assert.equal(result.skipped,2);assert.equal(result.records[0].name,'ชื่อ, "ทดสอบ"');assert.ok(result.records.every(r=>r.active));
});
test('Settings CSV rejects invalid headers, types, blank names, long names and incomplete quotes',()=>{
 for(const text of ['ชื่อ\nA','ประเภท,ชื่อ\nผิด,A','ประเภท,ชื่อ\nหน่วยนับ,','ประเภท,ชื่อ\nหน่วยนับ,'+'A'.repeat(201),'ประเภท,ชื่อ\nหน่วยนับ,"abc'])assert.throws(()=>parseSettingsCsv(text));
});
