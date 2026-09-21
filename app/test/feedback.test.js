const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {calculateFeedback,isCompleteFeedback}=require('../feedback');const {createStore}=require('../portal-store');
const fields={delivery:'on_time',quality:'perfect',rating:5,comment:''};
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'feedback-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'state.json');return {file,store:createStore(file)};}
test('weighted delivery, equal quality and stars use complete questionnaires only',()=>{
 const make=(id,quantity,delivery,quality,rating)=>({id,factoryId:'A',feedbackVersion:1,orderQuantity:quantity,delivery,quality,rating,feedbackSubmittedAt:'2026-09-21T00:00:00Z'});
 const reviews=[make('x',300,'on_time','perfect',5),make('y',700,'minor_delay','good',4),make('REVIEW-1',2000,'on_time','perfect',5),{id:'old',factoryId:'A',rating:1},{...make('z',500,'late','poor',1),factoryId:'B'}];
 const result=calculateFeedback(reviews,'A');assert.equal(result.deliveryRate,93);assert.equal(result.qualityRate,98);assert.equal(result.rating,4.5);assert.equal(result.reviewCount,2);assert.equal(calculateFeedback([],'A').rating,null);assert.equal(isCompleteFeedback(make('bad',0,'on_time','perfect',5)),false);
});
test('store validates new questionnaire and prevents duplicates without affecting other factories',t=>{
 const {store,file}=setup(t);assert.equal(store.snapshot().factories[0].analytics.rating,null);
 assert.throws(()=>store.review('BRAND-A',{orderId:'DEMO-001',rating:5,comment:'旧格式'}));assert.throws(()=>store.review('BRAND-B',{orderId:'DEMO-001',...fields}));assert.throws(()=>store.review('BRAND-A',{orderId:'DEMO-002',...fields}));
 const next=store.review('BRAND-A',{orderId:'DEMO-001',...fields});assert.equal(next.factories[0].analytics.deliveryRate,100);assert.equal(next.factories[0].analytics.qualityRate,99.5);assert.equal(next.factories[1].analytics.rating,null);
 assert.equal(next.reviews[0].orderQuantity,300);assert.equal(next.reviews[0].analysisStatus,'skipped');assert.throws(()=>store.review('BRAND-A',{orderId:'DEMO-001',...fields}));assert.equal(createStore(file).snapshot().factories[0].analytics.reviewCount,1);
});
test('legacy real review can be supplemented once in place; seeded reviews remain excluded',t=>{
 const {store,file}=setup(t);const state=store.snapshot();state.reviews.unshift({id:'legacy-user',orderId:'DEMO-001',brandId:'BRAND-A',factoryId:'FAC-A',rating:4,comment:'历史反馈',createdAt:'2026-09-10T00:00:00Z'});fs.writeFileSync(file,JSON.stringify(state));const migrated=createStore(file);
 const next=migrated.review('BRAND-A',{orderId:'DEMO-001',...fields,comment:'历史反馈'});assert.equal(next.reviews.length,4);assert.equal(next.reviews[0].id,'legacy-user');assert.equal(next.factories[0].analytics.reviewCount,1);assert.throws(()=>migrated.review('BRAND-A',{orderId:'DEMO-001',...fields}));assert.throws(()=>migrated.review('BRAND-B',{orderId:'DEMO-003',...fields}));
 const restored=createStore(file).snapshot();assert.equal(restored.reviews[0].analysisStatus,'failed');assert.equal(restored.factories[0].analytics.reviewCount,1);
});
