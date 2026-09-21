// Isolated end-to-end coverage for the shared UI and demo workflow.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shoe-experience-'));
 const screenshots=path.join(__dirname,'../outputs/frontend-experience');fs.mkdirSync(screenshots,{recursive:true});
 const server=spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,AI_PROVIDER:'openai',OPENAI_API_KEY:'test-disabled',PORT:'4180',PORTAL_STATE_FILE:path.join(dir,'state.json')},stdio:['ignore','pipe','pipe']});
 let browser;const errors=[];
 try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('exit',code=>reject(Error('server '+code)));server.stderr.on('data',d=>errors.push(String(d)));});
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('pageerror',e=>errors.push(e.message));
  const base='http://localhost:4180';
  let releaseInitial;await page.route('**/api/portal',async route=>{await new Promise(r=>releaseInitial=r);await route.continue();});
  await page.goto(base);await page.locator('.loading-shell[aria-busy=true]').waitFor();const initialLoaded=page.waitForResponse(r=>r.url().endsWith('/api/portal'));releaseInitial();await initialLoaded;await page.unroute('**/api/portal');await page.locator('.landing-hero').waitFor();
  await page.screenshot({path:path.join(screenshots,'landing-desktop.png'),fullPage:true});
  await page.addScriptTag({url:base+'/app/ui/runtime.js'});await page.evaluate(()=>{window.testToasts=ShoeUI.mountNotifications();testToasts.notify('第一条提示');});
  const firstToast=page.getByRole('status').filter({hasText:'第一条提示'});await firstToast.getByLabel('关闭提示').focus();await page.evaluate(()=>testToasts.notify('第二条提示'));
  assert.equal(await firstToast.getByLabel('关闭提示').evaluate(el=>el===document.activeElement),true,'new toast preserves keyboard focus');await page.evaluate(()=>testToasts.destroy());
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('canvas').dataset.animating==='false',{},{timeout:3000}).catch(async e=>{console.error('Motion diagnostic',await page.evaluate(()=>({media:matchMedia('(prefers-reduced-motion: reduce)').matches,canvas:document.querySelector('canvas').outerHTML})),errors);throw e;});
  await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByLabel('账号 / 手机号').fill('brand_01');await page.getByLabel('密码',{exact:true}).fill('123456');let finishLogin;await page.route('**/api/portal/profile',async route=>{await new Promise(r=>finishLogin=r);await route.fulfill({response:await route.fetch()});});
  await page.getByLabel('密码',{exact:true}).press('Enter');await page.getByRole('button',{name:'正在处理…'}).waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden',timeout:3000}).catch(async e=>{console.error('Escape diagnostic',await page.evaluate(()=>({active:document.activeElement?.outerHTML,dialogs:[...document.querySelectorAll('dialog')].map(el=>el.outerHTML.slice(0,350)),popovers:[...document.querySelectorAll(':popover-open')].map(el=>el.outerHTML.slice(0,200))})),errors);throw e;});await page.getByRole('button',{name:'登录',exact:true}).click();finishLogin();await page.getByRole('dialog').waitFor({state:'hidden'});await page.unroute('**/api/portal/profile');
  await page.screenshot({path:path.join(screenshots,'brand-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:/发布生产需求/}).click();const frame=page.frameLocator('iframe');await frame.locator('[data-workflow-step="1"][aria-current="step"]').waitFor();
  await frame.locator('#bom-style-name').fill('保留我的草稿');
  await frame.locator('#fill-demo').click();await frame.locator('#bom-status').filter({hasText:'演示数据'}).waitFor();
  assert.equal(await frame.locator('#quantity').inputValue(),'800');assert.ok(await frame.locator('#demo-bom-preview').evaluate(el=>el.complete&&el.naturalWidth>0));
  await frame.locator('[data-workflow-step="3"][aria-current="step"]').waitFor();
  await page.getByRole('status').filter({hasText:'演示图片与 BOM 已填入'}).waitFor();assert.equal(await frame.locator('.toast-message').count(),0);
  await frame.locator('#undo-demo').click();assert.equal(await frame.locator('#bom-style-name').inputValue(),'保留我的草稿');assert.equal(await frame.locator('#sample-preview img').count(),0);
  await frame.locator('#demo-kind').selectOption('apparel');await frame.locator('#fill-demo').click();await frame.locator('#bom-status').filter({hasText:'演示数据'}).waitFor();assert.equal(await frame.locator('#category').inputValue(),'女装');
  await page.screenshot({path:path.join(screenshots,'publish-desktop.png'),fullPage:true});
  // Real recognition failure remains visible; demo must not fake recognition success.
  await page.route('**/api/bom/parse',route=>route.fulfill({status:503,json:{error:'测试识别服务暂不可用'}}));
  await frame.locator('#start-bom-recognition').click();await frame.locator('#bom-status').filter({hasText:'识别失败'}).waitFor();assert.equal(await frame.locator('#bom-style-name').inputValue(),'云影 · 通勤连衣裙');
  // A slow recognition response must not replace a newer manual edit.
  let releaseParse;await page.route('**/api/bom/parse',async route=>{await new Promise(r=>releaseParse=r);await route.fulfill({json:{bom_data:{style_name:'不应回写',sku_code:'STALE',craftsmanship:'旧工艺'}}}).catch(()=>{});});
  await frame.locator('#start-bom-recognition').click();await frame.locator('#bom-loading').waitFor();await frame.locator('#bom-style-name').fill('最新手动修改');releaseParse();await frame.locator('#bom-status').filter({hasText:'待识别'}).waitFor();assert.equal(await frame.locator('#bom-style-name').inputValue(),'最新手动修改');
  // Close a submitting feedback form, reopen while pending, fail, restore draft, retry once.
  await page.getByRole('button',{name:'品牌概览',exact:true}).click();
  const reviewedTitle=await page.locator('.brand-attention-list article').filter({has:page.getByRole('button',{name:'填写履约反馈 / 评价工厂',exact:true})}).locator('h3').innerText();
  await page.getByRole('button',{name:'填写履约反馈 / 评价工厂',exact:true}).click();
  await page.getByRole('button',{name:'一键填入演示数据',exact:true}).click();assert.equal(await page.getByRole('radio',{name:'4 ★'}).isChecked(),true);
  await page.getByPlaceholder('分享交期、工艺细节与沟通体验').fill('需要恢复的评价草稿');
  let release,submits=0;await page.route('**/api/portal/reviews',async route=>{submits++;await new Promise(r=>release=r);await route.fulfill({status:503,json:{error:'测试评价保存失败'}});});
  await page.getByRole('button',{name:'提交履约反馈',exact:true}).click();await page.getByRole('button',{name:'提交中…'}).waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'填写履约反馈 / 评价工厂',exact:true}).click();assert.equal(await page.getByRole('button',{name:'提交中…'}).isDisabled(),true);await page.keyboard.press('Escape');release();
  await page.getByRole('alert').filter({hasText:'测试评价保存失败'}).waitFor();await page.getByRole('button',{name:'重新打开',exact:true}).click();assert.equal(await page.getByPlaceholder('分享交期、工艺细节与沟通体验').inputValue(),'需要恢复的评价草稿');assert.equal(submits,1);
  await page.screenshot({path:path.join(screenshots,'feedback-desktop.png')});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(screenshots,'feedback-mobile.png')});
  // Multiline input and IME confirmation do not submit.
  const comment=page.getByPlaceholder('分享交期、工艺细节与沟通体验');await comment.press('End');await comment.press('Enter');assert.ok((await comment.inputValue()).includes('\n'));assert.equal(submits,1);
  await page.unroute('**/api/portal/reviews');let finishReview;await page.route('**/api/portal/reviews',async route=>{submits++;await new Promise(r=>finishReview=r);await route.fulfill({response:await route.fetch()});});
  // Tag analysis is unrelated to this UI test, skip it with an empty comment.
  await comment.fill('');await page.getByRole('button',{name:'提交履约反馈',exact:true}).click();await page.getByRole('button',{name:'提交中…'}).waitFor();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'填写履约反馈 / 评价工厂',exact:true}).click();finishReview();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(submits,2);
  await page.getByRole('button',{name:`查看需求：${reviewedTitle}`,exact:true}).click();
  const submitted=page.getByRole('dialog').getByRole('button',{name:'已提交履约反馈',exact:true});await submitted.waitFor();assert.equal(await submitted.isDisabled(),true);
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:1440,height:1100});
  for(const width of [360,390,768,1280,1440]){
   await page.setViewportSize({width,height:900});
   for(const route of ['/','/brand','/brand?view=publish','/profile/FAC-A']){
    await page.goto(base+route);await page.locator('.portal-shell').waitFor();
    if(route.includes('publish')){await page.frameLocator('iframe').locator('.workflow-stepper').waitFor();await page.waitForFunction(()=>parseInt(document.querySelector('iframe').style.height)>1000);}
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,route+' overflow '+width);
    if(width===390)await page.screenshot({path:path.join(screenshots,(route==='/'?'landing':route.includes('publish')?'publish':route.includes('profile')?'profile':'brand')+'-mobile.png'),fullPage:true});
   }
  }
  await page.goto(base+'/brand');await page.getByRole('button',{name:'退出登录',exact:true}).click();
  await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByLabel('账号 / 手机号').fill('factory_01');await page.getByLabel('密码',{exact:true}).fill('123456');await page.getByRole('dialog').getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  for(const width of [360,390,768,1280,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'factory overflow '+width);if(width===390||width===1440)await page.screenshot({path:path.join(screenshots,'factory-'+(width===390?'mobile':'desktop')+'.png'),fullPage:true});}
  await page.route('**/api/portal',route=>route.fulfill({status:503,json:{error:'测试连接失败'}}));await page.reload();await page.getByText('暂时无法连接工作台，请稍后重试。').waitFor();assert.equal(await page.locator('.loading-shell').count(),0);await page.unroute('**/api/portal');await page.getByRole('button',{name:'重新连接',exact:true}).click();await page.locator('.portal-shell').waitFor();
  await page.goto(base+'/workspace');await page.locator('#fill-demo').waitFor();await page.locator('#fill-demo').click();await page.locator('.toast-message').filter({hasText:'演示图片与 BOM'}).waitFor();assert.equal(await page.locator('#bom-status').innerText(),'演示数据 · 预置结果');
  for(const asset of ['/app/assets/demo-shoe.png','/app/assets/demo-apparel.png']){const response=await page.request.get(base+asset);assert.equal(response.status(),200);assert.equal(response.headers()['content-type'],'image/png');}
  assert.equal((await page.request.get(base+'/app/server.js')).status(),404);
  assert.deepEqual(errors,[]);console.log('PASS: demos and undo, honest parse failure, stale response isolation, detached feedback with draft recovery and deduplication, trusted iframe toast/height, reduced motion, five viewport sizes and static allowlist.');
 }finally{if(browser)await browser.close();server.kill();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
