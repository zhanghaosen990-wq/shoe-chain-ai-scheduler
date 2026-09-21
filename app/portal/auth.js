const USERS='shoe-users-v1', SESSION='shoe-session-v1';
const seeds=[['BRAND-A','brand_01','迈斯特时尚服饰','brand'],['BRAND-B','brand_02','云端鞋履设计室','brand'],['FAC-A','factory_01','瓯越精工鞋业有限公司','factory'],['FAC-B','factory_02','楠江鞋业制造有限公司','factory']];
const publicUser=({passwordHash,salt,...user})=>user;
async function hash(password,salt){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salt+':'+password));return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');}
function createAuth(storage){
 const read=()=>JSON.parse(storage.getItem(USERS)||'[]');
 const save=users=>storage.setItem(USERS,JSON.stringify(users));
 const current=()=>{const user=read().find(u=>u.id===storage.getItem(SESSION));return user?publicUser(user):null;};
 async function initialize(){
  for(const [id,username,name,role] of seeds){
   if(read().some(u=>u.username===username))continue;
   const salt=crypto.randomUUID(),passwordHash=await hash('123456',salt);
   const users=read();if(!users.some(u=>u.username===username))save([...users,{id,username,name,role,salt,passwordHash,contactName:'',phone:'',description:'',categories:[]}]);
  }
 }
 async function register(input){
  const username=input.username.trim(),name=input.name.trim();
  if(!['brand','factory'].includes(input.role))throw Error('请选择注册身份');
  if(!/^[a-zA-Z0-9_]{3,32}$/.test(username))throw Error('账号须为 3–32 位字母、数字或下划线');
  if(input.password.length<6||input.password.length>72)throw Error('密码须为 6–72 位');
  if(!name||name.length>80)throw Error('请填写 1–80 字企业名称');
  const salt=crypto.randomUUID(),passwordHash=await hash(input.password,salt);
  const users=read();if(users.some(u=>u.username.toLowerCase()===username.toLowerCase()))throw Error('该账号已注册，请直接登录');
  const user={id:crypto.randomUUID(),profileReady:true,username,name,role:input.role,salt,passwordHash,contactName:'',phone:'',description:'',categories:[]};
  save([...users,user]);storage.setItem(SESSION,user.id);return publicUser(user);
 }
 async function login(username,password){
  const user=read().find(u=>u.username.toLowerCase()===username.trim().toLowerCase());
  if(!user||await hash(password,user.salt)!==user.passwordHash)throw Error('账号或密码不正确');
  storage.setItem(SESSION,user.id);return publicUser(user);
 }
 function validateProfile(input){
  const name=String(input.name||'').trim(),phone=String(input.phone||'').trim(),contactName=String(input.contactName||'').trim(),description=String(input.description||'').trim();
  if(!name||name.length>80)throw Error('请填写 1–80 字企业名称');
  if(phone&&!/^[+\d][\d\s()-]{5,24}$/.test(phone))throw Error('请填写有效的联系电话');
  if(contactName.length>40||description.length>600)throw Error('联系人最多 40 字，优势说明最多 600 字');
  const categories=[...new Set((input.categories||[]).map(c=>c.trim()).filter(Boolean))];
  if(categories.length>30||categories.some(c=>c.length>40))throw Error('主营品类最多 30 项，每项最多 40 字');
  return {name,phone,contactName,description,categories};
 }
 function updateProfile(input){const user=current();if(!user)throw Error('请先登录账号');const profile=validateProfile(input);save(read().map(u=>u.id===user.id?{...u,...profile,profileReady:true}:u));return current();}
 return {initialize,current,register,login,updateProfile,validateProfile,logout:()=>storage.removeItem(SESSION),profiles:()=>read().map(publicUser)};
}
module.exports={createAuth};
