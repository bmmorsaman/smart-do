export function nextMaterialNumber(records,previous=0){
 return records.reduce((max,r)=>{const match=/^MAT-?(\d+)$/i.exec(r.code||'');return match?Math.max(max,Number(match[1])):max},previous)+1;
}
export const materialCode=number=>'MAT-'+String(number).padStart(3,'0');
