const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createAuth}=require('../portal/auth');
function storage(){const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
test('four seed accounts log in with the requested identities without overwriting edited profiles',async()=>{
 const local=storage(),auth=createAuth(local);await auth.initialize();
 for(const [username,role,name] of [['brand_01','brand','迈斯特时尚服饰'],['brand_02','brand','云端鞋履设计室'],['factory_01','factory','瓯越精工鞋业有限公司'],['factory_02','factory','楠江鞋业制造有限公司']]){const user=await auth.login(username,'123456');assert.equal(user.role,role);assert.equal(user.name,name);}
 auth.updateProfile({name:'更新企业',contactName:'王先生',phone:'13800138000',description:'优势工艺',categories:['运动鞋']});
 await auth.initialize();assert.equal(auth.current().name,'更新企业');assert.equal(createAuth(local).current().phone,'13800138000');
});
test('registration validates role, duplicate name, credentials and restores the session',async()=>{
 const local=storage(),auth=createAuth(local);await auth.initialize();assert.equal(auth.current(),null);
 await assert.rejects(auth.register({username:'new_user',password:'123456',name:'新企业',role:''}));
 await assert.rejects(auth.register({username:'brand_01',password:'123456',name:'企业',role:'brand'}));
 await assert.rejects(auth.login('brand_01','wrong'));
 const user=await auth.register({username:'new_user',password:'123456',name:'新企业',role:'factory'});
 assert.equal(user.role,'factory');assert.equal(createAuth(local).current().id,user.id);
 auth.logout();assert.equal(auth.current(),null);assert.equal((await auth.login('new_user','123456')).id,user.id);
 assert.equal(JSON.stringify(user).includes('123456'),false);
});
test('background profile completion updates its original account without replacing a newer session',async()=>{
 const auth=createAuth(storage());await auth.initialize();const first=await auth.login('brand_01','123456');const second=await auth.login('brand_02','123456');
 auth.updateProfile({name:'第一家品牌更新',categories:['商务男鞋']},first.id);
 assert.equal(auth.current().id,second.id);assert.equal(auth.current().name,second.name);
 assert.equal(auth.profiles().find(u=>u.id===first.id).name,'第一家品牌更新');
 auth.logout();auth.updateProfile({name:'后台保存完成',categories:['商务男鞋']},first.id);assert.equal(auth.current(),null);
});
test('plain HTTP crypto surface can initialize, register and log in demo accounts',async t=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'crypto');let cursor=0;
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues(bytes){for(let i=0;i<bytes.length;i++)bytes[i]=(cursor++*29+17)&255;return bytes;}}});
 t.after(()=>original?Object.defineProperty(globalThis,'crypto',original):delete globalThis.crypto);
 const local=storage(),auth=createAuth(local);await auth.initialize();
 assert.equal((await auth.login('brand_01','123456')).id,'BRAND-A');
 const registered=await auth.register({username:'http_user',password:'safe-demo-pass',name:'HTTP 演示企业',role:'brand'});
 assert.match(registered.id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 auth.logout();assert.equal((await auth.login('http_user','safe-demo-pass')).id,registered.id);
 assert.equal(local.getItem('shoe-users-v1').includes('safe-demo-pass'),false);
});
