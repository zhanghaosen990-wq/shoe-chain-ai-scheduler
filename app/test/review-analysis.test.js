const {test}=require('node:test');const assert=require('node:assert/strict');
const {analyzeReviewText,createReviewAnalyzer}=require('../review-analysis');
const reply=tags=>async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({tags})}}]})});
test('tags retain grounded highlights and risks, rejecting fabricated, duplicate and oversized tags',async()=>{
 const tags=await analyzeReviewText('按时交货，缝线有瑕疵，沟通顺畅',{apiKey:'test',fetcher:reply([{label:'交期准时',type:'highlight',evidence:'按时交货'},{label:'缝线需关注',type:'risk',evidence:'缝线有瑕疵'},{label:'交期准时',type:'highlight',evidence:'按时交货'},{label:'价格低廉',type:'highlight',evidence:'价格低廉'},{label:'a'.repeat(40),type:'risk',evidence:'按时交货'}])});assert.equal(tags.length,2);assert.equal(tags[1].type,'risk');
});
test('missing key, provider failure, timeout and invalid JSON reject instead of inventing tags',async()=>{
 await assert.rejects(analyzeReviewText('评价',{}));
 for(const fetcher of [async()=>({ok:false}),async()=>{throw new DOMException('timeout','TimeoutError');},async()=>({ok:true,json:async()=>({choices:[{message:{content:'not-json'}}]})})])await assert.rejects(analyzeReviewText('评价',{apiKey:'test',fetcher}));
});
test('background analyzer persists failure without changing feedback and skips empty text',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {createStore}=require('../portal-store');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tags-'));
 try{const store=createStore(path.join(dir,'state.json'));let next=store.review('BRAND-A',{orderId:'DEMO-001',delivery:'on_time',quality:'perfect',rating:5,comment:'按时交付'});const id=next.reviews[0].id,before=next.factories[0].analytics;const analyzer=createReviewAnalyzer(store,{});analyzer.enqueue('BRAND-A',id);await analyzer.wait(id);next=store.snapshot();assert.equal(next.reviews[0].analysisStatus,'failed');assert.deepEqual(next.factories[0].analytics,before);assert.throws(()=>analyzer.enqueue('BRAND-B',id));
 const success=createReviewAnalyzer(store,{apiKey:'test',fetcher:reply([{label:'交期准时',type:'highlight',evidence:'按时交付'}])});success.enqueue('BRAND-A',id);await success.wait(id);assert.equal(store.snapshot().reviews[0].analysisStatus,'completed');assert.deepEqual(store.snapshot().factories[0].analytics,before);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('real timeout bounds a stalled provider; tags cap at five and malformed structure fails',async()=>{
 await assert.rejects(analyzeReviewText('按时交货',{apiKey:'test',timeoutMs:10,fetcher:()=>new Promise(()=>{})}),/超时/);
 const tags=await analyzeReviewText('按时交货',{apiKey:'test',fetcher:reply(Array.from({length:8},(_,i)=>({label:`标签${i}`,type:'highlight',evidence:'按时交货'})))});assert.equal(tags.length,5);
 await assert.rejects(analyzeReviewText('评价',{apiKey:'test',fetcher:async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"tags":null}'}}]})})}));
});
test('empty comments skip provider, concurrent retries coalesce and stale result cannot overwrite',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {createStore}=require('../portal-store');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tags-job-'));
 try{
 const store=createStore(path.join(dir,'state.json'));let count=0;const analyzer=createReviewAnalyzer(store,{apiKey:'test',fetcher:async()=>{count++;return {ok:true,json:async()=>({choices:[{message:{content:'{"tags":[]}'}}]})};}});
 const empty=store.review('BRAND-A',{orderId:'DEMO-001',delivery:'late',quality:'poor',rating:1,comment:''}).reviews[0];analyzer.enqueue('BRAND-A',empty.id);await analyzer.wait(empty.id);assert.equal(count,0);assert.equal(store.snapshot().reviews[0].analysisStatus,'skipped');
 const data=store.snapshot();data.orders.push({...data.orders[0],id:'new-order',brandId:'BRAND-A',factoryId:'FAC-A',status:'completed'});fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify(data));const second=createStore(path.join(dir,'state.json'));
 const review=second.review('BRAND-A',{orderId:'new-order',delivery:'on_time',quality:'good',rating:4,comment:'按时交货'}).reviews[0];let resolve;const job=createReviewAnalyzer(second,{apiKey:'test',fetcher:()=>{count++;return new Promise(r=>{resolve=r;});}});job.enqueue('BRAND-A',review.id);job.enqueue('BRAND-A',review.id);await Promise.resolve();assert.equal(count,1);assert.throws(()=>job.enqueue('BRAND-B',review.id));resolve({ok:true,json:async()=>({choices:[{message:{content:'{"tags":[]}'}}]})});await job.wait(review.id);second.finishReviewAnalysis(review.id,'wrong-token',{status:'failed'});assert.equal(second.snapshot().reviews[0].analysisStatus,'completed');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
