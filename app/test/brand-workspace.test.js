const test = require('node:test');
const assert = require('node:assert/strict');
const {getBrandSummary, filterOrders, pageItems} = require('../portal/brand-workspace-data');

const orders = [
  {id:'1',brandId:'A',factoryId:'F1',title:'通勤鞋',status:'production',createdAt:'2026-09-01',updatedAt:'2026-09-20'},
  {id:'2',brandId:'A',factoryId:'F2',title:'试单',status:'pending',createdAt:'2026-09-19'},
  {id:'3',brandId:'A',factoryId:'F1',title:'秋季鞋',status:'completed',createdAt:'2026-09-18'},
  {id:'4',brandId:'A',factoryId:'F2',status:'rejected',demand:{},createdAt:'2026-09-17'},
  {id:'5',brandId:'A',factoryId:'F2',status:'rejected',demand:{},reassignedBy:'retry',createdAt:'2026-09-16'},
  {id:'6',brandId:'A',factoryId:'F1',status:'completed',createdAt:'2026-09-15'},
  {id:'7',brandId:'A',factoryId:'F1',status:'completed',createdAt:'2026-09-14'},
  {id:'8',brandId:'B',factoryId:'F3',status:'pending',createdAt:'2026-09-21'},
];
const data={orders,factories:[{id:'F1',name:'精工鞋业'},{id:'F2',name:'云端制造'},{id:'F3',name:'其他工厂'}],reviews:[
  {id:'seed',source:'seed',brandId:'A',orderId:'6'},
  {id:'feedback',brandId:'A',orderId:'7',feedbackVersion:1,delivery:'on_time',quality:'perfect',rating:5,orderQuantity:200,feedbackSubmittedAt:'2026-09-21T00:00:00Z'},
]};

test('brand overview isolates accounts and excludes reassigned and already reviewed orders from attention',()=>{
  const summary=getBrandSummary(data,'A');
  assert.deepEqual(summary.counts,{pending:1,production:1,completed:3,rejected:2});
  assert.equal(summary.active,2);
  assert.deepEqual(summary.partners.map(f=>f.id),['F1','F2']);
  assert.deepEqual(summary.attention.map(x=>[x.order.id,x.kind]),[['4','reassign'],['3','review']]);
  assert.deepEqual(summary.orders.slice(0,3).map(o=>o.id),['1','2','3']);
  assert.deepEqual(orders.map(o=>o.id),['1','2','3','4','5','6','7','8'],'sorting must not mutate shared data');
});

test('status and search combine, including factory names and case-insensitive order IDs',()=>{
  const own=getBrandSummary(data,'A').orders;
  assert.deepEqual(filterOrders(own,data.factories,{status:'production',query:' 精工 '}).map(o=>o.id),['1']);
  assert.deepEqual(filterOrders(own,data.factories,{status:'pending',query:'精工'}),[]);
  assert.deepEqual(filterOrders(own,data.factories,{status:'active'}).map(o=>o.id),['1','2']);
  assert.deepEqual(filterOrders(own,data.factories,{query:'秋季'}).map(o=>o.id),['3']);
  assert.equal(filterOrders([{id:'ORDER-X',title:'鞋',factoryId:'F1',status:'pending'}],data.factories,{query:'order-x'}).length,1);
});

test('pagination clamps stale or malformed page numbers and keeps empty results on page one',()=>{
  const items=Array.from({length:23},(_,i)=>i);
  assert.deepEqual(pageItems(items,2,10),{items:[10,11,12,13,14,15,16,17,18,19],page:2,pages:3,total:23});
  assert.deepEqual(pageItems(items,99,10).items,[20,21,22]);
  assert.equal(pageItems(items,'oops',10).page,1);
  assert.deepEqual(pageItems([],4,10),{items:[],page:1,pages:1,total:0});
  assert.equal(getBrandSummary({...data,orders:[],reviews:[]},'A').active,0);
});
