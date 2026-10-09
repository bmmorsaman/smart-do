import {defineConfig,loadEnv} from 'vite';
import handler from './api/data.js';
export default defineConfig(({mode})=>{
 Object.assign(process.env,Object.fromEntries(Object.entries(loadEnv(mode,process.cwd(),'')).filter(([key])=>key.startsWith('MONGODB_'))));
 return {plugins:[{name:'materials-api',configureServer(server){server.middlewares.use('/api/data',async(req,res)=>{try{let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>750000){res.statusCode=413;res.end(JSON.stringify({ok:false,error:'ข้อมูลยาวเกินกำหนด'}));return}}req.body=body;res.status=code=>{res.statusCode=code;return res};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value))};await handler(req,res)}catch{res.statusCode=400;res.end(JSON.stringify({ok:false,error:'คำขอไม่ถูกต้อง'}))}})}}]};
});
