import React, { useState, useEffect, useRef, useContext, createContext } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import './portal.css';
import './landing.css';
import {BrandWorkspace} from './brand-workspace';
import {Status} from './workspace-status';
import {FactoryWorkspace} from './factory-workspace';
import './factory-workspace.css';
import {Modal, Empty, Skeleton, ParticleCanvas, notify} from './ui';
import {validBridgeMessage} from '../ui/runtime';
import { FeedbackForm } from './feedback-form';
import { calculateFeedback, isCompleteFeedback, isSeedReview, DELIVERY, QUALITY } from '../feedback';
import { OrderAlerts } from './order-alert';
import { cacheOrders, ORDER_CACHE } from './order-notifications';
import { AllocationModal, OrderDetailsModal } from './order-flow';
import { createAuth } from './auth';
import { AuthForm, ProfileForm } from './account-forms';

const Context = createContext();
const useApp = () => useContext(Context);
const date = value => new Date(value).toLocaleDateString('zh-CN');
const statuses = { pending: '待工厂接单', production: '生产中', completed: '已完成', rejected: '已拒绝' };
async function request(url, account, body, signal) {
  const options = { signal, headers: { 'X-Account-Id': account || '' } };
  if (body !== undefined) {
    options.method = 'POST';
    if (body instanceof FormData) options.body = body;
    else { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
  }
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '请求失败，请重试');
  return result;
}
function Stars({ value }) { return <span className="stars" aria-label={`${value} 星`}>{'★'.repeat(Math.round(value))}{'☆'.repeat(5 - Math.round(value))}</span>; }
function Metric({ title, value, note }) { return <article className="metric"><span>{title}</span><strong className={value==='暂无履约数据'?'metric-empty':undefined}>{value}</strong><small>{note}</small></article>; }
function Tags({ values }) { return <div className="tags">{values.map(x => <span key={x}>{x}</span>)}</div>; }


const auth = createAuth(localStorage);
function App() {
  const [rawData, setRawData] = useState(null), [error, setError] = useState('');
  const [account, setAccount] = useState(null), [ready, setReady] = useState(false);
  const [authMode, setAuthMode] = useState(null), [notice, setNotice] = useState(''), [editing, setEditing] = useState(false);
  const navigate = useNavigate(), location = useLocation();
  const refreshVersion = useRef(0);
  const [recovery,setRecovery]=useState(null);
  useEffect(()=>{
    const escape=e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]'))document.querySelectorAll('.user-menu[open]').forEach(el=>el.removeAttribute('open'));};
    const restore=e=>{if(e.detail?.accountId&&e.detail.accountId!==accountRef.current?.id)return;setAuthMode(null);setEditing(false);setRecovery({...e.detail,instance:crypto.randomUUID()});};
    document.addEventListener('keydown',escape);window.addEventListener('shoe-ui:restore',restore);
    return()=>{document.removeEventListener('keydown',escape);window.removeEventListener('shoe-ui:restore',restore);};
  },[]);
  function setData(next) {
    next={...next,factories:next.factories.map(f=>({...f,analytics:{...f.analytics,...calculateFeedback(next.reviews,f.id)}}))};
    cacheOrders(localStorage,next.orders);
    try { const cache=JSON.stringify({reviews:next.reviews,factories:next.factories.map(f=>({id:f.id,analytics:f.analytics}))});if(localStorage.getItem('shoe-feedback-v1')!==cache)localStorage.setItem('shoe-feedback-v1',cache); } catch {}
    setRawData(next);
  }
  const accountRef = useRef(null), loggingOut = useRef(false);
  const setUser = user => { accountRef.current = user; setAccount(user); };
  async function refresh() { const version=++refreshVersion.current; try { const next=await request('/api/portal'); if(version!==refreshVersion.current)return; setData(next); setError(''); } catch (e) { if(version===refreshVersion.current)setError(e.message); } }
  async function syncUser(user) {
    const data = await request('/api/portal');
    const previous = [...data.brands,...data.factories].find(p=>p.id===user.id);
    const profile = {...user, categories:user.profileReady?user.categories:(previous?.categories||user.categories), description:user.profileReady?user.description:(previous?.description||user.description)};
    const next = await request('/api/portal/profile',user.id,profile);
    auth.updateProfile(profile,user.id); if(auth.current()?.id===user.id){++refreshVersion.current;setData(next);setUser(auth.current());}
  }
  useEffect(() => {
    let disposed=false;
    (async()=>{try { await auth.initialize(); if(disposed)return; const user=auth.current(); if(user){setUser(user);await syncUser(user);} else await refresh(); }catch(e){setError(e.message);}finally{if(!disposed)setReady(true);}})();
    const timer=setInterval(refresh,15000), channel=new BroadcastChannel('shoe-portal');channel.onmessage=refresh;
    const storage=e=>{if(e.key===ORDER_CACHE||e.key==='shoe-feedback-v1'){refresh();return;}if(e.key==='shoe-session-v1'||e.key==='shoe-users-v1'){setUser(auth.current());refresh();}};
    const focus=()=>refresh(), visible=()=>{if(document.visibilityState==='visible')refresh();};
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visible);
    window.addEventListener('storage',storage);
    return ()=>{disposed=true;clearInterval(timer);channel.close();window.removeEventListener('storage',storage);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visible);};
  },[]);

  const hasPendingAnalysis=rawData?.reviews.some(r=>r.analysisStatus==='pending');
  useEffect(()=>{if(!hasPendingAnalysis)return;const timer=setInterval(refresh,2000);return()=>clearInterval(timer);},[hasPendingAnalysis]);
  const home=user=>user.role==='brand'?'/brand':'/factory';
  function openAuth(mode='login',message=''){setNotice(message);setAuthMode(mode);}
  useEffect(()=>{
    if(!ready)return;
    if(loggingOut.current){if(location.pathname==='/')loggingOut.current=false;return;}
    const required=location.pathname==='/brand'?'brand':location.pathname==='/factory'?'factory':null;
    if(!required)return;
    if(!account){openAuth('login','请先登录账号');navigate('/',{replace:true});}
    else if(required!==account?.role){notify('当前账号仅可访问自己的角色工作台');navigate(home(account),{replace:true});}
  },[ready,account?.id,location.pathname]);
  function enter(role){
    if(!account){openAuth('login','请先登录账号');return;}
    if(account?.role!==role)notify('已为你进入当前账号对应的工作台');
    navigate(home(account));
  }
  async function authenticate(mode,input){
    const user=mode==='register'?await auth.register(input):await auth.login(input.username,input.password);
    try {await syncUser(user);}catch(e){if(auth.current()?.id===user.id){auth.logout();setUser(null);}throw Error('账号已保存，但工作台连接失败，请重新登录：'+e.message);}
    if(auth.current()?.id!==user.id)return;
    navigate(home(user));notify(mode==='register'?'注册成功，欢迎加入':'登录成功');
  }
  function logout(){setRecovery(null);loggingOut.current=true;auth.logout();setUser(null);setEditing(false);setAuthMode(null);navigate('/');notify('已退出登录');}
  async function saveProfile(input){
    const profile={...account,...auth.validateProfile(input)};
    const next=await request('/api/portal/profile',account?.id,profile);
    const updated=auth.updateProfile(profile,profile.id);if(accountRef.current?.id===profile.id&&auth.current()?.id===profile.id){setUser(updated);setData(next);notify('企业资料已保存');}
    const channel=new BroadcastChannel('shoe-portal');channel.postMessage('updated');channel.close();
  }
  async function mutate(path,payload){
    const actor=accountRef.current;if(!actor)throw Error('请先登录账号');
    const next=await request('/api/portal/'+path,actor.id,payload);
    if(accountRef.current?.id===actor.id){++refreshVersion.current;setData(next);if(path==='factory'){const saved=next.factories.find(f=>f.id===actor.id);const updated=auth.updateProfile({...auth.current(),categories:saved.categories,description:saved.description});setUser(updated);}}
    const channel=new BroadcastChannel('shoe-portal');channel.postMessage('updated');channel.close();return next;
  }
  const profiles=ready?auth.profiles():[];
  const data=rawData&&{...rawData,brands:rawData.brands.map(p=>({...p,...profiles.find(u=>u.id===p.id),...(!profiles.find(u=>u.id===p.id)?.profileReady?{categories:p.categories,description:p.description}:{})})),factories:rawData.factories.map(p=>{const u=profiles.find(u=>u.id===p.id);return u?{...p,...u,...(!u.profileReady?{categories:p.categories,description:p.description}:{})}:p;})};
  const ctx={data,account,enter,refresh,mutate,notify,setData,saveProfile,editProfile:()=>setEditing(true)};
  return <Context.Provider value={ctx}><div className={location.pathname==='/'?'app-home':location.pathname==='/brand'?'app-workspace app-brand':location.pathname==='/factory'?'app-workspace app-factory':'app-workspace'}><header className="nav"><Link to="/" className="logo"><span>S</span>鞋链智排<small>协同制造平台</small></Link><nav><button onClick={()=>enter('brand')}>品牌方</button><button onClick={()=>enter('factory')}>工厂端</button>{account&&<Link to={`/profile/${account?.id}`}>我的主页</Link>}</nav><div className="auth-nav">{ready&&data&&account?.role==='factory'&&<OrderAlerts key={account.id} data={data} account={account} mutate={mutate} refresh={refresh} notify={notify} Modal={Modal}/ >}{account?<><details className="user-menu"><summary><span className="user-initial">{account.name[0]}</span><span className="company-name">{account.name}</span><span>⌄</span></summary><div><span>{account?.role==='brand'?'品牌方':'工厂端'} · {account.username}</span><Link to={`/profile/${account?.id}`}>我的主页</Link><button onClick={()=>setEditing(true)}>编辑企业资料</button></div></details><button className="text-button" onClick={logout}>退出登录</button></>:<><button className="secondary" disabled={!ready} onClick={()=>openAuth('login')}>登录</button><button className="primary" disabled={!ready} onClick={()=>openAuth('register')}>注册账号</button></>}</div></header>
    {error&&<div className="error-banner" role="alert">{error}<button onClick={refresh}>重试连接</button></div>}
    {!ready||!data?(error?<Empty action={<button className="secondary" onClick={refresh}>重新连接</button>}>暂时无法连接工作台，请稍后重试。</Empty>:<Skeleton/>):<main className="portal-shell"><Routes><Route path="/" element={<Landing/>}/><Route path="/brand" element={account?.role==='brand'?<Brand key={account?.id}/>:<Empty>请先登录品牌方账号</Empty>}/><Route path="/factory" element={account?.role==='factory'?<Factory key={account?.id}/>:<Empty>请先登录工厂账号</Empty>}/><Route path="/profile/:id" element={<Profile/>}/><Route path="*" element={<Empty>页面不存在，<Link to="/">返回首页</Link></Empty>}/></Routes></main>}
    <footer>鞋链智排 · 永嘉鞋服小单快反协作平台<span>连接品牌需求与制造能力，让每一次合作更有价值。</span></footer>
    {authMode&&<AuthForm key={authMode} mode={authMode} onMode={setAuthMode} onSubmit={authenticate} onClose={()=>setAuthMode(null)} Modal={Modal} notice={notice}/>}
    {recovery&&<Recovery key={recovery.instance} value={recovery} onClose={()=>setRecovery(null)} authenticate={authenticate}/> }
    {editing&&account&&<ProfileForm account={account} onSave={saveProfile} onClose={()=>setEditing(false)} Modal={Modal}/>}

  </div></Context.Provider>;
}
function Recovery({value,onClose,authenticate}) {
 const {data,account,mutate,notify,saveProfile}=useApp();
 const [recoveryMode,setRecoveryMode]=useState(value.mode);
 if(value.kind==='auth')return <AuthForm key={recoveryMode} mode={recoveryMode} onMode={setRecoveryMode} onSubmit={authenticate} onClose={onClose} Modal={Modal}/>;
 if(!account||account.id!==value.accountId)return null;
 const order=data.orders.find(o=>o.id===value.orderId);
 if(value.kind==='feedback'&&order)return <ReviewModal order={order} onClose={onClose}/>;
 if(value.kind==='order'&&order)return <OrderDetailsModal order={order} data={data} account={account} mutate={mutate} notify={notify} onClose={onClose} Modal={Modal}/>;
 if(value.kind==='allocation')return <AllocationModal proposal={value.proposal} data={data} onSubmit={async payload=>{await mutate('orders',payload);notify('需求已提交，等待工厂确认');window.dispatchEvent(new CustomEvent('shoe-ui:submitted',{detail:payload}));}} onClose={onClose} Modal={Modal}/>;
 if(value.kind==='profile')return <ProfileForm account={account} onSave={saveProfile} onClose={onClose} Modal={Modal}/>;
 return null;
}
function Landing() {
  const { data, enter } = useApp();
  const [settled,setSettled]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [skipped,setSkipped]=useState(false);
  const brandEntry=useRef(),why=useRef();
  useEffect(()=>{
    const finish=()=>setSettled(true);window.addEventListener('shoe-ui:landing-settled',finish);
    if(document.querySelector('#bg-particles')?.dataset.phase==='settled')finish();
    return()=>window.removeEventListener('shoe-ui:landing-settled',finish);
  },[]);
  useEffect(()=>{
    const section=why.current;
    if(!section||!('IntersectionObserver' in window))return;
    section.classList.add('is-enhanced');
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}}),{threshold:.12});
    section.querySelectorAll('[data-reveal]').forEach(el=>observer.observe(el));
    return()=>observer.disconnect();
  },[]);
  function skip(){window.dispatchEvent(new CustomEvent('shoe-ui:particle-settle'));setSettled(true);setSkipped(true);requestAnimationFrame(()=>brandEntry.current?.focus({preventScroll:true}));}
  return <>
    <section className={'landing-hero'+(settled?' is-ready':' is-converging')+(skipped?' intro-skipped':'')} aria-label="鞋链智排：连接设计与制造">
      <ParticleCanvas/>
      <div className="landing-particle-stage" aria-hidden="true"/>
      {!settled&&<button type="button" className="intro-skip" onClick={skip}>跳过动画 <span aria-hidden="true">↗</span></button>}
      <h1 className="particle-title"><span>让好设计，</span><span>遇见好制造。</span></h1>
      <div className="landing-details">
        <p className="landing-brand">鞋链智排<span>DESIGN MEETS POSSIBILITY</span></p>
        <p className="landing-description">从一张设计单，到值得信任的制造伙伴。<br/>让品牌需求与制造能力，在这里相遇。</p>
        <div className="hero-entries">
          <div><button ref={brandEntry} className="primary" onClick={()=>enter('brand')}>寻找制造伙伴 <span aria-hidden="true">↗</span></button><small>品牌方 · 发布生产需求</small></div>
          <div><button className="secondary" onClick={()=>enter('factory')}>承接品牌订单 <span aria-hidden="true">↗</span></button><small>工厂方 · 展示制造能力</small></div>
        </div>
      </div>
      <a href="#why-agent" className="explore-link">为什么我们的 Agent 不一样 <span aria-hidden="true">↓</span></a>
    </section>
    <section ref={why} className="landing-why" id="why-agent" aria-labelledby="why-title">
      <header className="why-heading" data-reveal>
        <span className="eyebrow">BUILT FOR REAL COLLABORATION</span>
        <h2 id="why-title">为什么我们的 AI 排期 Agent<em>不一样</em></h2>
        <p>不止给出一个答案，更让每一步协作有据可依。</p>
      </header>
      <div className="why-grid">
        <article className="why-card" data-reveal style={{'--reveal-delay':'0ms'}}>
          <div className="why-card-top"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M10 4H5v6M22 4h5v6M5 22v6h5M27 22v6h-5M10 12h12M10 17h8M10 22h10"/><path className="scan-line" d="M3 16h26"/></svg><span>01 / UNDERSTAND</span></div>
          <h3>BOM 极速解析，拒绝繁琐</h3>
          <p>减少繁重的 Excel 录入。支持图片与文档识别，将物料、工艺和生产需求整理成可核对、可编辑的信息。</p>
          <div className="why-proof"><span>非结构化资料</span><i aria-hidden="true">→</i><strong>清晰的生产需求</strong></div>
        </article>
        <article className="why-card" data-reveal style={{'--reveal-delay':'100ms'}}>
          <div className="why-card-top"><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="4" width="8" height="8" rx="2"/><rect x="21" y="20" width="8" height="8" rx="2"/><path d="M11 8h8a6 6 0 0 1 6 6v6M21 24H13a6 6 0 0 1-6-6v-6"/><circle cx="25" cy="8" r="2"/></svg><span>02 / MATCH</span></div>
          <h3>实时产能匹配，动态调度</h3>
          <p>结合工厂已更新的工艺、产能和排期，综合交期、履约记录与 MOQ 给出分配建议，让匹配依据与风险清楚可见。</p>
          <div className="why-proof"><span>工艺 · 产能 · 交期</span><i aria-hidden="true">→</i><strong>可解释的排期建议</strong></div>
        </article>
        <article className="why-card" data-reveal style={{'--reveal-delay':'200ms'}}>
          <div className="why-card-top"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="m16 3 11 4v9c0 6-6 10-11 13C11 26 5 22 5 16V7Z"/><path d="m10 16 4 4 8-9"/></svg><span>03 / TRUST</span></div>
          <h3>闭环履约评价，真实透明</h3>
          <p>以品牌方真实交付反馈沉淀履约记录，结合 AI 语义提炼展示合作体验，让每一次完成的订单成为下一次合作的参考。</p>
          <div className="why-proof"><span>真实订单反馈</span><i aria-hidden="true">→</i><strong>持续积累的信任</strong></div>
        </article>
      </div>
    </section>
    <section className="network"><div><span className="eyebrow">CONNECTED PARTNERS</span><h2>协作，从彼此了解开始</h2><p>了解合作伙伴的工艺优势，找到适合你的制造能力。</p></div><div className="partner-links">{data.factories.map(f=><Link to={`/profile/${f.id}`} key={f.id}>{f.name} <span>↗</span></Link>)}</div></section>
  </>;
}
function Reviews({ values, factoryNames = false }) {
  const { data, account, mutate, notify } = useApp();
  const [retrying,setRetrying]=useState('');
  async function retry(id){setRetrying(id);try{await mutate(`reviews/${id}/analyze`,{});}catch(e){notify(e.message,{type:'error'});}finally{setRetrying('');}}
  return values.length ? <div className="review-list">{values.map(r => <article className="review" key={r.id}><div className="avatar">{data.brands.find(b => b.id === r.brandId)?.name.slice(0, 1)}</div><div><header><Link to={`/profile/${r.brandId}`}>{data.brands.find(b => b.id === r.brandId)?.name}</Link><time>{date(r.feedbackSubmittedAt||r.createdAt)}</time></header><Stars value={r.rating}/>{factoryNames && <Link className="review-target" to={`/profile/${r.factoryId}`}>评价工厂：{data.factories.find(f => f.id === r.factoryId)?.name}</Link>}<p>{r.comment||'未填写文字反馈'}</p>
    {isCompleteFeedback(r)?<><small className="muted">{DELIVERY[r.delivery].label} · 质量：{QUALITY[r.quality].label}（问卷估算）</small><div className="feedback-tags">{(r.tags||[]).map(t=><span key={t.label} className={t.type} title={`原文依据：${t.evidence}`}>#{t.label}<small>“{t.evidence}”</small></span>)}</div>{r.analysisStatus==='pending'&&<small className="muted">正在提炼评价标签…</small>}{r.analysisStatus==='failed'&&<small className="muted">标签暂未生成 {account?.id===r.brandId&&<button className="text-button" disabled={retrying===r.id} onClick={()=>retry(r.id)}>重试标签分析</button>}</small>}{r.analysisStatus==='skipped'&&<small className="muted">未填写文字反馈，已跳过标签分析</small>}{r.analysisStatus==='completed'&&!r.tags?.length&&<small className="muted">未提炼出有原文依据的标签</small>}</>:<small className="muted">{isSeedReview(r)?'示例评价 · 不计入履约指标':'历史评价 · 补填履约问卷后计入指标'}</small>}
  </div></article>)}</div> : <Empty>还没有合作评价，完成首单后留下真实体验。</Empty>;
}
function ReviewModal({ order, onClose }) {
  const { data, mutate, notify } = useApp();

  return <FeedbackForm completed={isCompleteFeedback(data.reviews.find(r=>r.orderId===order.id)||{})} accountId={order.brandId} order={order} previous={data.reviews.find(r=>r.orderId===order.id)} factoryName={data.factories.find(f=>f.id===order.factoryId)?.name} Modal={Modal} onClose={onClose} onSubmit={async input=>{await mutate('reviews',input);notify('履约反馈已保存，工厂指标已同步');}}/>;
}
function Orders({ orders, interactive = false, ownerRole, workspace = false }) {
  const { data, account, mutate, notify } = useApp();
  const [review,setReview]=useState(null),[detail,setDetail]=useState(null),[reassign,setReassign]=useState(null),[busy,setBusy]=useState('');
  async function complete(o){setBusy(o.id);try{await mutate('order-status',{orderId:o.id,status:'completed'});notify('订单已完成，现在可评价工厂');}catch(e){notify(e.message,{type:'error'});}finally{setBusy('');}}
  return <>{!orders.length?<Empty action={account?.role==='brand'?<Link className="primary" to="/brand?view=publish">发布第一笔需求 →</Link>:null}>{account?.role==='factory'?'暂无待处理订单，新的合作邀约将在这里出现。':'每一次合作，都从一个好设计开始。'}</Empty>:<div className={workspace?"brand-table-wrap":"table-scroll"}><table className={workspace?"brand-order-table factory-order-table":undefined}><thead><tr><th>订单 / 款式</th><th>合作伙伴</th><th>数量</th><th>状态</th><th>操作</th></tr></thead><tbody>{orders.map(o=>{
    const partner=(ownerRole||account?.role)==='factory'?data.brands.find(b=>b.id===o.brandId):data.factories.find(f=>f.id===o.factoryId);
    const rated=data.reviews.find(r=>r.orderId===o.id),ownBrand=interactive&&account?.id===o.brandId,ownFactory=interactive&&account?.id===o.factoryId;
    return <tr key={o.id} id={ownFactory?'factory-order-'+o.id:undefined} tabIndex={ownFactory?-1:undefined}><td data-label="订单 / 款式"><strong>{o.title}</strong><small>{date(o.createdAt)} · {o.id.slice(0,8)}</small>{o.rootDemandId&&<small>需求组 {o.rootDemandId.slice(0,8)}</small>}</td><td data-label="合作伙伴"><Link to={`/profile/${partner.id}`}>{partner.name} ↗</Link></td><td data-label="数量">{o.quantity.toLocaleString()}</td><td data-label="状态"><>{workspace?<Status value={o.status}/>:<span className={`badge ${o.status}`}>{statuses[o.status]}</span>}</>{o.reassignedBy&&<small>已重新分配</small>}</td><td><button className="text-button" onClick={()=>setDetail(o)}>{ownFactory&&o.status==='pending'?'查看需求 / 处理':'查看需求'}</button>{ownBrand&&o.status==='completed'&&<button className="primary feedback-entry" disabled={Boolean(rated&&(isCompleteFeedback(rated)||isSeedReview(rated)))} onClick={()=>setReview(o)}>{rated?(isSeedReview(rated)?'示例评价（不计入指标）':isCompleteFeedback(rated)?'已提交履约反馈':'补填履约问卷'):'填写履约反馈 / 评价工厂'}</button>}{ownBrand&&o.status==='production'&&<button className="text-button" disabled={busy===o.id} onClick={()=>complete(o)}>确认完成</button>}{ownBrand&&o.status==='rejected'&&!o.reassignedBy&&o.demand&&<button className="text-button" onClick={()=>setReassign({demand:o.demand,quantity:o.quantity,reassignOrderId:o.id,candidates:[],notice:`原工厂拒绝原因：${o.rejectionReason}。本次仅重新分配 ${o.quantity} 件/双。`})}>重新选择工厂</button>}</td></tr>;
  })}</tbody></table></div>}{review&&<ReviewModal order={review} onClose={()=>setReview(null)}/ >}{detail&&<OrderDetailsModal order={data.orders.find(o=>o.id===detail.id)||detail} data={data} account={interactive?account:null} mutate={mutate} notify={notify} onClose={()=>setDetail(null)} Modal={Modal}/ >}{reassign&&<AllocationModal proposal={reassign} data={data} onSubmit={async payload=>{await mutate('orders',payload);notify('被拒绝的数量已重新提交');}} onClose={()=>setReassign(null)} Modal={Modal}/ >}</>;
}
function Brand() {
  const { data, account, mutate, notify } = useApp();
  const [params, setParams] = useSearchParams();
  const publish = params.get('view') === 'publish';
  const [opened, setOpened] = useState(publish), [proposal, setProposal] = useState(null);
  const frame = useRef();
  useEffect(() => { if (publish) setOpened(true); }, [publish]);
  useEffect(() => {
    const receive = e => { if(validBridgeMessage(e,location.origin,frame.current?.contentWindow)){if(e.data.type==='shoe-ui:height')frame.current.style.height=e.data.height+'px';if(e.data.type==='shoe-ui:toast')notify(e.data.message,{type:e.data.kind});if(e.data.type==='shoe-ui:scroll'){const top=frame.current.getBoundingClientRect().top+window.scrollY+e.data.top;window.scrollTo({top:Math.max(0,top-24),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}return;} if (e.origin !== location.origin || e.source !== frame.current?.contentWindow || e.data?.type !== 'brand-order-proposal') return; if (!e.data.demand?.planning_context || !e.data.demand?.bom_data) return; setProposal({ requestId: e.data.requestId, demand: e.data.demand, candidates: Array.isArray(e.data.candidates) ? e.data.candidates : [], notice: e.data.notice }); };
    const submitted=e=>frame.current?.contentWindow.postMessage({type:'brand-order-submitted',requestId:e.detail.requestId},location.origin);window.addEventListener('shoe-ui:submitted',submitted);window.addEventListener('message', receive); return () => {window.removeEventListener('message', receive);window.removeEventListener('shoe-ui:submitted',submitted);};
  }, []);
  useEffect(()=>{frame.current?.contentWindow?.postMessage({type:'shoe-ui:visibility',visible:publish},location.origin);},[publish]);
  async function submitProposal(payload) { await mutate('orders', payload); if(auth.current()?.id!==account.id)return;frame.current?.contentWindow.postMessage({type:'brand-order-submitted',requestId:payload.requestId},location.origin); setParams({}); notify('需求已提交，所选工厂登录后可查看并决定是否接单'); }
  return <BrandWorkspace data={data} account={account} mutate={mutate} notify={notify} ReviewModal={ReviewModal} Reviews={Reviews}>
    {opened && <section hidden={!publish} className="legacy-panel"><div className="workspace-note">当前品牌：{account.name} · 分析后选择工厂并分配数量，再提交待工厂确认的需求；无需等待报价。</div><iframe title="品牌方 BOM 与 Agent 排期系统" ref={frame} src="/workspace?embedded=1"/></section>}
    {proposal && <AllocationModal proposal={proposal} data={data} onSubmit={submitProposal} onClose={() => setProposal(null)} Modal={Modal}/>}
  </BrandWorkspace>;
}
function FactoryMetrics({ factory }) {
  const a = factory.analytics, basis=`基于累计 ${a.feedbackCount} 笔品牌方履约反馈`;
  return <><div className="metrics"><Metric title="平均交货履约率" value={a.deliveryRate === null ? '暂无履约数据' : `${a.deliveryRate.toFixed(1)}%`} note="问卷按分单数量加权得分，非严格准时订单占比"/><Metric title="产品合格率" value={a.qualityRate === null ? '暂无履约数据' : `${a.qualityRate.toFixed(1)}%`} note="问卷估算 · 区间代表值按反馈笔数平均"/><Metric title="品牌方综合评分" value={a.rating === null ? '暂无履约数据' : `${a.rating.toFixed(1)} / 5`} note={`${a.feedbackCount} 笔完整问卷 · 星级算术平均`}/><Metric title="未来 10 天可用产能" value={`${a.available.toLocaleString()}`} note={`件/双 · 已排 ${a.booked} · 约 ${a.daysBooked ?? '—'} 天工作量；基于保存产能与生产中订单`}/></div><p className="muted feedback-summary">{basis}</p></>;
}
function Factory() {
  const {data,account,mutate,notify}=useApp();
  return <FactoryWorkspace data={data} account={account} mutate={mutate} notify={notify} Reviews={Reviews} onImport={(body,signal)=>request('/api/portal/factory-import',account.id,body,signal)}/>;
}
function Profile() {
  const { id } = useParams();
  const { data, account, editProfile } = useApp();
  const profile = [...data.brands, ...data.factories].find(a => a.id === id);
  if (!profile) return <Empty>未找到该账号，<Link to="/">返回首页</Link></Empty>;
  const isFactory = profile.role === 'factory';
  const orders = data.orders.filter(o => isFactory ? o.factoryId === id : o.brandId === id);
  const reviews = data.reviews.filter(r => isFactory ? r.factoryId === id : r.brandId === id);
  return <><section className="profile-hero"><div className="profile-avatar">{profile.name[0]}</div><div><span className="eyebrow">{isFactory ? 'FACTORY PROFILE' : 'BRAND PROFILE'} </span><h1>{profile.name}</h1><p>{profile.location || profile.city} · {profile.description}</p><div className="profile-contact">{profile.contactName && <span>联系人：{profile.contactName}</span>}{profile.phone && <span>联系电话：{profile.phone}</span>}</div>{!isFactory && <Tags values={profile.categories || []}/>}{isFactory && <><Tags values={profile.categories}/><div className="profile-rating">{profile.analytics.rating === null ? '暂无评分' : <><Stars value={profile.analytics.rating}/><b>{profile.analytics.rating.toFixed(1)} / 5</b></>}<span>基于累计 {profile.analytics.feedbackCount} 笔品牌方履约反馈</span></div></>}</div>{profile.id === account?.id && <button className="secondary" onClick={editProfile}>编辑企业资料</button>}{profile.id === account?.id && <Link className="secondary" to={isFactory ? '/factory' : '/brand'}>进入我的工作台 →</Link>}</section>
    {isFactory ? <><FactoryMetrics factory={profile}/><div className="two-columns"><section className="panel"><h2>工厂能力档案</h2><dl className="profile-facts"><div><dt>最小起订量</dt><dd>{profile.min_order_quantity} 件/双</dd></div><div><dt>日均产能</dt><dd>{profile.dailyCapacity} 件/双</dd></div></dl><h3>核心工艺</h3><Tags values={profile.process_capabilities}/><h3>设备清单</h3><ul className="equipment-list">{profile.equipment.map((x, i) => <li key={i}>{x}</li>)}</ul></section><section className="panel"><h2>做工与产品细节</h2>{profile.images.length ? <div className="photo-grid profile-photos">{profile.images.map((src, i) => <figure key={i}><img src={src} alt={`工厂产品细节 ${i + 1}`}/></figure>)}</div> : <Empty>工厂尚未上传产品细节图。</Empty>}</section></div></> : <section className="panel"><div className="panel-heading"><h2>历史发单与合作工厂</h2><span>{orders.length} 笔订单</span></div><Orders orders={orders} ownerRole={profile.role} interactive={account?.id === id}/></section>}
    <section className="panel"><div className="panel-heading"><h2>{isFactory ? '合作品牌方评价' : '对合作工厂的历史评价'}</h2><span>{reviews.length} 条合作反馈</span></div><Reviews values={reviews} factoryNames={!isFactory}/></section>
  </>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>);
