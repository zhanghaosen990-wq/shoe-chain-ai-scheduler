const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shoe-demo-dispatch-')),stateFile=path.join(dir,'state.json');
 if(process.argv[2])fs.copyFileSync(process.argv[2],stateFile);
 const server=spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,PORT:'4178',PORTAL_STATE_FILE:stateFile,AI_PROVIDER:'openai',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});let browser;
 try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',c=>reject(Error('server '+c)));});
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1100}});page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:4178');await page.getByRole('button',{name:'登录',exact:true}).click();const login=page.getByRole('dialog');await login.getByLabel('账号 / 手机号').fill('brand_01');await login.getByLabel('密码',{exact:true}).fill('123456');await login.getByRole('button',{name:'登录',exact:true}).click();await login.waitFor({state:'hidden'});
  for(const kind of ['shoe','apparel','unfamiliar']){
   await page.getByRole('button',{name:/发布生产需求/}).click();const frame=page.frameLocator('iframe');
   await frame.locator('#demo-kind').selectOption(kind==='shoe'?'shoe':'apparel');await frame.locator('#fill-demo').click();await page.waitForFunction(()=>!document.querySelector('iframe').contentDocument.querySelector('#fill-demo').disabled);await frame.locator('#remove-bom-file').waitFor();
   if(kind==='unfamiliar'){
    await frame.locator('#bom-style-name').fill('新款不对称通勤女装');await frame.locator('#bom-sku-code').fill('NEW-REGRESSION');
    await frame.getByText('编辑工艺关键词',{exact:true}).click();await frame.locator('#bom-craftsmanship').fill('立体裁断\n精细缝纫\n熨烫');await frame.locator('#quantity').fill('650');
   }
   const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/agent'));await frame.locator('#run-agent').click();const result=await (await responsePromise).json();
   assert.equal(result.plan.status,'recommended',kind+': '+JSON.stringify(result.plan));assert.equal(result.dashboard.canApprove,true);assert.ok(result.plan.allocations.length>=2,kind+' splits: '+JSON.stringify(result.plan));
   assert.ok(result.candidates.every(c=>c.available_capacity>0));
   const total=Number(await frame.locator('#quantity').inputValue());assert.equal(result.plan.allocations.reduce((n,a)=>n+a.quantity,0),total);
   for(const a of result.plan.allocations){const c=result.candidates.find(c=>c.factory_id===a.factory_id);assert.ok(a.quantity>0&&a.quantity>=c.moq&&a.quantity<=c.available_capacity);}
   await frame.locator('#select-factories').click();const modal=page.getByRole('dialog');await modal.waitFor();
   assert.equal(await modal.locator('.candidate-card input[type=checkbox]:checked').count(),result.plan.allocations.length);
   assert.equal(await modal.getByRole('button',{name:'核对分配与风险'}).isEnabled(),true);
   for(const a of result.plan.allocations){const f=result.factories.find(f=>f.id===a.factory_id);assert.equal(Number(await modal.getByLabel('分配数量 '+f.name.replace(/（模拟）$/,''),{exact:true}).inputValue()),a.quantity);}
   const before=new Set(JSON.parse(fs.readFileSync(stateFile)).orders.map(o=>o.id));
   await modal.getByRole('button',{name:'核对分配与风险'}).click();await modal.getByRole('checkbox').check();await modal.getByRole('button',{name:'提交给所选工厂'}).click();await modal.waitFor({state:'hidden'});
   const created=JSON.parse(fs.readFileSync(stateFile)).orders.filter(o=>!before.has(o.id));assert.equal(created.length,result.plan.allocations.length);assert.equal(created.reduce((n,o)=>n+o.quantity,0),total);
   console.log('PASS',kind,JSON.stringify(result.plan.allocations));
  }
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();server.kill();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
