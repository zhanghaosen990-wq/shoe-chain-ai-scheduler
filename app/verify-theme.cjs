// Read-only checks can target the actual running app: BASE_URL=http://localhost:4173.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 const external=process.env.BASE_URL,base=external||'http://localhost:4184';
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shoe-warm-ui-'));
 const shots=path.join(__dirname,'../outputs/warm-theme');fs.mkdirSync(shots,{recursive:true});
 const server=external?null:spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,PORT:'4184',PORTAL_STATE_FILE:path.join(dir,'state.json'),AI_PROVIDER:'openai',OPENAI_API_KEY:'unused-test-key'},stdio:['ignore','pipe','pipe']});
 let browser;
 try{
  if(server)await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('exit',code=>reject(Error('server '+code)));});
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],badAssets=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/app/')&&!r.ok())badAssets.push(r.url()+':'+r.status());});
  // All live business data is read-only. Profile sync returns an existing snapshot.
  const data=await (await page.request.get(base+'/api/portal')).json();
  await page.route('**/api/**',route=>{if(route.request().method()==='GET')return route.continue();if(route.request().url().endsWith('/api/portal/profile'))return route.fulfill({json:data});throw Error('Unexpected business write: '+route.request().url());});
  for(const resource of ['/app/styles.css','/app/ui/tokens.css','/app/ui/workspace.css','/app/ui/runtime.js','/app/ui/workspace.js','/app/portal/dist/main.css','/app/portal/dist/main.js'])assert.equal((await page.request.get(base+resource)).status(),200,resource+' must load from '+base);
  await page.goto(base+'/workspace');await page.locator('#factory-grid[aria-busy=false]').waitFor();
  assert.equal(await page.locator('.workflow-stepper ol').evaluate(el=>getComputedStyle(el).display),'flex','stepper is a single flex row');
  assert.equal(await page.locator('#bg-particles').count(),0,'BOM workspace has no decorative animation');
  async function login(user){await page.goto(base);await page.locator('.landing-hero').waitFor();if(await page.getByRole('button',{name:'退出登录',exact:true}).count())await page.getByRole('button',{name:'退出登录',exact:true}).click();await page.getByRole('button',{name:'登录',exact:true}).click();const dialog=page.getByRole('dialog',{name:'登录账号',exact:true});await dialog.getByLabel('账号 / 手机号').fill(user);await dialog.getByLabel('密码',{exact:true}).fill('123456');await dialog.getByRole('button',{name:'登录',exact:true}).click();await dialog.waitFor({state:'hidden'});}
  await page.goto(base);await page.locator('.landing-hero.is-ready').waitFor();
  await login('brand_01');
  async function bounds(surface,label){
    const result=await surface.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,bad:[...document.querySelectorAll('.panel,.card,.metric,.role-card,.workflow-stepper,.upload-panel,.form-grid,.photo-grid,.page-heading,.legacy-panel,iframe,input:not([type=file]),textarea,select')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden').filter(el=>{const r=el.getBoundingClientRect();return r.right>innerWidth+1||r.left< -1;}).map(el=>el.id||el.className||el.tagName)}));
    assert.ok(result.scroll<=result.width,label+' root overflow '+JSON.stringify(result));assert.deepEqual(result.bad,[],label+' content exceeds viewport');
  }
  for(const width of [360,390,768,1280,1440,1920]){
    await page.setViewportSize({width,height:1000});
    for(const route of ['/','/brand','/brand?view=publish','/profile/FAC-A','/workspace']){
      await page.goto(base+route);await page.locator(route==='/workspace'?'.workflow-stepper':'.portal-shell').waitFor();
      assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor),'rgb(249, 248, 246)');
      await bounds(page,route+' '+width);
      if(route!=='/')assert.equal(await page.locator('#bg-particles').count(),0,'particles only on homepage');
      if(route!='/workspace'){
        const header=await page.locator('.nav').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,height:el.getBoundingClientRect().height}));
        assert.equal(header.bg,'rgba(249, 248, 246, 0.92)');
        if(width>720)assert.equal(header.height,64,'shared desktop header height');
        if(route==='/brand')assert.equal(await page.locator('.brand-publish').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(37, 99, 235)');
      }

      if(route.includes('publish')||route==='/workspace'){
        const frame=route==='/workspace'?page:page.frames().find(f=>f.url().includes('/workspace'));await frame.locator('.workflow-stepper').waitFor();
        await bounds(frame,'BOM frame '+width);
        const steps=await frame.locator('[data-workflow-step]').evaluateAll(els=>els.map(el=>({top:el.getBoundingClientRect().top,right:el.getBoundingClientRect().right})));
        assert.equal(steps.length,4);assert.ok(Math.max(...steps.map(x=>x.top))-Math.min(...steps.map(x=>x.top))<2,'steps wrap at '+width);
        const card=await frame.locator('.intake-card').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,blur:getComputedStyle(el).backdropFilter,color:getComputedStyle(el).color}));
        assert.equal(card.bg,'rgb(255, 255, 255)');assert.equal(card.blur,'blur(12px)');assert.equal(card.color,'rgb(30, 41, 59)');
      }
      if(width===390||width===1440){const name=route==='/'?'landing-theme':route==='/workspace'?'workspace':route.includes('publish')?'publish':route==='/brand'?'brand':'profile';await page.screenshot({path:path.join(shots,name+'-'+width+'.png'),fullPage:route.includes('profile'),animations:'disabled'});}
    }
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base);await page.locator('.landing-hero.is-ready').waitFor();await page.waitForFunction(()=>document.querySelector('#bg-particles').dataset.animating==='false');
  await login('factory_01');const alert=page.getByRole('dialog');if(await alert.count())await page.keyboard.press('Escape');
  for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:1000});await bounds(page,'factory '+width);if(width===390||width===1440)await page.screenshot({path:path.join(shots,'factory-'+width+'.png')});}
  assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);console.log('PASS '+base+': all CSS/JS assets 200, single-row flex stepper, shape Canvas and reduced motion, warm white cards, six widths, parent and iframe bounds, no page errors; business requests read-only.');
 }finally{if(browser)await browser.close();if(server)server.kill();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
