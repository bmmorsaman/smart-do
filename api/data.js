import {database,repository} from '../server/mongo.js';
import {createService} from '../server/service.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
 try{
  let input=req.body;if(typeof input==='string')input=JSON.parse(input);if(Buffer.byteLength(JSON.stringify(input||{}))>750000)return res.status(413).json({ok:false,error:'ข้อมูลยาวเกินกำหนด'});
  const {db,client}=await database(),bearer=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  const data=await createService(repository(db,client))(input,bearer);return res.status(200).json({ok:true,data});
 }catch(error){const status=error.status|| (error.code===11000?409:500);return res.status(status).json({ok:false,error:error.status?error.message:error.code===11000?'ข้อมูลซ้ำ กรุณาตรวจรายการ':'บริการฐานข้อมูลไม่พร้อม กรุณาตรวจการตั้งค่าเซิร์ฟเวอร์'})}
}
