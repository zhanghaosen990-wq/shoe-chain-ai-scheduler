const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shoe-auth-'));
 const server=spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,AI_PROVIDER:'openai',OPENAI_API_KEY:'',PORT:'4174',PORTAL_STATE_FILE:path.join(dir,'state.json')},stdio:['ignore','pipe','pipe']});
 let browser;
 try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error('Server exited '+code)));});
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const base='http://localhost:4174';
  async function login(username,password='123456'){
   await page.getByRole('button',{name:'登录',exact:true}).click();
   await page.getByRole('dialog').getByLabel('账号 / 手机号').fill(username);
   await page.getByRole('dialog').getByLabel('密码',{exact:true}).fill(password);
   await page.getByRole('dialog').getByRole('button',{name:'登录',exact:true}).click();
   await page.getByRole('dialog').waitFor({state:'hidden'});
  }
  async function logout(){await page.getByRole('button',{name:'退出登录',exact:true}).click();await page.getByRole('button',{name:'注册账号',exact:true}).waitFor();}
  await page.goto(base+'/factory');await page.getByRole('dialog').waitFor();
  assert.ok((await page.getByRole('dialog').innerText()).includes('请先登录账号'));
  await page.getByLabel('关闭弹窗').click();
  assert.equal(await page.locator('select').count(),0);
  await page.getByRole('button',{name:/我是品牌方/}).click();await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').getByLabel('账号 / 手机号').fill('brand_01');
  await page.getByRole('dialog').getByLabel('密码',{exact:true}).fill('wrong');
  await page.getByRole('dialog').getByRole('button',{name:'登录',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'账号或密码不正确'}).waitFor();
  await page.getByRole('dialog').getByLabel('密码',{exact:true}).fill('123456');
  await page.getByRole('dialog').getByRole('button',{name:'登录',exact:true}).click();
  await page.getByRole('heading',{name:'你好，迈斯特时尚服饰'}).waitFor();
  await page.reload();await page.getByRole('heading',{name:'你好，迈斯特时尚服饰'}).waitFor();
  await page.goto(base+'/factory');await page.getByRole('heading',{name:'你好，迈斯特时尚服饰'}).waitFor();assert.equal(new URL(page.url()).pathname,'/brand');
  await page.getByRole('button',{name:'填写履约反馈 / 评价工厂',exact:true}).click();
  await page.getByRole('radio',{name:/按时/}).check();await page.getByRole('radio',{name:/完美/}).check();await page.getByRole('radio',{name:'5 ★'}).check();await page.getByPlaceholder('分享交期、工艺细节与沟通体验').fill('登录后的评价同步测试');
  await page.getByRole('button',{name:'提交履约反馈',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('link',{name:'我的主页',exact:true}).first().click();
  await page.getByRole('button',{name:'编辑企业资料',exact:true}).last().click();
  const modal=page.getByRole('dialog');
  await modal.getByLabel('企业名称',{exact:true}).fill('迈斯特品牌总部');
  await modal.getByLabel('联系人姓名').fill('陈女士');await modal.getByLabel('联系电话').fill('13800138000');
  await modal.getByLabel('主营品类').fill('运动鞋、女式晚礼服');await modal.getByLabel('优势说明').fill('专注原创设计与快反供应链');
  await modal.getByRole('button',{name:'保存资料',exact:true}).click();await modal.waitFor({state:'hidden'});
  await page.getByRole('heading',{name:'迈斯特品牌总部',exact:true}).waitFor();await page.getByText('联系电话：13800138000').waitFor();
  await page.reload();await page.getByRole('heading',{name:'迈斯特品牌总部',exact:true}).waitFor();
  await logout();await page.goto(base+'/brand');await page.getByRole('dialog').waitFor();await page.getByLabel('关闭弹窗').click();
  for(const [username,heading] of [['brand_02','你好，云端鞋履设计室'],['factory_01','瓯越精工鞋业有限公司'],['factory_02','楠江鞋业制造有限公司']]){
   await login(username);await page.getByRole('heading',{name:heading,exact:true}).waitFor();
   if(username==='factory_01')await page.getByText('登录后的评价同步测试').waitFor();
   await logout();
  }
  await page.getByRole('button',{name:'注册账号',exact:true}).click();
  await page.getByRole('dialog').getByLabel('工厂端',{exact:true}).check();
  await page.getByRole('dialog').getByLabel('账号 / 手机号').fill('factory_01');
  await page.getByRole('dialog').getByLabel('密码',{exact:true}).fill('123456');
  await page.getByRole('dialog').getByLabel('企业 / 主体名称').fill('新创制造');
  await page.getByRole('button',{name:'注册并登录',exact:true}).click();await page.getByRole('alert').filter({hasText:'该账号已注册'}).waitFor();
  await page.getByRole('dialog').getByLabel('账号 / 手机号').fill('new_factory');
  await page.getByRole('button',{name:'注册并登录',exact:true}).click();await page.getByRole('heading',{name:'新创制造',exact:true}).waitFor();
  assert.ok((await page.locator('.metrics').innerText()).includes('暂无履约数据'));
  await page.getByLabel('运动鞋',{exact:true}).check();
  await page.getByLabel('日均产能（件/双）',{exact:true}).fill('80');
  await page.getByLabel('设备清单').fill('针车 × 10');await page.getByLabel('擅长工艺',{exact:false}).fill('精细缝制');
  await page.getByRole('button',{name:'保存工厂资料',exact:true}).click();await page.getByRole('status').filter({hasText:'工厂资料已保存'}).waitFor();
  await page.reload();await page.getByRole('heading',{name:'新创制造',exact:true}).waitFor();assert.equal(await page.getByLabel('日均产能（件/双）',{exact:true}).inputValue(),'80');
  await page.screenshot({path:'/tmp/shoe-auth-factory.png',fullPage:true});
  await logout();await login('new_factory');await page.getByRole('heading',{name:'新创制造',exact:true}).waitFor();
  for(const width of [390,768]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await logout();await page.getByRole('button',{name:'注册账号',exact:true}).click();
  await page.getByRole('dialog').getByLabel('品牌方',{exact:true}).check();await page.getByRole('dialog').getByLabel('账号 / 手机号').fill('new_brand');await page.getByRole('dialog').getByLabel('密码',{exact:true}).fill('123456');await page.getByRole('dialog').getByLabel('企业 / 主体名称').fill('新创品牌');await page.getByRole('button',{name:'注册并登录',exact:true}).click();await page.getByRole('heading',{name:'你好，新创品牌'}).waitFor();
  assert.ok((await page.locator('.metrics').innerText()).includes('历史发单\n0'));
  assert.deepEqual(errors,[]);
  console.log('PASS: four seed logins, invalid credentials, register both roles, duplicate prevention, route guards, refresh/logout, profile persistence, review sync, new factory editing, mobile navigation.');
 }finally{if(browser)await browser.close();server.kill();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
