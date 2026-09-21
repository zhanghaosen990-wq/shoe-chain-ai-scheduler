const test=require('node:test');
const assert=require('node:assert/strict');
const {factoryOrders,previewOrders,filterFactoryOrders,orderPageFor}=require('../portal/factory-workspace-data');
const orders=[
 {id:'a',factoryId:'FAC-A',brandId:'BRAND-A',title:'皮鞋',status:'completed',createdAt:'2026-09-20'},
 {id:'b',factoryId:'FAC-A',brandId:'BRAND-A',title:'运动鞋',status:'pending',createdAt:'2026-09-18'},
 {id:'c',factoryId:'FAC-A',brandId:'BRAND-B',title:'冬靴',status:'pending',createdAt:'2026-09-19'},
 {id:'d',factoryId:'FAC-B',brandId:'BRAND-A',title:'其他工厂',status:'pending',createdAt:'2026-09-21'},
 {id:'e',factoryId:'FAC-A',brandId:'BRAND-A',title:'生产单',status:'production',createdAt:'2026-09-15',updatedAt:'2026-09-21'},
];
test('overview prioritizes own pending orders then recent collaborations, capped at three',()=>{
 const own=factoryOrders(orders,'FAC-A');
 assert.deepEqual(own.map(o=>o.id),['e','a','c','b']);
 assert.deepEqual(previewOrders(own).map(o=>o.id),['c','b','e']);
 assert.deepEqual(previewOrders([]),[]);
});
test('factory search combines status and brand, title or order ID',()=>{
 const brands=[{id:'BRAND-A',name:'迈斯特'},{id:'BRAND-B',name:'云端'}];
 assert.deepEqual(filterFactoryOrders(factoryOrders(orders,'FAC-A'),brands,{status:'pending',query:'云端'}).map(o=>o.id),['c']);
 assert.deepEqual(filterFactoryOrders(orders,brands,{status:'all',query:'运动鞋'}).map(o=>o.id),['b']);
 assert.equal(filterFactoryOrders(orders,brands,{status:'production',query:'云端'}).length,0);
});
test('notification target resolves to the correct page, missing targets are explicit',()=>{
 const many=Array.from({length:24},(_,i)=>({id:`O-${i}`}));
 assert.equal(orderPageFor(many,'O-21'),3);assert.equal(orderPageFor(many,'absent'),null);
});
