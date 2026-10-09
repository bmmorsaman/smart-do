const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
export function makeHandler(client){return async request=>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply(405,{error:'Method not allowed'});
 try{
  const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];if(!token)return reply(401,{error:'กรุณาเข้าสู่ระบบ'});
  const identity=await client.auth.getUser(token);if(identity.error||!identity.data.user?.email)return reply(401,{error:'กรุณาเข้าสู่ระบบด้วยอีเมล'});
  const profile=await client.from('profiles').select('role').eq('id',identity.data.user.id).single();
  if(profile.error||profile.data?.role!=='admin')return reply(403,{error:'ใช้ได้เฉพาะ Admin'});
  const text=await request.text();if(text.length>4096)return reply(413,{error:'ข้อมูลยาวเกินกำหนด'});
  let input;try{input=JSON.parse(text)}catch{return reply(400,{error:'ข้อมูลไม่ถูกต้อง'})}
  if(!input||typeof input!=='object')return reply(400,{error:'ข้อมูลไม่ถูกต้อง'});
  if(input.action==='list'){
   const profiles=await client.from('profiles').select('id,role,full_name');if(profiles.error)return reply(500,{error:'อ่านข้อมูลผู้ใช้ไม่ได้'});
   const users=[];for(let page=1;;page++){const result=await client.auth.admin.listUsers({page,perPage:100});if(result.error)return reply(500,{error:'อ่านบัญชีผู้ใช้ไม่ได้'});users.push(...result.data.users);if(result.data.users.length<100)break}
   return reply(200,{users:users.map(u=>({id:u.id,email:u.email||'',...Object.fromEntries(['role','full_name'].map(k=>[k,profiles.data.find(p=>p.id===u.id)?.[k]||'']))}))});
  }
  if(input.action!=='create')return reply(400,{error:'คำสั่งไม่ถูกต้อง'});
  const email=typeof input.email==='string'?input.email.trim().toLowerCase():'',name=typeof input.full_name==='string'?input.full_name.trim():'';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!name||name.length>200||typeof input.password!=='string'||input.password.length<8||input.password.length>128||!['admin','officer','viewer'].includes(input.role))return reply(400,{error:'ตรวจอีเมล ชื่อ สิทธิ์ และรหัสผ่านอย่างน้อย 8 ตัวอักษร'});
  const result=await client.auth.admin.createUser({email,password:input.password,email_confirm:true,user_metadata:{full_name:name}});
  if(result.error)return reply(400,{error:'เพิ่มบัญชีไม่ได้ ตรวจอีเมลซ้ำและข้อกำหนดรหัสผ่าน'});
  const updated=await client.from('profiles').update({full_name:name,role:input.role}).eq('id',result.data.user.id).select('id').single();
  if(updated.error){await client.auth.admin.deleteUser(result.data.user.id);return reply(500,{error:'กำหนดสิทธิ์ไม่สำเร็จ กรุณาลองใหม่'})}
  return reply(201,{user:{id:result.data.user.id,email,full_name:name,role:input.role}});
 }catch{return reply(500,{error:'จัดการบัญชีไม่สำเร็จ กรุณาลองใหม่'})}
}}
