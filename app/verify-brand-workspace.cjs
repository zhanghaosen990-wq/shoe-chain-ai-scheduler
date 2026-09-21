// Real API + isolated data: never writes to the user's demo orders.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createStore}=require('./portal-store');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'brand-workspace-'));
 const stateFile=path.join(dir,'state.json'),state=createStore(stateFile).snapshot();
 for(let i=0;i<24;i++)state.orders.push({id:`WORK-${String(i).padStart(2,'0')}`,brandId:'BRAND-A',factoryId:i%2?'FAC-A':'FAC-B',title:`秋季补单 ${String(i).padStart(2,'0')}`,quantity:100+i,status:i%2?'pending':'production',createdAt:`2026-09-${String(11+Math.floor(i/3)).padStart(2,'0')}T09:00:00Z`});
 fs.writeFileSync(stateFile,JSON.stringify(state));
 const server=spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,PORT:'4186',PORTAL_STATE_FILE:stateFile,AI_PROVIDER:'openai',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});
 let browser,page;
 try {
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',c=>reject(Error(`server ${c}`)));});
  browser=await chromium.launch({channel:'chrome',headless:true});
  page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];
  page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  const base='http://localhost:4186';
  await page.goto(base);await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByLabel('账号 / 手机号').fill('brand_01');await page.getByLabel('密码',{exact:true}).fill('123456');await page.getByRole('dialog').getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('navigation',{name:'品牌工作台导航'}).waitFor();
  assert.equal(await page.locator('.brand-order-table tbody tr').count(),5,'overview caps recent orders');
  assert.equal(await page.locator('.brand-active-number').innerText(),'25');
  await page.locator('.brand-active').click();await page.getByRole('button',{name:/^进行中\s*25$/}).waitFor();assert.ok(page.url().includes('status=active'));await page.getByRole('button',{name:'品牌概览',exact:true}).click();await page.getByRole('button',{name:'查看生产中订单',exact:true}).click();
  assert.ok(page.url().includes('status=production'));
  await page.waitForFunction(()=>document.querySelectorAll('.brand-order-table tbody tr').length===10);
  assert.deepEqual(await page.locator('.brand-order-table .brand-status').allTextContents(),Array(10).fill('生产中'));
  await page.getByRole('button',{name:'下一页',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.brand-order-table tbody tr').length===3);
  const before=page.url();await page.locator('.brand-order-table .brand-order-open').first().click();
  await page.locator('dialog.brand-drawer').waitFor();await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(page.url(),before);
  assert.equal(await page.locator('.brand-order-open').first().evaluate(el=>el===document.activeElement),true);
  await page.getByRole('searchbox',{name:'搜索订单'}).fill('不存在的订单');
  await page.getByText('没有找到匹配的订单').waitFor();
  await page.getByRole('button',{name:'清除筛选',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.brand-order-table tbody tr').length===10);
  await page.getByRole('searchbox',{name:'搜索订单'}).fill('WORK-23');
  await page.waitForFunction(()=>document.querySelectorAll('.brand-order-table tbody tr').length===1);
  await page.reload();await page.getByRole('searchbox',{name:'搜索订单'}).waitFor();assert.equal(await page.getByRole('searchbox',{name:'搜索订单'}).inputValue(),'WORK-23');
  await page.getByRole('button',{name:'品牌概览',exact:true}).click();
  await page.getByRole('button',{name:'填写履约反馈 / 评价工厂',exact:true}).click();
  await page.getByRole('radio',{name:'5 ★'}).check();await page.getByRole('radio',{name:/按时/}).check();await page.getByRole('radio',{name:/完美/}).check();
  await page.getByRole('button',{name:'提交履约反馈',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByText('当前没有待处理事项').waitFor();
  await page.getByRole('button',{name:'履约评价',exact:true}).click();await page.getByText('按时 / 提前交付',{exact:false}).waitFor();
  await page.getByRole('button',{name:'合作工厂',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.brand-partner').length===2);
  await page.getByRole('button',{name:/发布生产需求/}).click();const frame=page.frameLocator('iframe');await frame.locator('#bom-style-name').fill('保留品牌草稿');
  await page.getByRole('button',{name:'品牌概览',exact:true}).click();await page.getByRole('button',{name:/发布生产需求/}).click();assert.equal(await frame.locator('#bom-style-name').inputValue(),'保留品牌草稿');
  await page.getByRole('button',{name:'品牌概览',exact:true}).click();await page.locator('.brand-overview').waitFor();
  for(const toast of await page.getByLabel('关闭提示').all())await toast.click();
  const screenshots=path.join(__dirname,'../outputs/brand-workspace');fs.mkdirSync(screenshots,{recursive:true});
  for(const width of [1440,1280,1920,768,390]){
   await page.setViewportSize({width,height:width===1280?800:1000});
   await page.screenshot({path:path.join(screenshots,`overview-${width}.png`),fullPage:true,animations:'disabled'});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overview overflow ${width}`);
   await page.getByRole('button',{name:'订单管理',exact:true}).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`orders overflow ${width}`);
   await page.locator('.brand-order-open').first().click();await page.locator('dialog.brand-drawer').waitFor();
   assert.equal(await page.locator('dialog.brand-drawer').evaluate(el=>el.scrollWidth>el.clientWidth),false,`drawer overflow ${width}`);
   await page.keyboard.press('Escape');await page.getByRole('button',{name:'品牌概览',exact:true}).click();await page.locator('.brand-overview').waitFor();
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.locator('.brand-hero').waitFor();
  assert.equal(await page.locator('.brand-hero').evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.getByRole('button',{name:'退出登录',exact:true}).click();
  await page.locator('.app-brand').waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);
  console.log('PASS: overview counts, status drill-down, search, pagination, URL restoration, drawer focus, feedback submission, partners, retained BOM draft, five viewports, reduced motion, no browser errors.');
 }catch(e){console.error(e);if(page){await page.screenshot({path:'/tmp/brand-workspace-failure.png',fullPage:true,animations:'disabled'});console.error(await page.locator('body').innerText());}throw e;}finally{if(browser)await browser.close();server.kill();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
