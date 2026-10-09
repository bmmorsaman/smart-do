export const defaultOrganization={name:'โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านโดนเอาว์',address:'ตำบลรุง อำเภอกันทรลักษ์ จังหวัดศรีสะเกษ'};
let value={...defaultOrganization};
export const organization=()=>({...value});
export function setOrganization(next){value={...defaultOrganization,...next}}
