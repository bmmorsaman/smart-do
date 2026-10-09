import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHandler} from '../supabase/functions/manage-users/handler.js';
function mock(role='admin',updateError=false){
 const calls=[];
 const client={auth:{getUser:async token=>token==='valid'?{data:{user:{id:'admin-id',email:'admin@example.com'}}}:{error:true,data:{}},admin:{createUser:async data=>{calls.push(['create',data]);return {data:{user:{id:'new-id'}}}},deleteUser:async id=>{calls.push(['delete',id]);return {}}}},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role}})})}),update:data=>({eq:()=>({select:()=>({single:async()=>{calls.push(['profile',data]);return updateError?{error:true}:{data:{id:'new-id'}}}})})})})};
 return {handler:makeHandler(client),calls};
}
const input={action:'create',email:'staff@example.com',password:'test-password-123',full_name:'เจ้าหน้าที่',role:'officer'};
const request=(body=input,token='valid')=>new Request('http://localhost/manage-users',{method:'POST',headers:token?{authorization:'Bearer '+token}:{},body:JSON.stringify(body)});
test('User management rejects anonymous, invalid sessions and non-admin roles before writes',async()=>{
 for(const [role,token,status] of [['admin','',401],['admin','invalid',401],['officer','valid',403],['viewer','valid',403]]){const m=mock(role);assert.equal((await m.handler(request(input,token))).status,status);assert.equal(m.calls.length,0)}
});
test('Admin creates Auth account and trusted profile without returning password',async()=>{
 const m=mock(),response=await m.handler(request());assert.equal(response.status,201);const body=await response.text();assert.ok(!body.includes(input.password));assert.deepEqual(m.calls.map(c=>c[0]),['create','profile']);assert.equal(m.calls[1][1].role,'officer');
});
test('Invalid account data is rejected before creating Auth users',async()=>{
 for(const override of [{email:'invalid'},{password:'123'},{role:'owner'},{full_name:''}]){const m=mock();assert.equal((await m.handler(request({...input,...override}))).status,400);assert.equal(m.calls.length,0)}
});
test('Failed profile provisioning removes partially created Auth account',async()=>{
 const m=mock('admin',true);assert.equal((await m.handler(request())).status,500);assert.deepEqual(m.calls.at(-1),['delete','new-id']);
});
