export const modules = {
 materials: ['ทะเบียนวัสดุ','Package','วัสดุ']
};
export const statuses=['ร่าง','เสนออนุมัติ','อนุมัติ','ดำเนินการ','เสร็จสิ้น','ยกเลิก'];
export function fiscalYear(date=new Date()){return date.getFullYear()+543+(date.getMonth()>=9?1:0)}
export function depreciation(cost,residual,life,start,asOf){
 if(![cost,residual,life].every(Number.isFinite)||cost<0||residual<0||residual>cost||life<=0)throw Error('ข้อมูลค่าเสื่อมไม่ถูกต้อง');
 if(!start||!asOf)throw Error('วันที่ไม่ถูกต้อง');
 const a=new Date(start),b=new Date(asOf);if(isNaN(a)||isNaN(b))throw Error('วันที่ไม่ถูกต้อง');
 const days=Math.max(0,(b-a)/86400000),annual=(cost-residual)/life,accumulated=Math.min(cost-residual,annual*days/365);
 return {annual,accumulated,net:cost-accumulated,days};
}
export function csv(rows){return '\uFEFF'+rows.map(r=>r.map(v=>{let s=String(v??'');if(/^[\s\u0000-\u001f]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}).join(',')).join('\r\n')}
