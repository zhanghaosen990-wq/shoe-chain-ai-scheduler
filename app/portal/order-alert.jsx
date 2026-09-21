import React,{useEffect,useRef,useState} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {pendingOrders} from './order-notifications';
import {useDraftState,useFormTask,Empty} from './ui';
export function OrderAlerts({data,account,mutate,refresh,notify,Modal}){
 const pending=pendingOrders(data?.orders,account),location=useLocation(),navigate=useNavigate();
 const [open,setOpen]=useState(false);
 const seen=useRef(new Set()),previousPath=useRef(null),openRef=useRef(false),generation=useRef(0);
 const session=generation.current;
 const signature=pending.map(o=>o.id).sort().join('|');
 function show(){generation.current++;pending.forEach(o=>seen.current.add(o.id));openRef.current=true;setOpen(true);}
 function close(){openRef.current=false;setOpen(false);}
 useEffect(()=>{
  const entering=location.pathname==='/factory'&&previousPath.current!=='/factory';previousPath.current=location.pathname;
  if(entering)seen.current.clear();
  if(openRef.current){pending.forEach(o=>seen.current.add(o.id));if(!pending.length)close();return;}
  if(location.pathname!=='/factory'||!pending.some(o=>!seen.current.has(o.id)))return;
  const attempt=()=>{if(document.visibilityState==='hidden'||document.querySelector('dialog[open]'))return false;show();return true;};
  if(attempt())return;
  const timer=setInterval(()=>{if(attempt())clearInterval(timer);},300);return()=>clearInterval(timer);
 },[signature,location.pathname]);
 function details(order){previousPath.current='/factory';close();navigate('/factory?'+new URLSearchParams({view:'orders',order:order.id}));}
 return <><button type="button" className="notification-bell" aria-label={`订单通知，${pending.length} 条待处理`} title="待接单通知" onClick={show}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></svg>{pending.length>0&&<span className="notification-count">{pending.length>99?'99+':pending.length}</span>}</button>{open&&<Modal title="🔔 收到新的品牌方合作邀约" onClose={close}><div className="order-alert-intro"><strong>待接单通知</strong><span>{pending.length} 笔需求等待你处理</span></div>{pending.length?<div className="order-alert-list">{pending.map(order=><AlertCard key={order.id} order={order} data={data} account={account} mutate={mutate} refresh={refresh} notify={notify} onHandled={()=>{if(openRef.current&&generation.current===session)close();}} onDetails={()=>details(order)}/>)}</div>:<Empty>暂无待处理订单，新的合作邀约会在这里提醒。</Empty>}</Modal>}</>;
}
function AlertCard({order,data,account,mutate,refresh,notify,onHandled,onDetails}){
 const key=account.id+':order:'+order.id;
 const [action,setAction]=useDraftState(key+':action',''),[reason,setReason]=useDraftState(key+':reason','');
 const {busy,error,run}=useFormTask(key,null,{kind:'order',accountId:account.id,orderId:order.id});
 const factory=data.factories.find(f=>f.id===account.id),p=order.demand?.planning_context,r=order.demand?.production_requirements;
 const available=Math.max(0,factory.dailyCapacity*Math.min(p?.deadline_days||10,10)-(factory.analytics?.booked||0));
 const risk=order.quantity<factory.min_order_quantity||order.quantity>available;
 function update(status,confirmRisks=false){run(async()=>{try{await mutate('order-status',{orderId:order.id,status,reason,confirmRisks});notify(status==='production'?'已接单并计入排期':'已拒绝邀约，原因已同步给品牌方');onHandled();}catch(e){refresh();throw e;}});}
 return <article className="order-alert-card"><form onSubmit={e=>{e.preventDefault();if(!busy&&action&&(action==='accept'||reason.trim()))update(action==='reject'?'rejected':'production',action==='accept');}}><div className="alert-brand"><span className="avatar">{data.brands.find(b=>b.id===order.brandId)?.name?.[0]||'品'}</span><div><small>发起品牌</small><strong>{data.brands.find(b=>b.id===order.brandId)?.name||'未提供'}</strong></div><span className="badge pending">待接单</span></div><h3>{order.demand?.bom_data?.style_name||order.title}</h3><dl className="alert-facts"><div><dt>本厂分配数量</dt><dd>{order.quantity.toLocaleString()} {/鞋|靴/.test(p?.category||'')?'双':p?.category?'件':'件/双'}</dd></div><div><dt>目标交期</dt><dd>{p?.deadline_days?`${p.deadline_days} 天`:'未提供'}</dd></div><div><dt>合作模式</dt><dd>{r?.cooperation_mode||'未提供'}</dd></div></dl>{risk&&<p className="candidate-risk">数量或排期需确认：MOQ {factory.min_order_quantity}，交期内已知可用产能 {available}。</p>}{action==='accept'&&<p className="form-error">请确认可协调资源承接此订单，接单后将计入排期。</p>}{action==='reject'&&<label className="field">拒绝 / 协商原因<textarea aria-label="拒绝或协商原因" rows={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="说明无法承接的原因或建议的数量、交期，品牌方可查看后重新派单"/><small>提交后订单标记为已拒绝，原因同步品牌方。</small></label>}{error&&<p className="form-error" role="alert">{error}</p>}<div className="alert-actions">{action?<><button type="button" className="secondary" disabled={busy} onClick={()=>setAction('')}>返回</button><button type="button" className="primary" disabled={busy||(action==='reject'&&!reason.trim())} onClick={()=>update(action==='reject'?'rejected':'production',action==='accept')}>{busy?'处理中…':action==='reject'?'提交拒绝 / 协商原因':'确认风险并接单'}</button></>:<><button type="button" className="primary" disabled={busy} onClick={()=>risk?setAction('accept'):update('production')}>{busy?'接单中…':'立即接单'}</button><button type="button" className="secondary" disabled={busy} onClick={()=>setAction('reject')}>拒绝 / 协商</button><button type="button" className="text-button" disabled={busy} onClick={onDetails}>查看详情</button></>}</div></form></article>;
}
