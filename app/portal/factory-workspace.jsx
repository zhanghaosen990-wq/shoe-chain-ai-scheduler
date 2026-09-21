import React,{useEffect,useRef,useState} from 'react';
import {Link,useLocation,useSearchParams} from 'react-router-dom';
import {Modal} from './ui';
import {Status} from './workspace-status';
import {OrderDetailsModal} from './order-flow';
import {CapacityEditor,ShowcaseEditor} from './factory-editors';
import {ORDER_STATES,pageItems} from './brand-workspace-data';
import {factoryOrders,previewOrders,filterFactoryOrders,orderPageFor} from './factory-workspace-data';
import './factory-workspace.css';

const tabs=[['overview','工厂概览'],['orders','订单与排期'],['capacity','产能与工艺'],['showcase','工厂档案与展示']];
const date=value=>new Date(value).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'});
const deadline=order=>order.demand?.planning_context?.deadline_days?`${order.demand.planning_context.deadline_days} 天`:'未提供';
function Drawer(props){return <Modal {...props} className="brand-drawer"/>;}
function Pagination({result,onChange}){
  if(result.pages<=1)return null;
  return <div className="brand-pagination"><span>共 {result.total} 条</span><div><button type="button" aria-label="上一页" disabled={result.page===1} onClick={()=>onChange(result.page-1)}>←</button><span aria-live="polite">{result.page} / {result.pages}</span><button type="button" aria-label="下一页" disabled={result.page===result.pages} onClick={()=>onChange(result.page+1)}>→</button></div></div>;
}
function OrderTable({orders,brands,onOpen,preview=false}){
  if(!orders.length)return <p className="factory-empty">暂无订单，新的合作将在这里出现。</p>;
  return <div className="brand-table-wrap"><table className="brand-order-table factory-order-table"><thead><tr><th>订单 / 款式</th><th>合作品牌</th><th>数量</th><th>状态</th><th>目标交期</th><th><span className="brand-sr-only">操作</span></th></tr></thead><tbody>{orders.map(order=>{
    const brand=brands.find(b=>b.id===order.brandId);
    return <tr key={order.id} id={!preview?`factory-order-${order.id}`:undefined} tabIndex={!preview?-1:undefined}><td><strong title={order.title}>{order.title}</strong><small>{date(order.updatedAt||order.createdAt)} · {order.id.slice(0,12)}</small><small className="factory-mobile-meta">{brand?.name||'未提供'} · {order.quantity.toLocaleString()} 件/双 · {deadline(order)}</small></td><td><Link to={`/profile/${order.brandId}`} title={brand?.name}>{brand?.name||'未提供'}</Link></td><td>{order.quantity.toLocaleString()}<small>件 / 双</small></td><td><Status value={order.status}/></td><td>{deadline(order)}</td><td><button type="button" className="factory-open-order" aria-label={`查看需求：${order.title}`} onClick={()=>onOpen(order.id)}>查看<span aria-hidden="true"> ↗</span></button></td></tr>;
  })}</tbody></table></div>;
}
function Metrics({factory}){
  const a=factory.analytics;
  const metrics=[['平均交货履约率',a.deliveryRate===null?'—':`${a.deliveryRate.toFixed(1)}%`,a.deliveryRate===null?'暂无履约数据':`${a.feedbackCount} 笔完整反馈`],['产品合格率',a.qualityRate===null?'—':`${a.qualityRate.toFixed(1)}%`,a.qualityRate===null?'暂无履约数据':'品牌问卷估算'],['品牌综合评分',a.rating===null?'—':a.rating.toFixed(1),a.rating===null?'暂无履约数据':'满分 5 分'],['未来 10 天可用产能',a.available.toLocaleString(),'件 / 双']];
  return <section className="factory-overview" aria-labelledby="factory-metrics-title"><div className="factory-view-heading"><h2 id="factory-metrics-title">履约与产能概况</h2><span className="brand-update"><i/>自动同步</span></div><div className="metrics">{metrics.map(([title,value,note])=><article className="metric" key={title}><span>{title}</span><strong>{value}</strong><small>{note}</small></article>)}</div><details className="factory-metric-help"><summary>指标口径</summary><p>交货履约率按分单数量加权，并非严格准时订单占比；合格率为问卷区间代表值的平均数，并非实测抽检结果；星级按完整反馈等权平均。当前累计 {a.feedbackCount} 笔完整反馈。未来 10 天可用产能以已保存日均产能扣除生产中订单数量计算。</p></details></section>;
}

export function FactoryWorkspace({data,account,mutate,notify,onImport,Reviews}){
  const factory=data.factories.find(f=>f.id===account.id);
  const [params,setParams]=useSearchParams();
  const location=useLocation();
  const requested=params.get('view')||'overview',view=tabs.some(([id])=>id===requested)?requested:'overview';
  const [visited,setVisited]=useState(()=>({[view]:true}));
  const [capacityStatus,setCapacityStatus]=useState({busy:false,dirty:false}),[showcaseStatus,setShowcaseStatus]=useState({busy:false,dirty:false});
  const [detailId,setDetailId]=useState(null),[showReviews,setShowReviews]=useState(false),[reviewPage,setReviewPage]=useState(1),[targetError,setTargetError]=useState('');
  const nav=useRef(),viewRef=useRef(view),lastOrderParams=useRef({}),targetKey=useRef('');
  const [indicator,setIndicator]=useState({});
  const ownOrders=factoryOrders(data.orders,account.id);
  const status=ORDER_STATES.some(s=>s.id===params.get('status'))?params.get('status'):'all',query=params.get('q')||'';
  const result=pageItems(filterFactoryOrders(ownOrders,data.brands,{status,query}),params.get('page'),10);
  const target=params.get('order'),targetPage=target?orderPageFor(ownOrders,target):null;
  const reviews=pageItems(data.reviews.filter(r=>r.factoryId===account.id).sort((a,b)=>(Date.parse(b.feedbackSubmittedAt||b.createdAt)||0)-(Date.parse(a.feedbackSubmittedAt||a.createdAt)||0)),reviewPage,6);
  const detail=ownOrders.find(o=>o.id===detailId);
  const busy=capacityStatus.busy||showcaseStatus.busy;
  useEffect(()=>{setVisited(previous=>previous[view]?previous:{...previous,[view]:true});if(viewRef.current!==view){window.scrollTo({top:0,behavior:'instant'});setDetailId(null);setShowReviews(false);viewRef.current=view;}},[view]);
  useEffect(()=>{
    const measure=()=>{const el=nav.current?.querySelector('[aria-current="page"]');setIndicator(el?{width:el.offsetWidth,transform:`translateX(${el.offsetLeft}px)`,opacity:1}:{});};
    measure();const observer=new ResizeObserver(measure);if(nav.current)observer.observe(nav.current);return()=>observer.disconnect();
  },[view]);
  useEffect(()=>{if(view==='orders'){const next=Object.fromEntries(params);delete next.order;lastOrderParams.current=next;}},[params,view]);
  useEffect(()=>{if(requested!==view)setParams({}, {replace:true});},[requested,view,setParams]);
  useEffect(()=>{
    if(view!=='orders'||!target){targetKey.current='';setTargetError('');return;}
    if(targetPage===null){setTargetError('该订单不存在或不属于当前工厂。');return;}
    if(status!=='all'||query||result.page!==targetPage){setParams({view:'orders',page:String(targetPage),order:target},{replace:true});return;}
    const key=`${location.key}:${target}:${targetPage}`;if(targetKey.current===key)return;
    const frame=requestAnimationFrame(()=>{const row=document.getElementById(`factory-order-${target}`);if(row){row.focus({preventScroll:true});row.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});targetKey.current=key;setTargetError('');}});return()=>cancelAnimationFrame(frame);
  },[view,target,targetPage,status,query,result.page,setParams,location.key]);
  function changeView(next){setParams(next==='overview'?{}:next==='orders'?{...lastOrderParams.current,view:next}:{view:next});}
  function updateOrders(patch){const next={...Object.fromEntries(params),view:'orders',...patch};delete next.order;for(const key of Object.keys(next))if(next[key]===''||next[key]===null||next[key]==='all')delete next[key];setParams(next,{replace:Object.hasOwn(patch,'q')});}
  const save=payload=>mutate('factory',payload);
  const forms={capacity:'factory-capacity-form',showcase:'factory-showcase-form'};
  const labels={capacity:capacityStatus.busy?'处理中…':'保存产能与工艺',showcase:showcaseStatus.busy?'处理中…':'保存工厂档案'};
  return <div className="factory-workspace factory-tabbed">
    <header className="brand-hero"><div><div className="brand-kicker"><span>工厂工作台</span></div><h1>{factory.name}</h1><p>让制造有序，让合作从容。</p></div><div className="factory-hero-actions">{view==='overview'&&<button className="primary brand-publish" onClick={()=>{changeView('capacity');requestAnimationFrame(()=>document.querySelector('#factory-capacity-form input')?.focus({preventScroll:true}));}}>更新产能资料</button>}{forms[view]&&<button className="primary brand-publish" type="submit" form={forms[view]} disabled={busy}>{labels[view]}</button>}<Link className="brand-profile-link" to={`/profile/${factory.id}`}>工厂主页 <span aria-hidden="true">↗</span></Link></div></header>
    <div className="brand-nav-row factory-nav-row"><nav ref={nav} className="brand-nav" aria-label="工厂工作台导航"><span className="brand-nav-indicator" style={indicator} aria-hidden="true"/>{tabs.map(([id,label])=><button key={id} type="button" aria-current={view===id?'page':undefined} onClick={()=>changeView(id)}>{label}</button>)}</nav></div>
    {view==='overview'&&<div className="brand-view factory-overview-view"><Metrics factory={factory}/><section className="factory-recent"><div className="factory-view-heading"><h2>近期订单</h2><button className="brand-link" onClick={()=>changeView('orders')}>查看全部 <span aria-hidden="true">↗</span></button></div><OrderTable orders={previewOrders(ownOrders)} brands={data.brands} onOpen={setDetailId} preview/></section></div>}
    {view==='orders'&&<section className="brand-view factory-orders"><div className="factory-view-heading"><div><h2>订单与排期</h2><p className="factory-schedule-summary">{ownOrders.filter(o=>o.status==='pending').length} 笔待接单 · {ownOrders.filter(o=>o.status==='production').length} 笔生产中 · 已排 {factory.analytics.booked.toLocaleString()} 件/双 · 约 {factory.analytics.daysBooked??'—'} 天工作量</p></div><button className="brand-link" onClick={()=>{setReviewPage(1);setShowReviews(true);}}>履约评价 <span aria-hidden="true">↗</span></button></div><div className="brand-order-toolbar"><div className="brand-filters" aria-label="订单状态筛选">{[{id:'all',label:'全部'},...ORDER_STATES].map(s=><button type="button" key={s.id} aria-pressed={status===s.id} onClick={()=>updateOrders({status:s.id,page:null})}>{s.label}</button>)}</div><label className="brand-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="搜索订单" placeholder="搜索订单、款式或品牌" value={query} onChange={e=>updateOrders({q:e.target.value,page:null})}/></label></div>{targetError&&<p role="alert" className="form-error">{targetError}</p>}{!result.items.length&&ownOrders.length?<div className="factory-empty"><p>没有找到匹配的订单</p><button className="brand-link" onClick={()=>setParams({view:'orders'})}>清除筛选</button></div>:<OrderTable orders={result.items} brands={data.brands} onOpen={setDetailId}/>}<Pagination result={result} onChange={page=>updateOrders({page:String(page)})}/></section>}
    {(visited.capacity||view==='capacity')&&<div hidden={view!=='capacity'} className="factory-editor-view"><CapacityEditor factory={factory} onSave={save} onImport={onImport} onStatus={setCapacityStatus} notify={notify} blocked={showcaseStatus.busy}/></div>}
    {(visited.showcase||view==='showcase')&&<div hidden={view!=='showcase'} className="factory-editor-view"><ShowcaseEditor factory={factory} onSave={save} onStatus={setShowcaseStatus} notify={notify} blocked={capacityStatus.busy}/></div>}
    {detail&&<OrderDetailsModal order={detail} data={data} account={account} mutate={mutate} notify={notify} Modal={Drawer} onClose={()=>setDetailId(null)}/>}
    {showReviews&&<Drawer title="履约评价" onClose={()=>setShowReviews(false)}><Reviews values={reviews.items}/><Pagination result={reviews} onChange={setReviewPage}/></Drawer>}
  </div>;
}
