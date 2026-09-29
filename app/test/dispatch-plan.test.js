const {test}=require('node:test');
const assert=require('node:assert/strict');
const {evaluatePlan}=require('../agent');
const order={category:'商务男鞋',quantity:800,deadline_days:10,splittable:true,required_processes:['针车']};
const factory=(id,capacity,moq=100,rate=.98)=>({id,categories:['商务男鞋'],process_capabilities:['针车'],available_capacity_by_day:[capacity],min_order_quantity:moq,on_time_rate:rate,material_status:{皮料:'充足'}});
function quantities(plan){assert.equal(plan.status,'recommended');return Object.fromEntries(plan.allocations.map(a=>[a.factory_id,a.quantity]));}
test('three factories jointly cover a quantity no pair can produce',()=>{
 assert.deepEqual(quantities(evaluatePlan(order,[factory('A',300),factory('B',300),factory('C',300)])),{A:300,B:300,C:200});
});
test('search skips a preferred factory whose MOQ makes the combination infeasible',()=>{
 assert.deepEqual(quantities(evaluatePlan(order,[factory('A',600,600,.99),factory('B',400,400,.98),factory('C',400,400,.97)])),{B:400,C:400});
});
test('an unsplittable order can use a later factory with enough capacity',()=>{
 assert.deepEqual(quantities(evaluatePlan({...order,splittable:false},[factory('A',400,300,.99),factory('B',800,300,.97)])),{B:800});
});
test('allocation reserves the last factory MOQ instead of leaving a tiny remainder',()=>{
 assert.deepEqual(quantities(evaluatePlan(order,[factory('A',600,300),factory('B',400,300)])),{A:500,B:300});
});
test('capacity, MOQ, process, materials and no-split constraints cannot be bypassed',()=>{
 for(const factories of [[factory('A',300),factory('B',300)],[factory('A',600,500),factory('B',600,500)],[{...factory('A',900),process_capabilities:['裁断']}],[{...factory('A',900),material_status:{皮料:'缺料'}}]]){
  assert.equal(evaluatePlan(order,factories).status,'human_review');
 }
 assert.equal(evaluatePlan({...order,splittable:false},[factory('A',400),factory('B',400)]).status,'human_review');
});
test('an infeasible combination across many factories must not block the server',()=>{
 const {spawnSync}=require('node:child_process');
 const factories=Array.from({length:32},(_,i)=>factory(String(i),200,200));
 const script=`const {evaluatePlan}=require(${JSON.stringify(require.resolve('../agent'))}); const p=evaluatePlan(${JSON.stringify({...order,quantity:3201})},${JSON.stringify(factories)}); if(p.status!=='human_review') process.exit(1);`;
 const result=spawnSync(process.execPath,['-e',script],{timeout:1500});
 assert.equal(result.error,undefined,'infeasible search must finish without monopolizing the event loop');
 assert.equal(result.status,0);
});
