const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createStore}=require('../portal-store');
const {createAuth}=require('../portal/auth');
test('existing demo installations receive new partners once without resetting edited profiles or completed orders', t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'demo-upgrade-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'state.json');
 const original={brands:[{id:'BRAND-A',role:'brand',name:'已编辑品牌'}],factories:[{id:'FAC-A',role:'factory',name:'已编辑工厂',phone:'',dailyCapacity:60}],orders:[{id:'DEMO-002',brandId:'BRAND-A',factoryId:'FAC-A',quantity:300,status:'completed'}],reviews:[]};
 fs.writeFileSync(file,JSON.stringify(original));
 const first=createStore(file).snapshot();
 assert.ok(first.factories.some(f=>f.id==='FAC-J'));
 assert.ok(first.brands.some(b=>b.id==='BRAND-F'));
 assert.equal(first.factories.find(f=>f.id==='FAC-A').name,'已编辑工厂');
 assert.equal(first.factories.find(f=>f.id==='FAC-A').phone,'');
 assert.equal(first.orders.find(o=>o.id==='DEMO-002').status,'completed');
 const active=first.orders.find(o=>o.factoryId==='FAC-D'&&o.status==='production');
 assert.ok(active);
 createStore(file).transition('FAC-D',active.id,'completed');
 const second=createStore(file).snapshot();
 assert.equal(second.orders.length,first.orders.length);
 assert.equal(second.orders.find(o=>o.id===active.id).status,'completed');
});
test('every demo partner has a working account and valid production demands',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'demo-accounts-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const s=createStore(path.join(dir,'state.json')).snapshot();
 const values=new Map(),auth=createAuth({getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)});
 await auth.initialize();
 for(const [prefix,count,role] of [['factory',10,'factory'],['brand',6,'brand']])for(let i=1;i<=count;i++){
  const user=await auth.login(`${prefix}_${String(i).padStart(2,'0')}`,'123456');
  assert.equal(user.role,role);assert.ok([...s.factories,...s.brands].some(p=>p.id===user.id));
 }
 for(const o of s.orders.filter(o=>o.id.startsWith('SHOWCASE-'))){
  assert.deepEqual(require('../order-contract').normalizeDemand(o.demand),o.demand);
  assert.equal(o.quantity,o.demand.planning_context.quantity);
  assert.ok(s.factories.some(f=>f.id===o.factoryId));assert.ok(s.brands.some(b=>b.id===o.brandId));
 }
});
