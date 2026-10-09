import {randomUUID} from 'node:crypto';
import {database,createIndexes} from '../server/mongo.js';
import {account,hashPassword} from '../server/security.js';
try{process.loadEnvFile('.env.local')}catch(error){if(error.code!=='ENOENT')throw error}
const a=account({email:process.env.INITIAL_ADMIN_EMAIL,password:process.env.INITIAL_ADMIN_PASSWORD,full_name:process.env.INITIAL_ADMIN_NAME||'ผู้ดูแลระบบ',role:'admin'});
const {db,client}=await database();
try{
 await createIndexes(db);
 if(await db.collection('users').countDocuments())throw Error('มีผู้ใช้อยู่แล้ว จะไม่สร้าง Admin ซ้ำ');
 const id=randomUUID();await db.collection('users').insertOne({_id:id,id,email:a.email,full_name:a.full_name,role:'admin',active:true,...await hashPassword(a.password)});
 console.log('สร้าง indexes และ Admin สำเร็จ กรุณานำ INITIAL_ADMIN_PASSWORD ออกจากไฟล์ตั้งค่า');
}finally{await client.close()}
