// Homepage behavior verification. Uses a separate server and only reads business data.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shoe-shapes-')),base=process.env.BASE_URL||'http://localhost:4187';
 const server=process.env.BASE_URL?null:spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,PORT:'4187',PORTAL_STATE_FILE:path.join(dir,'state.json'),AI_PROVIDER:'openai',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});
 const shots=path.join(__dirname,'../outputs/warm-theme');fs.mkdirSync(shots,{recursive:true});let browser,page;
 try{
  if(server)await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',c=>reject(Error('server '+c)));});
  browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>{assert.equal(route.request().method(),'GET');return route.continue();});
  await page.goto(base);await page.waitForFunction(()=>document.querySelector('#bg-particles')?.dataset.ready==='true');
  const canvas=page.locator('#bg-particles');
  assert.equal(await page.locator('.particle-title span').first().evaluate(el=>getComputedStyle(el).color),'rgb(30, 41, 59)','title must be real visible DOM even while particles converge');
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.landing-details')).opacity)>.99);
  assert.equal(await canvas.getAttribute('data-phase'),'converging','entrances finish before particle convergence');
  assert.equal(await page.locator('.landing-details').evaluate(el=>el.inert),false);
  const titleText=await page.locator('.particle-title').innerText();assert.equal(titleText,'让好设计，\n遇见好制造。');
  await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.querySelector('#bg-particles').dataset.phase==='settled');
  assert.equal(await canvas.getAttribute('data-particle-count'),'900');
  await page.screenshot({path:path.join(shots,'landing-shoe-1440.png')});
  const before=await canvas.evaluate(el=>el.toDataURL()),stage=await page.locator('.landing-particle-stage').boundingBox();
  await page.mouse.move(stage.x+stage.width*.4,stage.y+stage.height*.55,{steps:10});
  await page.waitForFunction(()=>Number(document.querySelector('#bg-particles').dataset.pointerMoves)>0);
  await page.waitForFunction(previous=>document.querySelector('#bg-particles').toDataURL()!==previous,before);
  await page.mouse.move(4,4);
  await page.waitForFunction(()=>document.querySelector('#bg-particles').dataset.formation==='network',null,{timeout:15000});
  await page.screenshot({path:path.join(shots,'landing-network-1440.png')});
  await page.locator('.explore-link').click();await page.locator('.why-card.is-visible').first().waitFor();
  // At 1000px the following section is shorter than the viewport, so the hero cannot fully exit.
  await page.setViewportSize({width:1440,height:800});
  await page.evaluate(()=>window.scrollTo({top:document.querySelector('.landing-hero').getBoundingClientRect().bottom+window.scrollY+1,behavior:'instant'}));
  await page.waitForFunction(()=>document.querySelector('#bg-particles').dataset.animating==='false');
  assert.equal(await page.locator('.why-heading').evaluate(el=>getComputedStyle(el).filter),'none');
  assert.ok(await canvas.evaluate(el=>el.getBoundingClientRect().bottom<=1),'canvas must leave with hero');
  await page.screenshot({path:path.join(shots,'landing-story-1440.png'),animations:'disabled'});
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.waitForFunction(()=>document.querySelector('#bg-particles').dataset.animating==='true');
  await page.reload();await page.getByRole('button',{name:/跳过动画/}).click();
  await page.waitForFunction(()=>document.activeElement?.matches('.hero-entries .primary'));
  assert.equal(await canvas.getAttribute('data-phase'),'settled');
  for(const size of [{width:390,height:844},{width:768,height:1000},{width:1280,height:800},{width:1440,height:900},{width:1920,height:1080},{width:1440,height:500}]){
   await page.setViewportSize(size);await page.goto(base);await page.getByRole('button',{name:/跳过动画/}).click();
   await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.landing-details')).opacity)>.99);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'overflow '+size.width);
   const bounds=await page.locator('.particle-title').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=size.width+1);
   const button=await page.locator('.hero-entries .primary').boundingBox();assert.ok(button.y>=0&&button.y+button.height<=size.height,'entry visible '+JSON.stringify(size));
   await page.screenshot({path:path.join(shots,`landing-${size.width}x${size.height}.png`),animations:'disabled'});
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base);await page.waitForFunction(()=>document.querySelector('#bg-particles')?.dataset.ready==='true');
  assert.equal(await canvas.getAttribute('data-animating'),'false');
  assert.equal(await page.locator('.particle-title span').first().evaluate(el=>getComputedStyle(el).animationName),'none');
  const still=await canvas.evaluate(el=>el.toDataURL());await page.mouse.move(500,200);assert.equal(await canvas.evaluate(el=>el.toDataURL()),still);
  const noCanvas=await browser.newPage();await noCanvas.addInitScript(()=>{HTMLCanvasElement.prototype.getContext=()=>null;});await noCanvas.goto(base);
  await noCanvas.getByRole('button',{name:/寻找制造伙伴/}).waitFor();
  assert.notEqual(await noCanvas.locator('.particle-title span').first().evaluate(el=>getComputedStyle(el).color),'rgba(0, 0, 0, 0)');
  await noCanvas.getByRole('button',{name:/寻找制造伙伴/}).click();await noCanvas.getByRole('dialog').waitFor();await noCanvas.close();
  assert.deepEqual(errors,[]);console.log('PASS: clear independent DOM entrance, early usable controls, shoe/network morph, pointer response, offscreen pause/resume, skip focus, six viewport/short-screen cases, reduced motion, Canvas failure fallback.');
 }catch(e){if(page)await page.screenshot({path:path.join(shots,'landing-failure.png'),fullPage:true});throw e;}finally{if(browser)await browser.close();server?.kill();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
