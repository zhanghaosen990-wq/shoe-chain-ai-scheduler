const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../portal-store');
function setup(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shoe-portal-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); const file = path.join(dir, 'state.json'); return { store: createStore(file), file }; }
test('completed-order review persists and updates only the rated factory; rejects duplicates and other accounts', t => {
 const { store, file } = setup(t);
 assert.throws(() => store.review('BRAND-B', {orderId:'DEMO-001',rating:3,comment:'评价'}));
 assert.throws(() => store.review('BRAND-A', {orderId:'DEMO-002',rating:3,comment:'评价'}));
 const next = store.review('BRAND-A', {orderId:'DEMO-001',rating:3,delivery:'on_time',quality:'good',comment:'细节整齐'});
 assert.equal(next.factories.find(f=>f.id==='FAC-A').analytics.rating,3);
 assert.equal(next.factories.find(f=>f.id==='FAC-B').analytics.rating,null);
 assert.throws(() => store.review('BRAND-A', {orderId:'DEMO-001',rating:5,comment:'重复'}));
 assert.equal(createStore(file).snapshot().reviews[0].comment,'细节整齐');
});
test('factory acceptance reserves capacity and brand completion releases it', t => {
 const { store } = setup(t);
 const next = store.createOrders('BRAND-A',{requestId:'capacity-test',title:'试单',demand:{...demand,planning_context:{...demand.planning_context,quantity:100}},allocations:[{factory_id:'FAC-A',quantity:100}]});
 const order = next.orders[0];
 assert.equal(next.factories[0].analytics.available,600);
 assert.throws(() => store.transition('FAC-B',order.id,'production'));
 assert.equal(store.transition('FAC-A',order.id,'production',{confirmRisks:true}).factories[0].analytics.available,500);
 assert.throws(() => store.transition('BRAND-B',order.id,'completed'));
 assert.equal(store.transition('BRAND-A',order.id,'completed').factories[0].analytics.available,600);
});

test('only the owning factory or brand can complete production; stale and illegal transitions do not write', t => {
 const {store,file}=setup(t);
 const created=store.createOrders('BRAND-A',submission()).orders.find(o=>o.requestId==='test-request'&&o.factoryId==='FAC-A');
 const unchanged=()=>fs.readFileSync(file,'utf8');
 let before=unchanged();
 assert.throws(()=>store.transition('FAC-A',created.id,'completed'));
 assert.equal(unchanged(),before);
 store.transition('FAC-A',created.id,'production',{confirmRisks:true});
 before=unchanged();
 for(const actor of ['FAC-B','BRAND-B','unknown',undefined])assert.throws(()=>store.transition(actor,created.id,'completed'));
 for(const status of ['pending','rejected','production','invalid'])assert.throws(()=>store.transition('FAC-A',created.id,status));
 assert.equal(unchanged(),before);
 const next=store.transition('FAC-A',created.id,'completed');
 assert.equal(next.orders.find(o=>o.id===created.id).status,'completed');
 assert.equal(next.factories.find(f=>f.id==='FAC-A').analytics.booked,0);
 assert.equal(createStore(file).snapshot().orders.find(o=>o.id===created.id).status,'completed');
 before=unchanged();
 for(const actor of ['FAC-A','BRAND-A'])assert.throws(()=>store.transition(actor,created.id,'completed'));
 for(const status of ['pending','production','rejected'])assert.throws(()=>store.transition('FAC-A',created.id,status));
 assert.equal(unchanged(),before);
 const rejected=store.snapshot().orders.find(o=>o.requestId==='test-request'&&o.factoryId==='FAC-B');
 store.transition('FAC-B',rejected.id,'rejected',{reason:'排期已满'});
 before=unchanged();assert.throws(()=>store.transition('FAC-B',rejected.id,'completed'));assert.equal(unchanged(),before);
 store.transition('BRAND-A','DEMO-002','completed');
 before=unchanged();assert.throws(()=>store.transition('FAC-B','DEMO-002','completed'));assert.equal(unchanged(),before);
});

test('automatic factory profile sync preserves server contacts; explicit edits can clear them',t=>{
 const {store,file}=setup(t);
 const profile={...store.snapshot().factories[0],contactName:'服务端联系人',phone:'13800138000'};
 store.syncProfile(profile);
 const {contactName,phone,...loginProfile}=profile;
 const synced=store.syncProfile(loginProfile).factories[0];
 assert.equal(synced.contactName,contactName);assert.equal(synced.phone,phone);
 store.syncProfile({...loginProfile,phone:''});
 const saved=createStore(file).snapshot().factories[0];
 assert.equal(saved.phone,'');assert.equal(saved.contactName,contactName);
 assert.equal(store.syncProfile({...loginProfile,contactName:''}).factories[0].contactName,'');
});
test('factory capabilities are isolated and survive restart', t => {
 const { store, file } = setup(t); const before = store.snapshot();
 const input = {...before.factories[0],dailyCapacity:123,min_order_quantity:50,categories:['女式晚礼服']};
 assert.throws(() => store.updateFactory('BRAND-A',input));
 const next = store.updateFactory('FAC-A',input);
 assert.equal(next.factories[0].analytics.available,1230);
 assert.deepEqual(next.factories[1],before.factories[1]);
 assert.equal(createStore(file).snapshot().factories[0].dailyCapacity,123);
 assert.throws(() => store.updateFactory('FAC-A',{...input, dailyCapacity:-1}));
});
test('boolean and whitespace values are not valid capacity numbers', t => {
 const {store} = setup(t); const input = store.snapshot().factories[0];
 assert.throws(() => store.updateFactory('FAC-A',{...input,dailyCapacity:true}));
 assert.throws(() => store.updateFactory('FAC-A',{...input,min_order_quantity:' '}));
});
test('capacity-only save ignores showcase and account fields, preserving the latest showcase', t => {
 const {store,file}=setup(t);const before=store.snapshot().factories[0];
 store.updateFactory('FAC-A',{section:'showcase',description:'最新介绍',images:[]});
 const next=store.updateFactory('FAC-A',{...before,section:'capacity',dailyCapacity:175,description:'过期介绍',name:'覆盖企业名'}).factories[0];
 assert.equal(next.dailyCapacity,175);assert.equal(next.description,'最新介绍');assert.equal(next.name,before.name);
 assert.equal(createStore(file).snapshot().factories[0].description,'最新介绍');
});
test('new factories can save showcase before completing required capacity fields',t=>{
 const {store,file}=setup(t);
 store.syncProfile({id:'new-showcase',role:'factory',name:'新工厂',categories:[],description:''});
 const f=store.updateFactory('new-showcase',{section:'showcase',description:'专注小单制造',images:[],dailyCapacity:999,categories:['篡改']}).factories.find(f=>f.id==='new-showcase');
 assert.equal(f.description,'专注小单制造');assert.equal(f.dailyCapacity,0);assert.deepEqual(f.categories,[]);
 assert.equal(createStore(file).snapshot().factories.find(f=>f.id==='new-showcase').description,'专注小单制造');
});
test('scoped saves reject unknown sections, incomplete sections, invalid images and non-factory actors without writes',t=>{
 const {store}=setup(t);const before=store.snapshot().factories;
 assert.throws(()=>store.updateFactory('FAC-A',{...before[0],section:'unknown'}),/分组/);
 assert.throws(()=>store.updateFactory('FAC-A',{section:'capacity',dailyCapacity:100}));
 assert.throws(()=>store.updateFactory('FAC-A',{section:'showcase',description:'缺少图片字段'}));
 assert.throws(()=>store.updateFactory('FAC-A',{section:'showcase',description:'test',images:['invalid']}));
 assert.throws(()=>store.updateFactory('BRAND-A',{section:'showcase',description:'test',images:[]}));
 assert.deepEqual(store.snapshot().factories,before);
});
test('new profiles have empty history and editable factory capability defaults',t=>{
 const {store}=setup(t);
 const next=store.syncProfile({id:'new-factory',role:'factory',name:'新工厂',contactName:'李女士',phone:'13800138000',categories:['运动鞋'],description:'精细制造'});
 const factory=next.factories.find(f=>f.id==='new-factory');
 assert.equal(factory.name,'新工厂');assert.equal(factory.analytics.rating,null);assert.equal(factory.analytics.deliveryRate,null);assert.equal(factory.analytics.available,0);
 assert.equal(next.orders.filter(o=>o.factoryId==='new-factory').length,0);
 assert.throws(()=>store.syncProfile({id:'FAC-A',role:'brand',name:'角色篡改'}));
});
const demand = {bom_data:{style_name:'运动鞋',sku_code:'SKU-NEW',craftsmanship:'鞋面车缝'},sample_images:[],planning_context:{category:'运动鞋',quantity:800,deadline_days:10,splittable:true},production_requirements:{cooperation_mode:'包工包料',special_notes:'先确认样品'}};
const submission=()=>({requestId:'test-request',title:'运动鞋',demand,allocations:[{factory_id:'FAC-A',quantity:400},{factory_id:'FAC-B',quantity:400}]});
test('split order snapshots persist and repeated submission is idempotent; invalid sums rejected',t=>{
 const {store,file}=setup(t);const input=submission();
 const first=store.createOrders('BRAND-A',input);const created=first.orders.filter(o=>o.requestId==='test-request');assert.equal(created.length,2);assert.equal(created[0].demand.bom_data.sku_code,'SKU-NEW');
 assert.equal(store.createOrders('BRAND-A',input).orders.length,first.orders.length);
 assert.equal(createStore(file).snapshot().orders[0].demand.production_requirements.special_notes,'先确认样品');
 assert.throws(()=>store.createOrders('BRAND-A',{...input,requestId:'bad-sum',allocations:[{factory_id:'FAC-A',quantity:20}]}));
 assert.throws(()=>store.createOrders('BRAND-A',{...input,requestId:'duplicates',allocations:[{factory_id:'FAC-A',quantity:400},{factory_id:'FAC-A',quantity:400}]}));
 assert.throws(()=>store.createOrders('BRAND-A',{...input,title:'changed'}));
});
test('reject requires reason and owner; only rejected quantity can be reassigned once',t=>{
 const {store}=setup(t);let next=store.createOrders('BRAND-A',submission());const a=next.orders.find(o=>o.requestId==='test-request'&&o.factoryId==='FAC-A'),b=next.orders.find(o=>o.requestId==='test-request'&&o.factoryId==='FAC-B');
 store.transition('FAC-A',a.id,'production',{confirmRisks:true});
 assert.throws(()=>store.transition('FAC-A',b.id,'rejected',{reason:'无法接单'}));assert.throws(()=>store.transition('FAC-B',b.id,'rejected',{}));
 next=store.transition('FAC-B',b.id,'rejected',{reason:'交期不足'});assert.equal(next.orders.find(o=>o.id===b.id).rejectionReason,'交期不足');
 const retry={...submission(),requestId:'reassign-request',reassignOrderId:b.id,allocations:[{factory_id:'FAC-C',quantity:400}]};
 next=store.createOrders('BRAND-A',retry);assert.equal(next.orders.find(o=>o.requestId==='reassign-request').demand.planning_context.quantity,800);assert.equal(next.orders.find(o=>o.id===a.id).status,'production');
 assert.equal(store.createOrders('BRAND-A',retry).orders.length,next.orders.length);assert.throws(()=>store.createOrders('BRAND-A',{...retry,requestId:'again'}));
});
test('acceptance with insufficient capacity requires explicit risk confirmation',t=>{
 const {store}=setup(t);const next=store.createOrders('BRAND-A',{...submission(),allocations:[{factory_id:'FAC-A',quantity:800}]});const o=next.orders[0];
 assert.throws(()=>store.transition('FAC-A',o.id,'production'));
 assert.equal(store.transition('FAC-A',o.id,'production',{confirmRisks:true}).orders[0].status,'production');
});
