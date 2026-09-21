import React, { useState, useEffect, useRef, useContext, createContext } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import './portal.css';
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
const list = text => text.split(/[\n；;]+/).map(x => x.trim()).filter(Boolean);
const statuses = { pending: '待工厂接单', production: '生产中', completed: '已完成', rejected: '已拒绝' };
const categories = ['商务男鞋', '休闲男鞋', '运动鞋', '女装', '女式晚礼服', '包袋'];
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
function Modal({ title, children, onClose }) {
  const ref = useRef();
  useEffect(() => { ref.current.showModal(); }, []);
  return <dialog ref={ref} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === ref.current) onClose(); }}><div className="modal-head"><h2>{title}</h2><button type="button" className="icon-button" aria-label="关闭弹窗" onClick={onClose}>×</button></div>{children}</dialog>;
}
function Stars({ value }) { return <span className="stars" aria-label={`${value} 星`}>{'★'.repeat(Math.round(value))}{'☆'.repeat(5 - Math.round(value))}</span>; }
function Metric({ title, value, note }) { return <article className="metric"><span>{title}</span><strong>{value}</strong><small>{note}</small></article>; }
function Tags({ values }) { return <div className="tags">{values.map(x => <span key={x}>{x}</span>)}</div>; }
function Empty({ children }) { return <div className="empty">{children}</div>; }

const auth = createAuth(localStorage);
function App() {
  const [rawData, setRawData] = useState(null), [error, setError] = useState('');
  const [account, setAccount] = useState(null), [ready, setReady] = useState(false);
  const [authMode, setAuthMode] = useState(null), [notice, setNotice] = useState(''), [editing, setEditing] = useState(false), [toast, setToast] = useState('');
  const navigate = useNavigate(), location = useLocation();
  const refreshVersion = useRef(0);
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
    auth.updateProfile(profile); ++refreshVersion.current; setData(next); setUser(auth.current());
  }
  useEffect(() => {
    let disposed=false;
    (async()=>{try { await auth.initialize(); if(disposed)return; const user=auth.current(); if(user)await syncUser(user); else await refresh(); }catch(e){setError(e.message);}finally{if(!disposed)setReady(true);}})();
    const timer=setInterval(refresh,15000), channel=new BroadcastChannel('shoe-portal');channel.onmessage=refresh;
    const storage=e=>{if(e.key===ORDER_CACHE||e.key==='shoe-feedback-v1'){refresh();return;}if(e.key==='shoe-session-v1'||e.key==='shoe-users-v1'){setUser(auth.current());refresh();}};
    const focus=()=>refresh(), visible=()=>{if(document.visibilityState==='visible')refresh();};
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visible);
    window.addEventListener('storage',storage);
    return ()=>{disposed=true;clearInterval(timer);channel.close();window.removeEventListener('storage',storage);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visible);};
  },[]);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(timer);},[toast]);
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
    else if(required!==account?.role){setToast('当前账号仅可访问自己的角色工作台');navigate(home(account),{replace:true});}
  },[ready,account?.id,location.pathname]);
  function enter(role){
    if(!account){openAuth('login','请先登录账号');return;}
    if(account?.role!==role)setToast('已为你进入当前账号对应的工作台');
    navigate(home(account));
  }
  async function authenticate(mode,input){
    const user=mode==='register'?await auth.register(input):await auth.login(input.username,input.password);
    try {await syncUser(user);}catch(e){auth.logout();setUser(null);throw Error('账号已保存，但工作台连接失败，请重新登录：'+e.message);}
    setAuthMode(null);navigate(home(user));setToast(mode==='register'?'注册成功，欢迎加入':'登录成功');
  }
  function logout(){loggingOut.current=true;auth.logout();setUser(null);setEditing(false);setAuthMode(null);navigate('/');setToast('已退出登录');}
  async function saveProfile(input){
    const profile={...account,...auth.validateProfile(input)};
    const next=await request('/api/portal/profile',account?.id,profile);
    const updated=auth.updateProfile(profile);setUser(updated);setData(next);setToast('企业资料已保存');
    const channel=new BroadcastChannel('shoe-portal');channel.postMessage('updated');channel.close();
  }
  async function mutate(path,payload){
    const actor=accountRef.current;if(!actor)throw Error('请先登录账号');
    const next=await request('/api/portal/'+path,actor.id,payload);
    if(accountRef.current?.id===actor.id){++refreshVersion.current;setData(next);if(path==='factory'){const updated=auth.updateProfile({...auth.current(),categories:payload.categories,description:payload.description});setUser(updated);}}
    const channel=new BroadcastChannel('shoe-portal');channel.postMessage('updated');channel.close();return next;
  }
  const profiles=ready?auth.profiles():[];
  const data=rawData&&{...rawData,brands:rawData.brands.map(p=>({...p,...profiles.find(u=>u.id===p.id),...(!profiles.find(u=>u.id===p.id)?.profileReady?{categories:p.categories,description:p.description}:{})})),factories:rawData.factories.map(p=>{const u=profiles.find(u=>u.id===p.id);return u?{...p,...u,...(!u.profileReady?{categories:p.categories,description:p.description}:{})}:p;})};
  const ctx={data,account,enter,refresh,mutate,notify:setToast,setData,editProfile:()=>setEditing(true)};
  return <Context.Provider value={ctx}><header className="nav"><Link to="/" className="logo"><span>S</span>鞋链智排<small>协同制造平台</small></Link><nav><button onClick={()=>enter('brand')}>品牌方</button><button onClick={()=>enter('factory')}>工厂端</button>{account&&<Link to={`/profile/${account?.id}`}>我的主页</Link>}</nav><div className="auth-nav">{ready&&data&&account?.role==='factory'&&<OrderAlerts key={account.id} data={data} account={account} mutate={mutate} refresh={refresh} notify={setToast} Modal={Modal}/ >}{account?<><details className="user-menu"><summary><span className="user-initial">{account.name[0]}</span><span className="company-name">{account.name}</span><span>⌄</span></summary><div><span>{account?.role==='brand'?'品牌方':'工厂端'} · {account.username}</span><Link to={`/profile/${account?.id}`}>我的主页</Link><button onClick={()=>setEditing(true)}>编辑企业资料</button></div></details><button className="text-button" onClick={logout}>退出登录</button></>:<><button className="secondary" disabled={!ready} onClick={()=>openAuth('login')}>登录</button><button className="primary" disabled={!ready} onClick={()=>openAuth('register')}>注册账号</button></>}</div></header>
    {error&&<div className="error-banner" role="alert">{error}<button onClick={refresh}>重试连接</button></div>}
    {!ready||!data?<Empty>正在连接协同工作台…</Empty>:<main className="portal-shell"><Routes><Route path="/" element={<Landing/>}/><Route path="/brand" element={account?.role==='brand'?<Brand key={account?.id}/>:<Empty>请先登录品牌方账号</Empty>}/><Route path="/factory" element={account?.role==='factory'?<Factory key={account?.id}/>:<Empty>请先登录工厂账号</Empty>}/><Route path="/profile/:id" element={<Profile/>}/><Route path="*" element={<Empty>页面不存在，<Link to="/">返回首页</Link></Empty>}/></Routes></main>}
    <footer>鞋链智排 · 永嘉鞋服小单快反协作平台<span>连接品牌需求与制造能力，让每一次合作更有价值。</span></footer>
    {authMode&&<AuthForm mode={authMode} onMode={setAuthMode} onSubmit={authenticate} onClose={()=>setAuthMode(null)} Modal={Modal} notice={notice}/>}
    {editing&&account&&<ProfileForm account={account} onSave={saveProfile} onClose={()=>setEditing(false)} Modal={Modal}/>}
    {toast&&<div className="toast" role="status">{toast}</div>}
  </Context.Provider>;
}
function Landing() {
  const { data, enter } = useApp();
  return <><section className="landing-hero"><span className="eyebrow">BRAND × FACTORY · SMALL BATCH, FAST RESPONSE</span><h1>让每一个好设计，<br/>遇见合适的制造伙伴。</h1><p>从一张设计单，到一份可执行的生产计划。<br/>连接品牌需求与工厂能力，让小单快反协作更简单。</p><div className="hero-tags"><span>智能需求解析</span><span>透明产能排期</span><span>合作评价沉淀</span></div><div className="orb" aria-hidden="true"><div>DESIGN<br/><b>↔</b><br/>MAKE</div></div></section>
    <section className="role-grid"><button className="role-card brand-entry" onClick={() => enter('brand')}><span className="role-icon">01 / BRAND</span><h2>我是品牌方 <span>↗</span></h2><p>发布生产需求，让 Agent 帮你找到合适的工厂。</p><div>导入 BOM · 智能排期 · 订单与评价</div><strong>进入品牌工作台 →</strong></button><button className="role-card factory-entry" onClick={() => enter('factory')}><span className="role-icon">02 / FACTORY</span><h2>我是工厂 <span>↗</span></h2><p>展示工艺优势与实时产能，建立长期合作信任。</p><div>资质入驻 · 产能管理 · 合作口碑</div><strong>进入工厂工作台 →</strong></button></section>
    <section className="network"><div><span className="eyebrow">CONNECTED PARTNERS</span><h2>协作，从彼此了解开始</h2><p>了解合作伙伴的工艺优势，找到适合你的制造能力。</p></div><div className="partner-links">{data.factories.map(f => <Link to={`/profile/${f.id}`} key={f.id}>{f.name} <span>↗</span></Link>)}</div></section></>;
}
function Reviews({ values, factoryNames = false }) {
  const { data, account, mutate, notify } = useApp();
  const [retrying,setRetrying]=useState('');
  async function retry(id){setRetrying(id);try{await mutate(`reviews/${id}/analyze`,{});}catch(e){notify(e.message);}finally{setRetrying('');}}
  return values.length ? <div className="review-list">{values.map(r => <article className="review" key={r.id}><div className="avatar">{data.brands.find(b => b.id === r.brandId)?.name.slice(0, 1)}</div><div><header><Link to={`/profile/${r.brandId}`}>{data.brands.find(b => b.id === r.brandId)?.name}</Link><time>{date(r.feedbackSubmittedAt||r.createdAt)}</time></header><Stars value={r.rating}/>{factoryNames && <Link className="review-target" to={`/profile/${r.factoryId}`}>评价工厂：{data.factories.find(f => f.id === r.factoryId)?.name}</Link>}<p>{r.comment||'未填写文字反馈'}</p>
    {isCompleteFeedback(r)?<><small className="muted">{DELIVERY[r.delivery].label} · 质量：{QUALITY[r.quality].label}（问卷估算）</small><div className="feedback-tags">{(r.tags||[]).map(t=><span key={t.label} className={t.type} title={`原文依据：${t.evidence}`}>#{t.label}<small>“{t.evidence}”</small></span>)}</div>{r.analysisStatus==='pending'&&<small className="muted">正在提炼评价标签…</small>}{r.analysisStatus==='failed'&&<small className="muted">标签暂未生成 {account?.id===r.brandId&&<button className="text-button" disabled={retrying===r.id} onClick={()=>retry(r.id)}>重试标签分析</button>}</small>}{r.analysisStatus==='skipped'&&<small className="muted">未填写文字反馈，已跳过标签分析</small>}{r.analysisStatus==='completed'&&!r.tags?.length&&<small className="muted">未提炼出有原文依据的标签</small>}</>:<small className="muted">{isSeedReview(r)?'示例评价 · 不计入履约指标':'历史评价 · 补填履约问卷后计入指标'}</small>}
  </div></article>)}</div> : <Empty>还没有合作评价，完成首单后留下真实体验。</Empty>;
}
function ReviewModal({ order, onClose }) {
  const { data, mutate, notify } = useApp();
  return <FeedbackForm order={order} previous={data.reviews.find(r=>r.orderId===order.id)} factoryName={data.factories.find(f=>f.id===order.factoryId)?.name} Modal={Modal} onClose={onClose} onSubmit={async input=>{await mutate('reviews',input);notify('履约反馈已保存，工厂指标已同步');}}/>;
}
function Orders({ orders, interactive = false, ownerRole }) {
  const { data, account, mutate, notify } = useApp();
  const [review,setReview]=useState(null),[detail,setDetail]=useState(null),[reassign,setReassign]=useState(null),[busy,setBusy]=useState('');
  async function complete(o){setBusy(o.id);try{await mutate('order-status',{orderId:o.id,status:'completed'});notify('订单已完成，现在可评价工厂');}catch(e){notify(e.message);}finally{setBusy('');}}
  return <>{!orders.length?<Empty>暂无订单。发布需求或等待品牌方发起合作。</Empty>:<div className="table-scroll"><table><thead><tr><th>订单 / 款式</th><th>合作伙伴</th><th>数量</th><th>状态</th><th>操作</th></tr></thead><tbody>{orders.map(o=>{
    const partner=(ownerRole||account?.role)==='factory'?data.brands.find(b=>b.id===o.brandId):data.factories.find(f=>f.id===o.factoryId);
    const rated=data.reviews.find(r=>r.orderId===o.id),ownBrand=interactive&&account?.id===o.brandId,ownFactory=interactive&&account?.id===o.factoryId;
    return <tr key={o.id} id={ownFactory?'factory-order-'+o.id:undefined} tabIndex={ownFactory?-1:undefined}><td><strong>{o.title}</strong><small>{date(o.createdAt)} · {o.id.slice(0,8)}</small>{o.rootDemandId&&<small>需求组 {o.rootDemandId.slice(0,8)}</small>}</td><td><Link to={`/profile/${partner.id}`}>{partner.name} ↗</Link></td><td>{o.quantity.toLocaleString()}</td><td><span className={`badge ${o.status}`}>{statuses[o.status]}</span>{o.reassignedBy&&<small>已重新分配</small>}</td><td><button className="text-button" onClick={()=>setDetail(o)}>{ownFactory&&o.status==='pending'?'查看需求 / 处理':'查看需求'}</button>{ownBrand&&o.status==='completed'&&<button className="primary feedback-entry" disabled={Boolean(rated&&(isCompleteFeedback(rated)||isSeedReview(rated)))} onClick={()=>setReview(o)}>{rated?(isSeedReview(rated)?'示例评价（不计入指标）':isCompleteFeedback(rated)?'已提交履约反馈':'补填履约问卷'):'填写履约反馈 / 评价工厂'}</button>}{ownBrand&&o.status==='production'&&<button className="text-button" disabled={busy===o.id} onClick={()=>complete(o)}>确认完成</button>}{ownBrand&&o.status==='rejected'&&!o.reassignedBy&&o.demand&&<button className="text-button" onClick={()=>setReassign({demand:o.demand,quantity:o.quantity,reassignOrderId:o.id,candidates:[],notice:`原工厂拒绝原因：${o.rejectionReason}。本次仅重新分配 ${o.quantity} 件/双。`})}>重新选择工厂</button>}</td></tr>;
  })}</tbody></table></div>}{review&&<ReviewModal order={review} onClose={()=>setReview(null)}/ >}{detail&&<OrderDetailsModal order={detail} data={data} account={interactive?account:null} mutate={mutate} notify={notify} onClose={()=>setDetail(null)} Modal={Modal}/ >}{reassign&&<AllocationModal proposal={reassign} data={data} onSubmit={async payload=>{await mutate('orders',payload);notify('被拒绝的数量已重新提交');}} onClose={()=>setReassign(null)} Modal={Modal}/ >}</>;
}
function Brand() {
  const { data, account, mutate, notify } = useApp();
  const [params, setParams] = useSearchParams();
  const publish = params.get('view') === 'publish';
  const [opened, setOpened] = useState(publish), [proposal, setProposal] = useState(null), [busy, setBusy] = useState(false);
  const frame = useRef();
  const orders = data.orders.filter(o => o.brandId === account?.id);
  const reviews = data.reviews.filter(r => r.brandId === account?.id);
  const partners = data.factories.filter(f => orders.some(o => o.factoryId === f.id));
  useEffect(() => { if (publish) setOpened(true); }, [publish]);
  useEffect(() => {
    const receive = e => { if (e.origin !== location.origin || e.source !== frame.current?.contentWindow || e.data?.type !== 'brand-order-proposal') return; if (!e.data.demand?.planning_context || !e.data.demand?.bom_data) return; setProposal({ requestId: e.data.requestId, demand: e.data.demand, candidates: Array.isArray(e.data.candidates) ? e.data.candidates : [], notice: e.data.notice }); };
    window.addEventListener('message', receive); return () => window.removeEventListener('message', receive);
  }, []);
  async function submitProposal(payload) { await mutate('orders', payload); frame.current?.contentWindow.postMessage({type:'brand-order-submitted',requestId:payload.requestId},location.origin); setParams({}); notify('需求已提交，所选工厂登录后可查看并决定是否接单'); }
  return <><div className="page-heading"><div><span className="eyebrow">BRAND WORKSPACE</span><h1>你好，{account.name}</h1><p>从需求发布到合作沉淀，每一笔订单都清晰可见。</p></div><button className="primary" onClick={() => setParams({ view: 'publish' })}>＋ 发布生产需求</button></div><div className="tabs"><button className={!publish ? 'selected' : ''} onClick={() => setParams({})}>品牌概览</button><button className={publish ? 'selected' : ''} onClick={() => setParams({ view: 'publish' })}>BOM 与 Agent 排期</button><Link to={`/profile/${account?.id}`}>查看品牌主页 ↗</Link></div>
    <div hidden={publish}><div className="metrics"><Metric title="历史发单" value={orders.length} note="当前账号订单"/><Metric title="合作中" value={orders.filter(o => o.status === 'production').length} note="已接单 / 生产中"/><Metric title="合作工厂" value={partners.length} note="建立过合作的工厂"/><Metric title="历史评价" value={reviews.length} note="完成订单后的合作反馈"/></div><section className="panel"><div className="panel-heading"><h2>历史发单记录</h2><span>完成订单后可评价</span></div><Orders orders={orders} interactive/></section><div className="two-columns"><section className="panel"><div className="panel-heading"><h2>合作伙伴</h2><span>{partners.length} 家工厂</span></div><div className="partner-list">{partners.map(f => <Link to={`/profile/${f.id}`} key={f.id}><div className="avatar">{f.name[0]}</div><div><strong>{f.name}</strong><small>{f.categories.join(' · ')}</small></div><span>↗</span></Link>)}</div></section><section className="panel"><div className="panel-heading"><h2>我给出的评价</h2></div><Reviews values={reviews} factoryNames/></section></div></div>
    {opened && <section hidden={!publish} className="legacy-panel"><div className="workspace-note">当前品牌：{account.name} · 分析后选择工厂并分配数量，再提交待工厂确认的需求；无需等待报价。</div><iframe title="品牌方 BOM 与 Agent 排期系统" ref={frame} src="/workspace"/></section>}
    {proposal && <AllocationModal proposal={proposal} data={data} onSubmit={submitProposal} onClose={() => setProposal(null)} Modal={Modal}/>}
  </>;
}
function FactoryMetrics({ factory }) {
  const a = factory.analytics, basis=`基于累计 ${a.feedbackCount} 笔品牌方履约反馈`;
  return <><div className="metrics"><Metric title="平均交货履约率" value={a.deliveryRate === null ? '暂无履约数据' : `${a.deliveryRate.toFixed(1)}%`} note="问卷按分单数量加权得分，非严格准时订单占比"/><Metric title="产品合格率" value={a.qualityRate === null ? '暂无履约数据' : `${a.qualityRate.toFixed(1)}%`} note="问卷估算 · 区间代表值按反馈笔数平均"/><Metric title="品牌方综合评分" value={a.rating === null ? '暂无履约数据' : `${a.rating.toFixed(1)} / 5`} note={`${a.feedbackCount} 笔完整问卷 · 星级算术平均`}/><Metric title="未来 10 天可用产能" value={`${a.available.toLocaleString()}`} note={`件/双 · 已排 ${a.booked} · 约 ${a.daysBooked ?? '—'} 天工作量；基于保存产能与生产中订单`}/></div><p className="muted feedback-summary">{basis}</p></>;
}
function Factory() {
  const { data, account, refresh } = useApp();
  const factory = data.factories.find(f => f.id === account?.id);
  return <><div className="page-heading"><div><span className="eyebrow">FACTORY WORKSPACE</span><h1>{factory.name}</h1><p>让生产能力被看见，让每一次合作留下口碑。</p></div><Link className="secondary" to={`/profile/${factory.id}`}>预览工厂主页 ↗</Link></div><div className="live-row"><span><i/>本地 API · 每 15 秒更新</span><small>更新于 {new Date(data.updatedAt).toLocaleTimeString('zh-CN')}</small><button className="text-button" onClick={refresh}>立即刷新 ↻</button></div><FactoryMetrics factory={factory}/><FactoryEditor key={factory.id} factory={factory}/><section className="panel"><div className="panel-heading"><h2>合作订单与排期</h2><span>接单后自动计入已排产能</span></div><Orders orders={data.orders.filter(o => o.factoryId === factory.id)} interactive/></section><section className="panel"><div className="panel-heading"><h2>合作品牌方评价</h2><span>已完成订单的合作反馈</span></div><Reviews values={data.reviews.filter(r => r.factoryId === factory.id)}/></section></>;
}
function FactoryEditor({ factory }) {
  const { mutate, notify, account } = useApp();
  const [draft, setDraft] = useState(() => ({ ...factory, equipment: factory.equipment.join('\n'), process_capabilities: factory.process_capabilities.join('\n') }));
  const [file, setFile] = useState(null), [recognizing, setRecognizing] = useState(false), [saving, setSaving] = useState(false), [reading, setReading] = useState(false), [error, setError] = useState(''), [extra, setExtra] = useState('');
  const controller = useRef(null), generation = useRef(0);
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);
  const update = (key, value) => setDraft(d => ({ ...d, [key]: value }));
  function selectFile(next) { generation.current++; controller.current?.abort(); setRecognizing(false); setFile(next); setError(''); }
  async function recognize() {
    if (!file || recognizing) return;
    const current = ++generation.current; controller.current = new AbortController(); setRecognizing(true); setError('');
    try {
      const form = new FormData(); form.append('file', file);
      const result = await request('/api/portal/factory-import', account?.id, form, controller.current.signal);
      if (current !== generation.current) return;
      setDraft(d => ({ ...d, ...(result.equipment.length ? { equipment: result.equipment.join('\n') } : {}), ...(result.process_capabilities.length ? { process_capabilities: result.process_capabilities.join('\n') } : {}), ...(result.categories.length ? { categories: result.categories.map(c => c === '晚礼服' ? '女式晚礼服' : c) } : {}), ...(result.dailyCapacity ? { dailyCapacity: result.dailyCapacity } : {}), ...(result.min_order_quantity ? { min_order_quantity: result.min_order_quantity } : {}) }));
      notify('工厂资料已回填，请校对后保存；未识别字段保留原值');
    } catch (e) { if (current === generation.current && e.name !== 'AbortError') setError(e.message); }
    finally { if (current === generation.current) setRecognizing(false); }
  }
  async function photos(files) {
    setError(''); const selected = Array.from(files);
    if (draft.images.length + selected.length > 6 || selected.some(f => !['image/jpeg','image/png'].includes(f.type) || f.size > 2 * 1024 * 1024)) { setError('最多 6 张 JPG/PNG，每张不超过 2MB。'); return; }
    setReading(true);
    try { const images = await Promise.all(selected.map(f => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(f); }))); setDraft(d => ({ ...d, images: [...d.images, ...images] })); } catch (e) { setError(e.message); } finally { setReading(false); }
  }
  async function save(e) { e.preventDefault(); setSaving(true); setError(''); try { await mutate('factory', { ...draft, equipment: list(draft.equipment), process_capabilities: list(draft.process_capabilities) }); notify('工厂资料已保存，主页和 Agent 工厂能力已同步'); } catch (e) { setError(e.message); } finally { setSaving(false); } }
  return <section className="panel"><div className="panel-heading"><div><span className="eyebrow">CAPABILITY PROFILE</span><h2>产能与优势入驻</h2></div><span>修改后保存生效</span></div><div className="import-box"><div><strong>设备 / 产能资料一键导入</strong><p>上传 XLSX、JPG 或 PNG，识别设备、工艺与日均产能，回填后可校对。</p><input aria-label="上传工厂设备产能资料" type="file" accept=".xlsx,.png,.jpg,.jpeg" disabled={saving} onChange={e => { const next = e.target.files[0]; if (next) { if (next.size > 20 * 1024 * 1024 || !/\.(xlsx|png|jpe?g)$/i.test(next.name)) setError('请选择 20MB 以内的 XLSX、JPG 或 PNG 文件'); else selectFile(next); } e.target.value = ''; }}/>{file && <div className="selected-file">{file.name}<button className="text-button" onClick={() => selectFile(null)}>移除</button></div>}</div><button className="primary" disabled={!file || recognizing || saving} onClick={recognize}>{recognizing ? '正在识别资料…' : '一键识别 →'}</button></div>
    <form onSubmit={save}><fieldset className="category-options"><legend>擅长品类 · 可多选</legend>{[...new Set([...categories, ...draft.categories])].map(c => <label key={c}><input type="checkbox" checked={draft.categories.includes(c)} onChange={e => update('categories', e.target.checked ? [...draft.categories, c] : draft.categories.filter(x => x !== c))}/><span>{c}</span></label>)}</fieldset><div className="custom-category"><input aria-label="其他擅长品类" maxLength={40} placeholder="其他品类" value={extra} onChange={e => setExtra(e.target.value)}/><button type="button" className="secondary" disabled={!extra.trim()} onClick={() => { update('categories', [...new Set([...draft.categories, extra.trim()])]); setExtra(''); }}>添加</button></div>
    <div className="form-grid"><label className="field">最小起订量（件/双）<input type="number" min="1" max="1000000" step="1" required value={draft.min_order_quantity} onChange={e => update('min_order_quantity', e.target.value)}/></label><label className="field">日均产能（件/双）<input type="number" min="1" max="1000000" step="1" required value={draft.dailyCapacity} onChange={e => update('dailyCapacity', e.target.value)}/></label><label className="field">设备清单<textarea rows={4} required value={draft.equipment} onChange={e => update('equipment', e.target.value)}/><small>每行一项，可填写设备数量</small></label><label className="field">擅长工艺<textarea rows={4} required value={draft.process_capabilities} onChange={e => update('process_capabilities', e.target.value)}/><small>每行一个核心工艺</small></label><label className="field full-width">工厂介绍<textarea rows={2} maxLength={600} value={draft.description} onChange={e => update('description', e.target.value)}/></label></div>
    <div className="photo-heading"><div><h3>产品细节与样衣图</h3><p>展示真实做工细节 · 最多 6 张 · 单张 2MB</p></div><label className="secondary upload-label">{reading ? '读取中…' : '＋ 添加细节图'}<input aria-label="上传产品细节图" type="file" accept="image/png,image/jpeg" multiple disabled={reading || saving} onChange={e => { photos(e.target.files); e.target.value = ''; }}/></label></div><div className="photo-grid">{draft.images.map((src, i) => <figure key={i}><img src={src} alt={`产品细节 ${i + 1}`}/><button type="button" aria-label={`删除细节图 ${i + 1}`} onClick={() => update('images', draft.images.filter((_, n) => n !== i))}>×</button></figure>)}</div>{!draft.images.length && <Empty>上传产品细节图，让品牌方更直观地了解你的做工。</Empty>}{error && <p className="form-error" role="alert">{error}</p>}<div className="save-row"><small>信息保存到本地 API，刷新页面仍会保留。</small><button className="primary" disabled={saving || recognizing || reading}>{saving ? '保存中…' : '保存工厂资料'}</button></div></form></section>;
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
