import {MongoClient} from 'mongodb';
import {AppError} from './security.js';
let connection;
export async function database(){
 if(!process.env.MONGODB_URI)throw new AppError('ยังไม่ได้ตั้งค่า MONGODB_URI บนเซิร์ฟเวอร์',503);
 if(!connection)connection=new MongoClient(process.env.MONGODB_URI,{maxPoolSize:5,serverSelectionTimeoutMS:10000}).connect().catch(error=>{connection=null;throw error});
 const client=await connection,db=client.db(process.env.MONGODB_DB||'smart_materials');
 return {client,db};
}
export function repository(db,client,session){
 const options=session?{session}:{};
 return {
  get:async(table,id)=>{const row=await db.collection(table).findOne({_id:id},options);if(!row)return null;const {_id,...value}=row;return value},
  list:async(table,filter={})=>{const rows=await db.collection(table).find(filter,options).limit(20001).toArray();if(rows.length>20000)throw new AppError('ข้อมูลมากเกินขอบเขตอ่านในครั้งเดียว กรุณาติดต่อผู้ดูแล',413);return rows.map(({_id,...row})=>row)},
  put:async(table,id,value)=>db.collection(table).replaceOne({_id:id},{...value,_id:id},{...options,upsert:true}),
  delete:async(table,id)=>db.collection(table).deleteOne({_id:id},options),
  transaction:async fn=>{const tx=client.startSession();try{return await tx.withTransaction(()=>fn(repository(db,client,tx)))}finally{await tx.endSession()}},
  rate:async key=>{const now=new Date();const row=await db.collection('login_attempts').findOneAndUpdate({_id:key},[{$set:{count:{$cond:[{$gt:['$expires',now]},{$add:[{$ifNull:['$count',0]},1]},1]},expires:{$cond:[{$gt:['$expires',now]},'$expires',new Date(Date.now()+15*60000)]}}}],{upsert:true,returnDocument:'after'});return row.count},
 };
}
export async function createIndexes(db){
 await db.collection('users').createIndex({email:1},{unique:true});
 await db.collection('records').createIndex({code:1},{unique:true});
 await db.collection('material_settings').createIndex({category:1,normalized_name:1},{unique:true});
 await db.collection('sessions').createIndex({expires:1},{expireAfterSeconds:0});
 await db.collection('login_attempts').createIndex({expires:1},{expireAfterSeconds:0});
 await db.collection('requests').createIndex({expires:1},{expireAfterSeconds:0});
 await db.collection('stock_movements').createIndex({record_id:1,movement_date:1,created_at:1});
 await db.collection('audit_log').createIndex({created_at:-1});
}
