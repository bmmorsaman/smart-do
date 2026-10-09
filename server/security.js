import {scrypt as derive,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(derive);
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const token=()=>randomBytes(32).toString('base64url');
export async function hashPassword(password){const salt=randomBytes(16).toString('hex');const hash=await scrypt(password,salt,64);return {salt,password_hash:hash.toString('hex')}}
export async function verifyPassword(password,user){const actual=await scrypt(password,user.salt,64),expected=Buffer.from(user.password_hash,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected)}
export class AppError extends Error{constructor(message,status=400){super(message);this.status=status}}
export const requireText=(value,max,required=true)=>{if(typeof value!=='string'||value.trim().length>max||required&&!value.trim())throw new AppError('ข้อมูลข้อความไม่ถูกต้อง');return value.trim()};
export const publicUser=u=>({id:u.id,email:u.email,full_name:u.full_name,role:u.role});
export function account(input){const email=requireText(input.email,254).toLowerCase(),full_name=requireText(input.full_name,200),password=input.password,role=input.role;if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||typeof password!=='string'||password.length<8||password.length>128||!['admin','officer','viewer'].includes(role))throw new AppError('ตรวจอีเมล ชื่อ สิทธิ์ และรหัสผ่านอย่างน้อย 8 ตัวอักษร');return {email,full_name,password,role}}
