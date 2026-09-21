const test = require('node:test');
const assert = require('node:assert/strict');
const {createNotifications, createOperations, workflowStep, validBridgeMessage} = require('../ui/runtime');
test('notifications deduplicate, retain latest three, and distinguish errors',()=>{
 const n=createNotifications();n.push('saved');n.push('saved');assert.equal(n.items.length,1);
 n.push('second');n.push('third');n.push('failed',{type:'error'});
 assert.equal(n.items.length,3);assert.equal(n.items[2].duration,8000);
 n.remove(n.items[2].id);assert.equal(n.items.length,2);
});
test('operations outlive views and deduplicate until settled, isolated by account',async()=>{
 const jobs=createOperations();let resolve,calls=0;
 const first=jobs.run('brand:a:review:1',()=>{calls++;return new Promise(r=>resolve=r)});
 const second=jobs.run('brand:a:review:1',()=>{calls++;});
 assert.equal(first,second);await Promise.resolve();assert.equal(calls,1);
 await jobs.run('brand:b:review:1',()=>42);resolve('saved');assert.equal(await first,'saved');
 assert.equal(jobs.busy('brand:a:review:1'),false);
});
test('workflow permits manual BOM and reflects execution invalidation',()=>{
 assert.equal(workflowStep({}),1);assert.equal(workflowStep({file:true}),2);
 assert.equal(workflowStep({bom:{style_name:'shoe',sku_code:'S',craftsmanship:'sew'}}),3);
 assert.equal(workflowStep({execution:'running'}),4);
 assert.equal(workflowStep({execution:'',file:true}),2);
});
test('bridge rejects other origins, windows, malformed sizes and unexpected types',()=>{
 const source={};const origin='https://local.test';
 const event=data=>({origin,source,data});
 assert.equal(validBridgeMessage(event({type:'shoe-ui:height',height:500}),origin,source),true);
 for(const data of [{type:'shoe-ui:height',height:Infinity},{type:'shoe-ui:height',height:-1},{type:'shoe-ui:toast',message:{}},{type:'unknown'}])assert.equal(validBridgeMessage(event(data),origin,source),false);
 assert.equal(validBridgeMessage({...event({type:'shoe-ui:height',height:500}),source:{}},origin,source),false);
 assert.equal(validBridgeMessage({...event({type:'shoe-ui:height',height:500}),origin:'https://evil.test'},origin,source),false);
});
test('operation subscribers observe terminal outcomes after the initiating view is gone',async()=>{
 const jobs=createOperations();let release;const promise=jobs.run('profile:a',()=>new Promise(r=>release=r),{scope:'profile'});
 const operation=jobs.snapshot('profile:a');assert.equal(operation.status,'pending');await Promise.resolve();
 const observed=[];const stop=jobs.subscribe(()=>observed.push(jobs.snapshot('profile:a')));release('saved');await promise;stop();
 assert.equal(observed.at(-1).id,operation.id);assert.equal(observed.at(-1).status,'success');assert.equal(jobs.busy('profile:a'),false);
 await assert.rejects(jobs.run('profile:a',()=>Promise.reject(Error('offline')),{scope:'profile'}));assert.equal(jobs.snapshot('profile:a').status,'error');assert.equal(jobs.snapshot('profile:a').error.message,'offline');
});
