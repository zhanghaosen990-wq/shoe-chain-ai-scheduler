const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createStore}=require('./portal-store');

(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shoe-completion-')),stateFile=path.join(dir,'state.json');
 const fixture=createStore(stateFile).snapshot();
 fixture.factories[0].contactName='甲厂最新联系人';fixture.factories[0].phone='13800138001';
 fixture.factories[1].contactName='乙厂最新联系人';fixture.factories[1].phone='13800138002';
 fixture.orders=['pending','production','completed','rejected'].flatMap(status=>['A','B'].map(factory=>({
  id:`${factory}-${status}`,title:`${factory}-${status}`,brandId:'BRAND-A',factoryId:`FAC-${factory}`,status,quantity:100,createdAt:'2026-09-25T09:00:00Z'
 })));
 fixture.orders.push(
  {id:'A-stale',title:'并发完成测试',brandId:'BRAND-A',factoryId:'FAC-A',status:'production',quantity:100,createdAt:'2026-09-25T10:00:00Z'},
  {id:'other-brand',title:'其他品牌订单',brandId:'BRAND-B',factoryId:'FAC-A',status:'production',quantity:100,createdAt:'2026-09-25T11:00:00Z'}
 );
 fixture.reviews=[];fs.writeFileSync(stateFile,JSON.stringify(fixture));
 const base='http://localhost:4189';
 const server=spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,AI_PROVIDER:'openai',OPENAI_API_KEY:'',PORT:'4189',PORTAL_STATE_FILE:stateFile},stdio:['ignore','pipe','pipe']});
 let browser,release;
 try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',c=>reject(Error('server '+c)));});
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
  const modal=page.getByRole('dialog',{name:'订单需求详情',exact:true});
  const contact=modal.getByRole('region',{name:'承接工厂联系方式'});
  const complete=modal.getByRole('button',{name:'已完成订单',exact:true});
  const read=()=>JSON.parse(fs.readFileSync(stateFile,'utf8'));
  async function post(actor,endpoint,data,status=200){
   const response=await page.request.post(base+'/api/portal/'+endpoint,{headers:{'X-Account-Id':actor},data});
   assert.equal(response.status(),status,await response.text());return response.json();
  }
  async function close(){await modal.getByLabel('关闭弹窗').click();await modal.waitFor({state:'hidden'});}
  async function dismissAlert(){
   const alert=page.getByRole('dialog').filter({hasText:'收到新的品牌方合作邀约'});
   await alert.waitFor();await alert.getByLabel('关闭弹窗').click();
  }
  async function login(username){
   await page.goto(base);await page.locator('.portal-shell').waitFor();
   const logout=page.getByRole('button',{name:'退出登录',exact:true});
   if(await logout.count())await logout.click();
   await page.getByRole('button',{name:'登录',exact:true}).click();
   const form=page.getByRole('dialog',{name:'登录账号',exact:true});
   await form.getByLabel('账号 / 手机号').fill(username);await form.getByLabel('密码',{exact:true}).fill('123456');
   await form.getByRole('button',{name:'登录',exact:true}).click();await form.waitFor({state:'hidden'});
   if(username.startsWith('factory'))await dismissAlert();
  }
  // Recovery renders the real shared drawer, including orders excluded by workspace ownership filters.
  async function recover(orderId){
   await page.evaluate(orderId=>window.dispatchEvent(new CustomEvent('shoe-ui:restore',{detail:{kind:'order',accountId:localStorage.getItem('shoe-session-v1'),orderId}})),orderId);
   await modal.waitFor();
  }
  async function factoryOrder(id){await page.locator(`#factory-order-${id}`).getByRole('button',{name:/查看需求：/}).click();await modal.waitFor();}
  async function staleCache(){await page.evaluate(()=>{
   const users=JSON.parse(localStorage.getItem('shoe-users-v1'));
   localStorage.setItem('shoe-users-v1',JSON.stringify(users.map(u=>u.role==='factory'?{...u,profileReady:true,contactName:'过期本地联系人',phone:'13999999999'}:u)));
  });}
  async function refresh(){
   const response=page.waitForResponse(r=>r.url()===base+'/api/portal'&&r.request().method()==='GET');
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await response;
  }

  await page.goto(base);await page.locator('.portal-shell').waitFor();await staleCache();await login('brand_01');
  for(const factory of ['A','B'])for(const status of ['pending','production','completed','rejected']){
   await recover(`${factory}-${status}`);
   if(['production','completed'].includes(status)){
    assert.match(await contact.innerText(),new RegExp(factory==='A'?'甲厂最新联系人':'乙厂最新联系人'));
    assert.match(await contact.innerText(),new RegExp(factory==='A'?'13800138001':'13800138002'));
    assert.doesNotMatch(await contact.innerText(),/过期本地|13999999999/);
   }else assert.equal(await contact.count(),0);
   assert.equal(await complete.count(),0);await close();
  }
  await recover('other-brand');assert.equal(await contact.count(),0);await close();
  for(const [name,phone] of [['','13800138002'],['乙厂最新联系人',''],['','']]){
   await post('FAC-B','profile',{...read().factories[1],contactName:name,phone});await refresh();await recover('B-production');
   await contact.getByText(name||'联系人未提供',{exact:true}).waitFor();
   await contact.getByText(phone||'联系电话未提供',{exact:true}).waitFor();await close();
  }
  // Explicitly cleared server values stay empty even with stale browser cache and on factory login.
  await login('factory_02');assert.equal(read().factories[1].contactName,'');assert.equal(read().factories[1].phone,'');
  await login('factory_01');
  assert.equal(read().factories[0].contactName,'甲厂最新联系人');assert.equal(read().factories[0].phone,'13800138001');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shoe-users-v1')).find(u=>u.id==='FAC-A').phone),'13800138001');
  await post('FAC-A','profile',{...read().factories[0],contactName:'更新后的联系人',phone:'13800138003'});await refresh();
  await page.locator('.user-menu summary').click();await page.getByRole('button',{name:'编辑企业资料',exact:true}).click();
  const profile=page.getByRole('dialog');
  await page.waitForFunction(()=>document.querySelector('dialog[open] input')!==null);
  assert.equal(await profile.getByLabel('联系人姓名').inputValue(),'更新后的联系人');
  assert.equal(await profile.getByLabel('联系电话').inputValue(),'13800138003');await profile.getByLabel('关闭弹窗').click();
  await page.getByRole('button',{name:'订单与排期',exact:true}).click();
  for(const factory of ['A','B'])for(const status of ['pending','production','completed','rejected']){
   await recover(`${factory}-${status}`);
   assert.equal(await complete.count(),factory==='A'&&status==='production'?1:0);
   assert.equal(await contact.count(),0);await close();
  }
  assert.equal(await page.locator('#factory-order-B-production').count(),0);
  await post('FAC-B','order-status',{orderId:'A-production',status:'completed'},400);
  await post('FAC-A','order-status',{orderId:'A-pending',status:'completed'},400);
  await post('FAC-A','order-status',{orderId:'A-rejected',status:'completed'},400);

  let submissions=0,started;
  const received=new Promise(resolve=>started=resolve),held=new Promise(resolve=>release=resolve);
  await page.route('**/api/portal/order-status',async route=>{submissions++;started();await held;await route.continue();});
  await factoryOrder('A-production');
  // Same-event-loop double click also exercises the synchronous operation guard.
  await complete.evaluate(button=>{button.click();button.click();});await received;
  assert.equal(await modal.getByRole('button',{name:'处理中…',exact:true}).isDisabled(),true);
  await close();await factoryOrder('A-production');
  assert.equal(await modal.getByRole('button',{name:'处理中…',exact:true}).isDisabled(),true);
  assert.equal(submissions,1);release();await modal.waitFor({state:'hidden'});await page.unroute('**/api/portal/order-status');
  await page.locator('#factory-order-A-production').getByText('已完成',{exact:true}).waitFor();
  await page.getByRole('button',{name:'已完成',exact:true}).click();
  await factoryOrder('A-production');assert.equal(await complete.count(),0);await close();
  await page.getByRole('button',{name:'全部',exact:true}).click();await page.locator('#factory-order-A-production').waitFor();
  await post('FAC-A','order-status',{orderId:'A-production',status:'completed'},400);
  assert.equal(read().orders.find(o=>o.id==='A-production').status,'completed');

  // A second actor wins while the factory is viewing an older production snapshot.
  await factoryOrder('A-stale');
  await page.route('**/api/portal',route=>route.fulfill({json:{...read(),orders:read().orders.map(o=>o.id==='A-stale'?{...o,status:'production'}:o)}}));
  await post('BRAND-A','order-status',{orderId:'A-stale',status:'completed'});
  await page.unroute('**/api/portal');await complete.click();
  await modal.getByRole('alert').filter({hasText:'当前账号不能执行此订单状态变更'}).waitFor();
  assert.equal(await complete.count(),0);await close();
  await page.locator('#factory-order-A-stale').getByText('已完成',{exact:true}).waitFor();

  await login('brand_01');await page.getByRole('button',{name:'订单管理',exact:true}).click();
  await page.getByRole('button',{name:'查看需求：A-production',exact:true}).click();
  await contact.getByText('更新后的联系人',{exact:true}).waitFor();await contact.getByText('13800138003',{exact:true}).waitFor();await close();
  await page.getByRole('button',{name:'查看需求：B-production',exact:true}).click();
  await modal.getByRole('button',{name:'确认完成',exact:true}).click();
  await modal.getByRole('button',{name:'填写履约反馈 / 评价工厂',exact:true}).waitFor();
  await contact.getByText('联系人未提供',{exact:true}).waitFor();await contact.getByText('联系电话未提供',{exact:true}).waitFor();
  assert.equal(read().orders.find(o=>o.id==='B-production').status,'completed');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await close();await page.getByRole('button',{name:'退出登录',exact:true}).click();
  await page.goto(base+'/profile/BRAND-A');await page.locator('.portal-shell').waitFor();
  await page.locator('tr').filter({hasText:'A-production'}).getByRole('button',{name:'查看需求',exact:true}).click();
  assert.equal(await contact.count(),0);assert.equal(await complete.count(),0);await close();
  assert.deepEqual(errors,[]);
  console.log('PASS: assigned-factory contacts; brand/status/guest visibility; missing fields; stale cache and login sync; current profile editor; factory ownership; completion persistence and all/completed filters; duplicate suppression and reopen; stale-state rejection/refresh; preserved brand completion; mobile.');
 }finally{
  release?.();if(browser)await browser.close();
  if(server.exitCode===null){const exited=once(server,'exit');server.kill();await exited;}
  fs.rmSync(dir,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
