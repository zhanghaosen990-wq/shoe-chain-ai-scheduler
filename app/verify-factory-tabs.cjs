// Isolated real API/browser regression. Only provider import and failure scenarios are mocked.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createStore}=require('./portal-store');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-tabs-')),file=path.join(dir,'state.json');
 const state=createStore(file).snapshot();
 for(let i=0;i<24;i++)state.orders.push({id:`TAB-${String(i).padStart(2,'0')}`,factoryId:'FAC-A',brandId:i%2?'BRAND-A':'BRAND-B',title:`秋季补单 ${String(i).padStart(2,'0')}`,status:['pending','production','completed','rejected'][i%4],quantity:100+i,createdAt:`2026-09-${String(1+i).padStart(2,'0')}T09:00:00Z`,demand:{bom_data:{style_name:`秋季补单 ${i}`},planning_context:{deadline_days:10,category:'运动鞋'},production_requirements:{cooperation_mode:'包工包料'}}});
 const review=state.reviews.find(r=>r.factoryId==='FAC-A');
 for(let i=0;i<7;i++)state.reviews.push({...review,id:`TAB-REVIEW-${i}`,comment:`历史合作反馈 ${i}`});
 fs.writeFileSync(file,JSON.stringify(state));
 const server=spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,PORT:'4188',PORTAL_STATE_FILE:file,AI_PROVIDER:'openai',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});
 let browser,page;
 try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',c=>reject(Error(`server ${c}`)));});
  browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(8000);
  const base='http://localhost:4188',errors=[];page.on('pageerror',e=>errors.push(e.message));
  const alert=()=>page.getByRole('dialog').filter({hasText:'收到新的品牌方合作邀约'});
  async function dismissAlert(){await alert().waitFor();await alert().getByLabel('关闭弹窗').click();}
  async function login(user){await page.goto(base);if(await page.getByRole('button',{name:'退出登录',exact:true}).count())await page.getByRole('button',{name:'退出登录',exact:true}).click();await page.getByRole('button',{name:'登录',exact:true}).click();const dialog=page.getByRole('dialog',{name:'登录账号'});await dialog.getByLabel('账号 / 手机号').fill(user);await dialog.getByLabel('密码',{exact:true}).fill('123456');await dialog.getByRole('button',{name:'登录',exact:true}).click();await dialog.waitFor({state:'hidden'});}
  const tab=name=>page.getByRole('navigation',{name:'工厂工作台导航'}).getByRole('button',{name,exact:true});
  const api=async()=> (await (await page.request.get(base+'/api/portal')).json()).factories.find(f=>f.id==='FAC-A');
  async function save(name){const response=page.waitForResponse(r=>r.url().endsWith('/api/portal/factory')&&r.request().method()==='POST');await page.getByRole('button',{name,exact:true}).click();const r=await response;await page.getByRole('button',{name,exact:true}).waitFor();await page.waitForFunction(()=>![...document.querySelectorAll('.factory-hero-actions button')].some(b=>b.disabled));return r;}
  await login('factory_01');await dismissAlert();
  await tab('工厂概览').waitFor();
  assert.equal(await page.locator('.factory-recent tbody tr').count(),3);
  assert.deepEqual(await page.locator('.factory-recent .brand-status').allTextContents(),['待接单','待接单','待接单']);
  assert.equal(await page.locator('.factory-workspace input:visible,.factory-workspace textarea:visible').count(),0);
  assert.ok(await page.locator('.factory-recent').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight),'overview fits 1440×900');
  await page.getByRole('button',{name:'更新产能资料',exact:true}).click();assert.ok(page.url().includes('view=capacity'));
  assert.equal(await page.getByLabel('上传工厂设备产能资料').isVisible(),false);
  assert.equal(await page.getByLabel('可选工艺',{exact:true}).isVisible(),false);
  const capacity=page.getByLabel('日均产能（件/双）',{exact:true});await capacity.fill('175');
  const search=page.getByRole('searchbox',{name:'搜索或添加擅长工艺'});
  await search.fill('精细缝制');await search.press('Enter');await page.getByRole('button',{name:'移除工艺：精细缝制',exact:true}).waitFor();
  await search.fill('精细缝制');assert.equal(await page.getByRole('button',{name:'添加工艺：精细缝制',exact:true}).count(),0);
  await search.fill('输入法确认');await search.dispatchEvent('keydown',{key:'Enter',isComposing:true});assert.equal(await page.getByRole('button',{name:'移除工艺：输入法确认'}).count(),0);await search.fill('');
  await tab('工厂档案与展示').click();await page.getByLabel('工厂介绍',{exact:true}).fill('展示独立草稿');
  await tab('产能与工艺').click();assert.equal(await capacity.inputValue(),'175');
  const before=await api();assert.equal((await save('保存产能与工艺')).status(),200);
  assert.equal((await api()).description,before.description);assert.equal((await api()).dailyCapacity,175);
  await tab('工厂档案与展示').click();assert.equal(await page.getByLabel('工厂介绍',{exact:true}).inputValue(),'展示独立草稿');
  await tab('产能与工艺').click();await capacity.fill('999');await tab('工厂档案与展示').click();
  const png=fs.readFileSync(path.join(__dirname,'assets/demo-shoe.png'));
  await page.getByLabel('上传产品细节图').setInputFiles({name:'detail.png',mimeType:'image/png',buffer:png});await page.getByAltText('产品细节 1',{exact:true}).waitFor();
  assert.equal((await save('保存工厂档案')).status(),200);assert.equal((await api()).dailyCapacity,175);
  const cached=await page.evaluate(()=>JSON.parse(localStorage.getItem('shoe-users-v1')).find(u=>u.id==='FAC-A'));
  assert.equal(cached.description,'展示独立草稿');assert.deepEqual(cached.categories,before.categories);
  await tab('产能与工艺').click();assert.equal(await capacity.inputValue(),'999');
  // Server-side background changes must not overwrite dirty local edits.
  await page.request.post(base+'/api/portal/factory',{headers:{'X-Account-Id':'FAC-A'},data:{section:'capacity',...before,dailyCapacity:190}});
  const refresh=page.waitForResponse(r=>r.url().endsWith('/api/portal'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await refresh;assert.equal(await capacity.inputValue(),'999');
  await page.route('**/api/portal/factory',r=>r.fulfill({status:500,json:{error:'保存暂时失败，请重试'}}));
  assert.equal((await save('保存产能与工艺')).status(),500);await page.getByRole('alert').filter({hasText:'保存暂时失败'}).waitFor();assert.equal(await capacity.inputValue(),'999');await page.unroute('**/api/portal/factory');
  assert.equal((await save('保存产能与工艺')).status(),200);
  await page.reload();await dismissAlert();await capacity.waitFor();assert.equal(await capacity.inputValue(),'999');
  const removes=page.getByRole('button',{name:/^移除工艺：/});while(await removes.count())await removes.first().click();
  await page.getByRole('button',{name:'保存产能与工艺',exact:true}).click();await page.getByText('请至少选择或添加一项擅长工艺。',{exact:true}).waitFor();
  await page.getByText('从资料导入',{exact:false}).click();
  let releaseImport;const importGate=new Promise(resolve=>releaseImport=resolve);
  await page.route('**/api/portal/factory-import',async r=>{await importGate;await r.fulfill({json:{equipment:['智能针车 × 20'],process_capabilities:['立体裁剪','精细缝制'],dailyCapacity:180,categories:['运动鞋'],min_order_quantity:60}});});
  await page.getByLabel('上传工厂设备产能资料').setInputFiles({name:'capacity.png',mimeType:'image/png',buffer:png});await page.getByRole('button',{name:'一键识别 →'}).click();
  await tab('工厂档案与展示').click();releaseImport();await page.getByRole('status').filter({hasText:'工厂资料已回填'}).waitFor();
  await tab('产能与工艺').click();assert.equal(await capacity.inputValue(),'180');await page.getByRole('button',{name:'移除工艺：立体裁剪'}).waitFor();await save('保存产能与工艺');
  // Search/page/back navigation and notification targeting a nonfirst page.
  await tab('订单与排期').click();await page.waitForFunction(()=>document.querySelectorAll('.factory-orders tbody tr').length===10);
  await page.getByRole('searchbox',{name:'搜索订单'}).fill('TAB-00');await page.waitForFunction(()=>document.querySelectorAll('.factory-orders tbody tr').length===1);
  await page.reload();await dismissAlert();assert.equal(await page.getByRole('searchbox',{name:'搜索订单'}).inputValue(),'TAB-00');
  await page.locator('.factory-orders tbody button').first().click();await page.getByRole('dialog',{name:'订单需求详情'}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.factory-orders tbody button').first().evaluate(el=>el===document.activeElement),true);
  await page.getByRole('button',{name:'履约评价',exact:true}).click();const reviews=page.getByRole('dialog',{name:'履约评价'});await reviews.waitFor();assert.equal(await reviews.locator('.review').count(),6);await reviews.getByRole('button',{name:'下一页'}).click();assert.ok(await reviews.locator('.review').count()>=1);await page.keyboard.press('Escape');
  await tab('工厂概览').click();await page.getByRole('button',{name:/订单通知/}).click();await alert().locator('.order-alert-card').filter({hasText:'秋季补单 0'}).first().getByRole('button',{name:'查看详情',exact:true}).click();
  await page.waitForFunction(()=>document.activeElement?.id==='factory-order-TAB-00');assert.ok(page.url().includes('view=orders'));assert.ok(page.url().includes('page=3'));assert.equal(await page.getByRole('searchbox',{name:'搜索订单'}).inputValue(),'');
  await page.evaluate(()=>window.scrollTo(0,0));await page.getByRole('button',{name:/订单通知/}).click();await alert().locator('.order-alert-card').filter({hasText:'秋季补单 0'}).first().getByRole('button',{name:'查看详情',exact:true}).click();
  await page.waitForFunction(()=>document.activeElement?.id==='factory-order-TAB-00',null,{timeout:2500});
  await tab('产能与工艺').click();await tab('工厂档案与展示').click();await page.goBack();await capacity.waitFor();assert.ok(page.url().includes('view=capacity'));await page.goForward();await page.getByLabel('工厂介绍',{exact:true}).waitFor();
  await page.goto(base+'/factory?view=invalid');await dismissAlert();assert.equal(await tab('工厂概览').getAttribute('aria-current'),'page');
  // New factory may save only showcase, and must never inherit another account's draft.
  await page.getByRole('button',{name:'退出登录',exact:true}).click();await page.getByRole('button',{name:'注册账号',exact:true}).click();
  const registration=page.getByRole('dialog');await registration.getByLabel('工厂端',{exact:true}).check();await registration.getByLabel('账号 / 手机号').fill('factory_tabs_new');await registration.getByLabel('密码',{exact:true}).fill('123456');await registration.getByLabel('企业 / 主体名称').fill('新创制造');await registration.getByRole('button',{name:'注册并登录'}).click();await tab('工厂概览').waitFor();
  await tab('工厂档案与展示').click();assert.equal(await page.getByLabel('工厂介绍',{exact:true}).inputValue(),'');await page.getByLabel('工厂介绍',{exact:true}).fill('新工厂可先展示');assert.equal((await save('保存工厂档案')).status(),200);
  await tab('产能与工艺').click();assert.equal(await capacity.inputValue(),'0');
  await login('factory_01');await dismissAlert();
  const shots=path.join(__dirname,'../outputs/factory-tabs');fs.mkdirSync(shots,{recursive:true});
  while(await page.getByLabel('关闭提示').count())await page.getByLabel('关闭提示').first().click();
  for(const width of [1440,1280,1920,768,390,360]){
   await page.setViewportSize({width,height:900});
   for(const [view,label] of [['overview','工厂概览'],['orders','订单与排期'],['capacity','产能与工艺'],['showcase','工厂档案与展示']]){
    await tab(label).click();await page.waitForTimeout(100);
    const bounds=await page.evaluate(()=>({root:document.documentElement.scrollWidth>innerWidth,bad:[...document.querySelectorAll('.factory-workspace form,.factory-workspace input,.factory-workspace textarea,.factory-workspace .brand-table-wrap')].filter(el=>el.getClientRects().length).filter(el=>{const r=el.getBoundingClientRect();return r.right>innerWidth+1||r.left<0;}).map(el=>el.id||el.tagName)}));
    assert.deepEqual(bounds,{root:false,bad:[]},`${view} bounds at ${width}`);
    assert.ok(await page.locator('.factory-workspace .primary:visible').count()<=1,'one primary workspace action');
    await page.screenshot({path:path.join(shots,`${view}-${width}.png`),fullPage:true,animations:'disabled'});
   }
  }
  await page.emulateMedia({reducedMotion:'reduce'});await tab('工厂概览').click();assert.equal(await page.locator('.brand-hero').evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.deepEqual(errors,[]);console.log('PASS: four tabs, compact overview, drafts, independent saves, import across tabs, image persistence, failure/retry, IME, URL/search/paging/history, notification targeting, review drawer, new account isolation, 24 viewport captures, reduced motion.');
 }catch(e){if(page){await page.screenshot({path:'/tmp/factory-tabs-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-5000));}throw e;}finally{if(browser)await browser.close();server.kill();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
