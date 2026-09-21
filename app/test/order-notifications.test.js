const {test}=require('node:test');const assert=require('node:assert/strict');
const {pendingOrders,cacheOrders}=require('../portal/order-notifications');
test('pending notifications belong only to the signed-in factory',()=>{
 const orders=[{id:'a',factoryId:'A',status:'pending'},{id:'b',factoryId:'B',status:'pending'},{id:'c',factoryId:'A',status:'production'}];
 assert.deepEqual(pendingOrders(orders,{id:'A',role:'factory'}).map(o=>o.id),['a']);assert.deepEqual(pendingOrders(orders,{id:'A',role:'brand'}),[]);assert.deepEqual(pendingOrders(orders,null),[]);
});
test('notification cache writes pending summaries without images and avoids storage event loops',()=>{
 let value=null,writes=0;const storage={getItem:()=>value,setItem:(_,v)=>{value=v;writes++;}};
 const orders=[{id:'a',factoryId:'A',status:'pending',quantity:10,demand:{sample_images:['large-image'],planning_context:{category:'运动鞋',deadline_days:10},production_requirements:{cooperation_mode:'包工包料'}}}];
 cacheOrders(storage,orders);cacheOrders(storage,orders);assert.equal(writes,1);assert.equal(JSON.parse(value)[0].status,'pending');assert.ok(!value.includes('large-image'));
 cacheOrders(storage,[{...orders[0],status:'production'}]);assert.equal(writes,2);
 assert.doesNotThrow(()=>cacheOrders({getItem(){throw Error('unavailable')}},orders));
});
