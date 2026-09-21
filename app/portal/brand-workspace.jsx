import React,{useEffect,useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {Modal,Empty} from './ui';
import {OrderDetailsModal,AllocationModal} from './order-flow';
import {isCompleteFeedback,isSeedReview} from '../feedback';
import {ORDER_STATES,getBrandSummary,filterOrders,pageItems} from './brand-workspace-data';
import './brand-workspace.css';
import {Status} from './workspace-status';

const tabs=[['overview','品牌概览'],['orders','订单管理'],['partners','合作工厂'],['reviews','履约评价']];
const formatDate=value=>new Date(value).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'});
function Arrow({direction='right'}){return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={direction==='right'?'M4 10h11m-4-4 4 4-4 4':'M16 10H5m4-4-4 4 4 4'}/></svg>;}
function Drawer(props){return <Modal {...props} className="brand-drawer"/>;}

function Pagination({result,onChange}){
  if(!result.total)return null;
  return <div className="brand-pagination"><span>共 {result.total} 条</span><div><button aria-label="上一页" disabled={result.page===1} onClick={()=>onChange(result.page-1)}><Arrow direction="left"/></button><span aria-live="polite">{result.page} / {result.pages}</span><button aria-label="下一页" disabled={result.page===result.pages} onClick={()=>onChange(result.page+1)}><Arrow/></button></div></div>;
}

function OrderList({orders,factories,onOpen,empty}){
  if(!orders.length)return empty;
  return <div className="brand-table-wrap"><table className="brand-order-table"><thead><tr><th>订单 / 款式</th><th>合作工厂</th><th>数量</th><th>状态</th><th><span className="brand-sr-only">查看</span></th></tr></thead><tbody>{orders.map(order=>{
    const factory=factories.find(f=>f.id===order.factoryId);
    return <tr key={order.id}><td><strong title={order.title}>{order.title}</strong><small>{formatDate(order.updatedAt||order.createdAt)} · {order.id.slice(0,8)}</small></td><td><Link to={`/profile/${order.factoryId}`} title={factory?.name}>{factory?.name||'未提供'}</Link></td><td>{order.quantity.toLocaleString()}<small>件 / 双</small></td><td><Status value={order.status}/></td><td><button className="brand-order-open" aria-label={`查看需求：${order.title}`} onClick={()=>onOpen(order.id)}><Arrow/></button></td></tr>;
  })}</tbody></table></div>;
}

export function BrandWorkspace({data,account,mutate,notify,ReviewModal,Reviews,children}){
  const [params,setParams]=useSearchParams();
  const requestedView=params.get('view')||'overview';
  const view=[...tabs.map(t=>t[0]),'publish'].includes(requestedView)?requestedView:'overview';
  const status=params.get('status')==='active'?'active':ORDER_STATES.some(s=>s.id===params.get('status'))?params.get('status'):'all';
  const query=params.get('q')||'';
  const summary=getBrandSummary(data,account.id);
  const {orders,partners,reviews,counts,active,attention}=summary;
  const [detailId,setDetailId]=useState(null),[reviewOrder,setReviewOrder]=useState(null),[reassign,setReassign]=useState(null),[busy,setBusy]=useState(false),[actionError,setActionError]=useState(''),[showAttention,setShowAttention]=useState(false);
  const nav=useRef(),lastOrderParams=useRef({}),viewRef=useRef(view);
  const [indicator,setIndicator]=useState({});
  useEffect(()=>{
    const measure=()=>{const el=nav.current?.querySelector('[aria-current="page"]');setIndicator(el?{width:el.offsetWidth,transform:`translateX(${el.offsetLeft}px)`,opacity:1}:{opacity:0});};
    measure();const observer=new ResizeObserver(measure);if(nav.current)observer.observe(nav.current);return()=>observer.disconnect();
  },[view]);
  useEffect(()=>{if(view==='orders')lastOrderParams.current=Object.fromEntries(params);},[params,view]);
  useEffect(()=>{if(viewRef.current!==view){window.scrollTo({top:0,behavior:'instant'});viewRef.current=view;}},[view]);
  const changeView=next=>setParams(next==='overview'?{}:next==='orders'?{...lastOrderParams.current,view:'orders'}:{view:next});
  const showOrders=selected=>setParams({view:'orders',...(selected!=='all'?{status:selected}:{})});
  function updateOrders(patch){
    const next={...Object.fromEntries(params),view:'orders',...patch};
    for(const key of Object.keys(next))if(next[key]===''||next[key]===null||next[key]==='all')delete next[key];
    setParams(next,{replace:Object.hasOwn(patch,'q')});
  }
  const filtered=filterOrders(orders,data.factories,{status,query});
  const orderPage=pageItems(filtered,params.get('page'),10);
  const partnerPage=pageItems(partners,params.get('page'),9);
  const reviewPage=pageItems([...reviews].sort((a,b)=>Date.parse(b.feedbackSubmittedAt||b.createdAt)-Date.parse(a.feedbackSubmittedAt||a.createdAt)),params.get('page'),6);
  const detail=orders.find(o=>o.id===detailId);
  const detailReview=detail&&reviews.find(r=>r.orderId===detail.id);
  const openOrder=id=>{setActionError('');setDetailId(id);};
  function openReview(order){setShowAttention(false);setDetailId(null);setReviewOrder(order);}
  function openReassign(order){setShowAttention(false);setDetailId(null);setReassign({demand:order.demand,quantity:order.quantity,reassignOrderId:order.id,candidates:[],notice:`原工厂拒绝原因：${order.rejectionReason||'未提供'}。本次仅重新分配 ${order.quantity} 件/双。`});}
  async function complete(){
    setBusy(true);setActionError('');
    try{await mutate('order-status',{orderId:detail.id,status:'completed'});notify('订单已完成，现在可评价工厂');}
    catch(e){setActionError(e.message);notify(e.message,{type:'error'});}
    finally{setBusy(false);}
  }
  const noOrders=<Empty action={<button className="secondary" onClick={()=>changeView('publish')}>发布第一笔需求 <Arrow/></button>}>从第一笔需求，开启新的合作。</Empty>;
  const pendingReviews=attention.filter(a=>a.kind==='review');

  return <div className="brand-workspace">
    <header className="brand-hero">
      <div><div className="brand-kicker"><span>品牌工作台</span><span className="brand-kicker-divider"/><span>{account.name}</span></div><h1>让每一笔合作，<span>进展清晰。</span></h1><p>从需求到交付，掌握业务的每一步。</p></div>
      <button className="primary brand-publish" onClick={()=>changeView('publish')}><span aria-hidden="true">＋</span> 发布生产需求</button>
    </header>
    <div className="brand-nav-row"><nav ref={nav} className="brand-nav" aria-label="品牌工作台导航"><span className="brand-nav-indicator" style={indicator} aria-hidden="true"/>{tabs.map(([id,label])=><button key={id} aria-current={view===id?'page':undefined} onClick={()=>changeView(id)}>{label}</button>)}<button className="brand-publish-tab" aria-current={view==='publish'?'page':undefined} onClick={()=>changeView('publish')}>BOM 与 Agent 排期</button></nav><Link className="brand-profile-link" to={`/profile/${account.id}`}>品牌主页 <span aria-hidden="true">↗</span></Link></div>

    {view==='overview'&&<div className="brand-view" key="overview">
      <section className="brand-overview" aria-labelledby="brand-overview-heading">
        <div className="brand-section-head"><h2 id="brand-overview-heading">履约概况</h2><span className="brand-update"><i/>业务数据自动同步</span></div>
        <div className="brand-metrics-row"><button className="brand-active" onClick={()=>showOrders('active')}><span className="brand-active-number">{active.toLocaleString()}</span><span className="brand-active-caption"><strong>进行中的订单 <Arrow/></strong><small>待接单与生产中</small></span></button><div className="brand-secondary-metrics"><button onClick={()=>showOrders('all')}><span>历史发单</span><strong>{orders.length.toLocaleString()}<small>笔</small></strong></button><button onClick={()=>changeView('partners')}><span>合作工厂</span><strong>{partners.length.toLocaleString()}<small>家</small></strong></button><button onClick={()=>changeView('reviews')}><span>累计评价</span><strong>{reviews.length.toLocaleString()}<small>条</small></strong></button></div></div>
        <div className="brand-distribution" aria-label="全部订单的履约状态分布">{orders.length?ORDER_STATES.filter(s=>counts[s.id]).map(s=><button key={s.id} className={s.id} style={{flex:counts[s.id]}} aria-label={`查看${s.label}订单，共 ${counts[s.id]} 笔`} title={`${s.label} · ${counts[s.id]} 笔`} onClick={()=>showOrders(s.id)}/>):<span className="brand-distribution-empty"/>}</div>
        <div className="brand-state-legend">{ORDER_STATES.map(s=><button key={s.id} onClick={()=>showOrders(s.id)} aria-label={`查看${s.label}订单`}><Status value={s.id}/><strong>{counts[s.id]}</strong><Arrow/></button>)}</div>
      </section>

      <div className="brand-overview-bottom">
        <section className="brand-recent" aria-labelledby="brand-recent-heading"><div className="brand-section-head"><div><h2 id="brand-recent-heading">近期订单</h2><p>最近更新，尽在这里。</p></div><button className="brand-link" onClick={()=>showOrders('all')}>查看全部 <Arrow/></button></div><OrderList orders={orders.slice(0,5)} factories={data.factories} onOpen={openOrder} empty={noOrders}/></section>
        <aside className="brand-attention" aria-labelledby="brand-attention-heading"><div className="brand-section-head"><h2 id="brand-attention-heading">需要关注 <span>{attention.length.toLocaleString().padStart(2,'0')}</span></h2><span className="brand-attention-symbol" aria-hidden="true">↗</span></div>{attention.length?<><p className="brand-attention-intro">处理这些事项，让合作继续向前。</p><div className="brand-attention-list">{attention.slice(0,3).map(({order,kind})=><article key={order.id}><span className={`brand-attention-kind ${kind}`}><i/>{kind==='reassign'?'待重新分配':'待履约评价'}</span><h3>{order.title}</h3><p>{data.factories.find(f=>f.id===order.factoryId)?.name}</p><button className="brand-link" aria-label={kind==='review'?(reviews.some(r=>r.orderId===order.id)?'补填履约问卷':'填写履约反馈 / 评价工厂'):'重新选择工厂'} onClick={()=>kind==='review'?openReview(order):openReassign(order)}>{kind==='review'?'完成评价':'重新选择工厂'}<Arrow/></button></article>)}</div>{attention.length>3&&<button className="brand-link brand-attention-more" onClick={()=>setShowAttention(true)}>还有 {attention.length-3} 项，查看全部 <Arrow/></button>}</>:<div className="brand-all-clear"><span aria-hidden="true">✓</span><strong>当前没有待处理事项</strong><p>留一点从容，给下一次合作。</p></div>}</aside>
      </div>
    </div>}

    {view==='orders'&&<section className="brand-view brand-list-page" key="orders"><div className="brand-section-head"><div><h2>订单管理</h2><p>每一笔需求，都有清晰的去向。</p></div><span className="brand-small-count">{orders.length} 笔订单</span></div><div className="brand-order-toolbar"><div className="brand-filters" aria-label="订单状态筛选">{[{id:'all',label:'全部'},...(status==='active'?[{id:'active',label:'进行中'}]:[]),...ORDER_STATES].map(s=><button key={s.id} aria-pressed={status===s.id} onClick={()=>updateOrders({status:s.id,page:null})}>{s.label}<span>{s.id==='all'?orders.length:s.id==='active'?active:counts[s.id]}</span></button>)}</div><label className="brand-search"><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg><input type="search" aria-label="搜索订单" placeholder="搜索订单、款式或工厂" value={query} onChange={e=>updateOrders({q:e.target.value,page:null})}/></label></div><OrderList orders={orderPage.items} factories={data.factories} onOpen={openOrder} empty={orders.length?<Empty action={<button className="brand-link" onClick={()=>setParams({view:'orders'})}>清除筛选</button>}>没有找到匹配的订单</Empty>:noOrders}/><Pagination result={orderPage} onChange={page=>updateOrders({page:String(page)})}/></section>}

    {view==='partners'&&<section className="brand-view brand-list-page" key="partners"><div className="brand-section-head"><div><h2>合作工厂</h2><p>每一次默契，都从彼此了解开始。</p></div><span className="brand-small-count">{partners.length} 家工厂</span></div>{partners.length?<div className="brand-partner-grid">{partnerPage.items.map(factory=>{const total=orders.filter(o=>o.factoryId===factory.id),production=total.filter(o=>o.status==='production').length;return <Link className="brand-partner" to={`/profile/${factory.id}`} key={factory.id}><div className="brand-partner-top"><span className="avatar">{factory.name[0]}</span><span aria-hidden="true">↗</span></div><h3>{factory.name}</h3><p>{factory.categories.join(' · ')||'暂无品类资料'}</p><div><span>累计合作 <strong>{total.length}</strong> 笔</span><span>生产中 <strong>{production}</strong> 笔</span></div></Link>;})}</div>:<Empty>合作伙伴将在首笔订单提交后显示。</Empty>}<Pagination result={partnerPage} onChange={page=>setParams({view:'partners',page:String(page)})}/></section>}

    {view==='reviews'&&<section className="brand-view brand-list-page" key="reviews"><div className="brand-section-head"><div><h2>履约评价</h2><p>让真实反馈，成为下一次合作的参考。</p></div><span className="brand-small-count">{reviews.length} 条评价</span></div>{pendingReviews.length>0&&<div className="brand-pending-reviews"><h3>待评价 · {pendingReviews.length}</h3>{pendingReviews.map(({order})=><div key={order.id}><span>{order.title}<small>{data.factories.find(f=>f.id===order.factoryId)?.name}</small></span><button className="brand-link" onClick={()=>openReview(order)}>完成评价 <Arrow/></button></div>)}</div>}<Reviews values={reviewPage.items} factoryNames/><Pagination result={reviewPage} onChange={page=>setParams({view:'reviews',page:String(page)})}/></section>}

    {showAttention&&<Drawer title={`需要关注 · ${attention.length} 项`} onClose={()=>setShowAttention(false)}><div className="brand-all-attention">{attention.map(({order,kind})=><article key={order.id}><span className={`brand-attention-kind ${kind}`}>{kind==='reassign'?'待重新分配':'待履约评价'}</span><h3>{order.title}</h3><p>{data.factories.find(f=>f.id===order.factoryId)?.name}</p><button className="brand-link" onClick={()=>kind==='review'?openReview(order):openReassign(order)}>{kind==='review'?'完成评价':'重新选择工厂'}<Arrow/></button></article>)}</div></Drawer>}
    {children}
    {detail&&<OrderDetailsModal order={detail} data={data} account={account} mutate={mutate} notify={notify} Modal={Drawer} onClose={()=>setDetailId(null)} actions={<div className="brand-detail-actions"><Status value={detail.status}/>{actionError&&<p className="form-error" role="alert">{actionError}</p>}{detail.status==='production'&&<button className="primary" disabled={busy} onClick={complete}>{busy?'正在确认…':'确认完成'}</button>}{detail.status==='completed'&&<button className="primary" disabled={Boolean(detailReview&&(isCompleteFeedback(detailReview)||isSeedReview(detailReview)))} onClick={()=>openReview(detail)}>{detailReview?(isSeedReview(detailReview)?'示例评价（不计入指标）':isCompleteFeedback(detailReview)?'已提交履约反馈':'补填履约问卷'):'填写履约反馈 / 评价工厂'}</button>}{detail.status==='rejected'&&!detail.reassignedBy&&detail.demand&&<button className="primary" onClick={()=>openReassign(detail)}>重新选择工厂</button>}</div>}/>}
    {reviewOrder&&<ReviewModal order={reviewOrder} onClose={()=>setReviewOrder(null)}/>}
    {reassign&&<AllocationModal proposal={reassign} data={data} onSubmit={async payload=>{await mutate('orders',payload);notify('被拒绝的数量已重新提交');}} onClose={()=>setReassign(null)} Modal={Modal}/>}
  </div>;
}
