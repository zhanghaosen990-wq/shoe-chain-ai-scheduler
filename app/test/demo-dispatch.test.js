const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runAgent,data}=require('../agent');
const {recommendFactories,overlap}=require('../recommendations');
const factory=(id,cap,processes,categories=['女装'])=>({id,name:id,categories,process_capabilities:processes,min_order_quantity:100,available_capacity_by_day:[cap],material_status:{面料:'充足'},on_time_rate:.96});
const order={category:'女装',quantity:500,deadline_days:10,splittable:true,required_processes:['裁剪','精细缝制','包边','整烫']};
test('zero capacity factories are not recommended even for an exact match',async()=>{
 const r=await recommendFactories(order,[factory('full',0,order.required_processes),factory('available',400,['立体裁剪','平缝','整烫定型'])],{});
 assert.deepEqual(r.candidates.map(c=>c.factory_id),['available']);
});
test('related craft matching recognizes cutting, sewing and pressing without declaring them confirmed',async()=>{
 assert.equal(overlap('裁断','立体裁剪'),true);
 assert.equal(overlap('精细缝纫','无骨缝制'),true);
 assert.equal(overlap('立体裁断','激光裁剪'),true);
 const r=await recommendFactories(order,[factory('A',400,['立体裁剪','平缝','整烫定型'])],{});
 assert.deepEqual(r.candidates[0].confirmed_processes,[]);
 assert.ok(r.candidates[0].unconfirmed_processes.includes('精细缝制'));
});
test('actual dress demo language yields a positive multi-factory plan, excluding the full exact-match factory',async()=>{
 const original=data.factories;
 data.factories=[factory('full',0,order.required_processes),factory('A',600,['立体裁剪','平缝','整烫定型']),factory('B',400,['裁断','包边','缝纫']),factory('shoes',900,['鞋面车缝'],['运动鞋'])];
 try{
  const r=await runAgent(order,{});
  assert.equal(r.plan.status,'recommended');
  assert.equal(r.plan.allocations.length,2,'allowing split prioritizes a feasible multi-factory proposal');
  assert.deepEqual(new Set(r.plan.allocations.map(a=>a.factory_id)),new Set(['A','B']));
  assert.equal(r.plan.allocations.reduce((n,a)=>n+a.quantity,0),500);
  assert.equal(r.plan.requires_confirmation,true);
  assert.ok(r.dashboard.risks.some(x=>/工艺.*确认/.test(x)));
  assert.equal(r.candidates.some(c=>['full','shoes'].includes(c.factory_id)),false);
  const unsplit=await runAgent({...order,splittable:false},{});
  assert.equal(unsplit.plan.allocations.length,1);assert.equal(unsplit.plan.allocations[0].quantity,500);
 }finally{data.factories=original;}
});
test('related craft planning still cannot exceed known capacity or violate MOQ',async()=>{
 const original=data.factories;data.factories=[factory('A',200,['立体裁剪']),factory('B',200,['缝纫'])];
 try{const r=await runAgent(order,{});assert.equal(r.plan.status,'human_review');assert.deepEqual(r.plan.allocations,[]);}finally{data.factories=original;}
});
test('incomplete profiles stay excluded even if they claim capacity or AI selects them',async()=>{
 const r=await recommendFactories(order,[factory('blank',1000,[],[]),factory('empty-text',1000,[' '],['女装']),factory('ok',500,['裁剪'])],{apiKey:'test',fetcher:async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"candidates":[{"factory_id":"blank","reason":"相关"}]}'}}]})})});
 assert.deepEqual(r.candidates.map(c=>c.factory_id),['ok']);
});
test('unfamiliar apparel wording and line-separated crafts use related capabilities',async()=>{
 const {toAgentOrder}=require('../payload');
 const incoming=toAgentOrder({bom_data:{sku_code:'NEW',craftsmanship:'立体裁断\n精细缝纫\n熨烫'},planning_context:{category:'女装',quantity:500,deadline_days:10,splittable:true}});
 assert.equal(incoming.required_processes.length,3);
 const original=data.factories;data.factories=[factory('A',350,['立体裁剪','平缝']),factory('B',300,['缝制','整烫'])];
 try{const r=await runAgent(incoming,{});assert.equal(r.plan.allocations.length,2);assert.equal(r.plan.requires_confirmation,true);}finally{data.factories=original;}
});
test('unknown category infers apparel domain from BOM style and never auto-assigns generic sewing to shoe factories',async()=>{
 const original=data.factories;
 data.factories=[factory('shoes-A',400,['裁剪','缝纫'],['运动鞋']),factory('shoes-B',400,['裁剪','缝纫'],['商务男鞋']),factory('apparel-A',300,['裁剪','缝纫']),factory('apparel-B',300,['裁剪','缝纫'])];
 try{
  const r=await runAgent({...order,category:'其他/待确认',bom_data:{style_name:'男士衬衫'},required_processes:['裁剪','缝纫']},{});
  assert.deepEqual(new Set(r.plan.allocations.map(a=>a.factory_id)),new Set(['apparel-A','apparel-B']));
  assert.equal(r.candidates.some(c=>c.factory_id.startsWith('shoes')),false);
  const unknown=await runAgent({...order,category:'待确认',required_processes:['裁剪','缝纫']},{});
  assert.equal(unknown.plan.status,'human_review','generic processes alone cannot establish an unknown industry');
 }finally{data.factories=original;}
});
test('semantic evidence supports new related style labels without claiming confirmed capability',async()=>{
 const original=data.factories;data.factories=[factory('A',350,['立体裁剪']),factory('B',350,['缝纫'])];
 try{
  const r=await runAgent({...order,category:'全新系列',required_processes:['特殊拼接造型']},{apiKey:'test',fetcher:async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"candidates":[{"factory_id":"A","reason":"可能适用"},{"factory_id":"B","reason":"可能适用"}]}'}}]})})});
  assert.equal(r.plan.allocations.length,2);assert.equal(r.plan.requires_confirmation,true);assert.ok(r.candidates.every(c=>c.confirmed_processes.length===0));
 }finally{data.factories=original;}
});
