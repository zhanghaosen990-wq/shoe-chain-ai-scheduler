// NODE_PATH=<runtime>/node_modules node app/verify-portal.cjs
// Uses a separate server and temporary data; never changes demo account data.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
(async () => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(),'portal-ui-'));
 const server = spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,AI_PROVIDER:'openai',OPENAI_API_KEY:'',PORT:'4174',PORTAL_STATE_FILE:path.join(dir,'state.json')},stdio:['ignore','pipe','pipe']});
 let browser;
 try {
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error('Server exited '+code)));});
  browser = await chromium.launch({channel:'chrome',headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1100}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base='http://localhost:4174';
  await page.goto(base);await page.getByRole('button',{name:/我是品牌方/}).waitFor();
  await page.screenshot({path:'/tmp/shoe-portal-landing.png',fullPage:true});
  async function switchAccount(username) {
    if(await page.getByRole('button',{name:'退出登录',exact:true}).count())await page.getByRole('button',{name:'退出登录',exact:true}).click();
    await page.getByRole('button',{name:'登录',exact:true}).click();
    const dialog=page.getByRole('dialog');await dialog.getByLabel('账号 / 手机号').fill(username);await dialog.getByLabel('密码',{exact:true}).fill('123456');await dialog.getByRole('button',{name:'登录',exact:true}).click();await dialog.waitFor({state:'hidden'});
  }
  await switchAccount('brand_01');
  await page.getByRole('button',{name:'发布生产需求',exact:false}).click();
  await page.frameLocator('iframe').locator('#factory-grid').waitFor();
  assert.ok(page.url().endsWith('/brand?view=publish'));
  await page.getByRole('button',{name:'品牌概览',exact:true}).click();
  await page.getByRole('button',{name:'填写履约反馈 / 评价工厂',exact:true}).click();
  await page.getByRole('radio',{name:'3 ★'}).check();await page.getByRole('radio',{name:/按时/}).check();await page.getByRole('radio',{name:/完美/}).check();
  await page.getByPlaceholder('分享交期、工艺细节与沟通体验').fill('浏览器验证：交付及时，细节沟通顺畅。');
  await page.getByRole('button',{name:'提交履约反馈',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.goto(base+'/profile/FAC-A');
  await page.getByText('浏览器验证：交付及时，细节沟通顺畅。').waitFor();
  assert.ok((await page.locator('.profile-rating').innerText()).includes('3.0 / 5'));
  await switchAccount('factory_02');
  await page.getByRole('heading',{name:'楠江鞋业制造有限公司',exact:true}).waitFor();
  await page.goto(base+'/profile/BRAND-A');
  const table = await page.locator('table').innerText();
  assert.ok(table.includes('瓯越精工鞋业')); assert.ok(table.includes('楠江鞋业制造有限公司'));
  await switchAccount('factory_01');
  await page.getByLabel('日均产能（件/双）', {exact:true}).fill('120');
  await page.getByLabel('最小起订量（件/双）', {exact:true}).fill('50');
  await page.getByLabel('女式晚礼服',{exact:true}).check();
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1sAAAAASUVORK5CYII=','base64');
  await page.getByLabel('上传产品细节图').setInputFiles([{name:'detail.png',mimeType:'image/png',buffer:png}]);
  await page.getByAltText('产品细节 1',{exact:true}).waitFor();
  await page.getByRole('button',{name:'保存工厂资料',exact:true}).click();
  await page.getByRole('status').filter({hasText:'工厂资料已保存'}).waitFor();
  await page.reload();await page.getByAltText('产品细节 1',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('日均产能（件/双）',{exact:true}).inputValue(),'120');
  // Mock only the external recognition response; verify user-controlled upload, fill and save flow.
  await page.route('**/api/portal/factory-import',route=>route.fulfill({json:{equipment:['智能针车 × 20'],process_capabilities:['精细缝制'],dailyCapacity:150,categories:['女式晚礼服'],min_order_quantity:60}}));
  await page.getByLabel('上传工厂设备产能资料').setInputFiles({name:'capacity.png',mimeType:'image/png',buffer:png});
  await page.getByRole('button',{name:'一键识别 →'}).click();
  await page.getByRole('status').filter({hasText:'工厂资料已回填'}).waitFor();
  assert.equal(await page.getByLabel('日均产能（件/双）',{exact:true}).inputValue(),'150');
  assert.equal(await page.locator('textarea').first().inputValue(),'智能针车 × 20');
  await page.screenshot({path:'/tmp/shoe-portal-factory.png',fullPage:true});
  for (const width of [390,768]) {
   await page.setViewportSize({width,height:844});
   for(const route of ['/','/factory','/profile/FAC-A','/profile/BRAND-B']) {
    await page.goto(base+route);await page.locator('.portal-shell').waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${route} overflows at ${width}`);
   }
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: landing, embedded brand flow, account switching, review sync, profile partners, factory save, photo persistence, import UI, direct routes, responsive layouts, no browser errors.');
 } finally {if(browser) await browser.close();server.kill();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
