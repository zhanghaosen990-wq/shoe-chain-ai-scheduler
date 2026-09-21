const {test}=require('node:test');const assert=require('node:assert/strict');
const {recommendFactories}=require('../recommendations');
const factories=[{id:'shoe',name:'鞋厂',categories:['休闲板鞋'],process_capabilities:['鞋面车缝','橡胶大底成型'],min_order_quantity:300,dailyCapacity:20,material_status:{}},{id:'dress',name:'礼服厂',categories:['女式晚礼服'],process_capabilities:['精细缝制'],min_order_quantity:50,dailyCapacity:100}];
const order={category:'运动鞋',quantity:100,deadline_days:10,required_processes:['网布鞋面缝制','橡胶大底'],bom_data:{style_name:'通勤运动鞋'}};
test('partial footwear matches are candidates despite MOQ and capacity risks; cross-industry excluded',async()=>{
 const result=await recommendFactories(order,factories,{});
 assert.deepEqual(result.candidates.map(c=>c.factory_id),['shoe']);assert.ok(result.candidates[0].unconfirmed_processes.includes('网布鞋面缝制'));assert.ok(result.candidates[0].risks.some(x=>x.includes('起订')));assert.equal(result.mode,'rules');
});
test('model semantic recommendation cannot invent factories or upgrade unverified capabilities',async()=>{
 const fetcher=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({candidates:[{factory_id:'fake',reason:'虚构'},{factory_id:'dress',reason:'不相关'},{factory_id:'shoe',reason:'相关工艺可能适用'}]})}}]})});
 const r=await recommendFactories(order,factories,{apiKey:'test',fetcher});assert.deepEqual(r.candidates.map(c=>c.factory_id),['shoe']);assert.deepEqual(r.candidates[0].confirmed_processes,[]);assert.ok(r.candidates[0].semantic_note.includes('可能'));
});
test('provider failure retains deterministic recommendations and actionable fallback',async()=>{
 const r=await recommendFactories(order,factories,{apiKey:'test',fetcher:async()=>{throw Error('offline');}});assert.equal(r.mode,'fallback');assert.equal(r.candidates[0].factory_id,'shoe');assert.ok(r.notice);
});
test('agent dashboard keeps BOM materials unverified and uses one factory snapshot',async()=>{
 const {runAgent,data}=require('../agent');const original=data.factories;
 const fixture={...factories[0],categories:['运动鞋'],process_capabilities:['网布鞋面缝制','橡胶大底'],dailyCapacity:20,min_order_quantity:1,available_capacity_by_day:Array(10).fill(20),material_status:{牛皮:'充足'},on_time_rate:.95};
 data.factories=[fixture];
 try{
  const result=await runAgent({...order,quantity:300,bom_data:{style_name:'运动鞋',fabric_details:'未知特种材料'}},{apiKey:'test',fetcher:async()=>{data.factories=[{...fixture,dailyCapacity:1000,available_capacity_by_day:Array(10).fill(1000)}];return {ok:true,json:async()=>({choices:[{message:{content:'{"candidates":[]}'}}]})};}});
  assert.notEqual(result.plan.status,'recommended');assert.equal(result.dashboard.metrics[3].value,'待工厂核验');
 }finally{data.factories=original;}
});
test('model text cannot turn invented equipment into a displayed capability',async()=>{
 const r=await recommendFactories(order,factories,{apiKey:'test',fetcher:async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({candidates:[{factory_id:'shoe',reason:'已确认拥有激光镭射设备，报价 20 元'}]})}}]})})});
 assert.doesNotMatch(JSON.stringify(r.candidates),/激光镭射|报价 20/);
});
test('optional automatic plan does not approve a quantity below MOQ',()=>{
 const {evaluatePlan}=require('../agent');const f={...factories[0],categories:['运动鞋'],process_capabilities:order.required_processes,available_capacity_by_day:Array(10).fill(100),on_time_rate:.98,material_status:{橡胶:'充足'}};
 assert.notEqual(evaluatePlan(order,[f]).status,'recommended');
});
