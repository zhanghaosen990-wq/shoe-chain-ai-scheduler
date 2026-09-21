import React,{useState,useEffect,useRef,useSyncExternalStore,useId} from 'react';
import {createOperations,mountNotifications} from '../ui/runtime';
import {mountLandingParticles} from '../ui/landing-particles';
const operations=createOperations(),drafts=new Map(),activeForms=new Map();
let notifications;
export function notify(message,options){notifications??=mountNotifications();return notifications.notify(message,options);}
export function restoreForm(detail){window.dispatchEvent(new CustomEvent('shoe-ui:restore',{detail}));}
export function useDraftState(key,initial){
 const [value,setValue]=useState(()=>{if(drafts.has(key))return drafts.get(key);const value=typeof initial==='function'?initial():initial;drafts.set(key,value);return value;});
 const update=next=>setValue(previous=>{const value=typeof next==='function'?next(previous):next;drafts.set(key,value);return value;});
 return [value,update];
}
export function useFormTask(key,onClose,restore){
 const scope=restore?.kind==='auth'?restore.mode:key;
 const viewKey=key+':'+scope;
 const state=useSyncExternalStore(operations.subscribe,()=>operations.snapshot(key));
 const watching=useRef(state.status==='pending'?state.id:null);
 const closeRef=useRef(onClose);closeRef.current=onClose;
 const [error,setError]=useState('');
 useEffect(()=>{activeForms.set(viewKey,(activeForms.get(viewKey)||0)+1);return()=>{const count=(activeForms.get(viewKey)||1)-1;if(count)activeForms.set(viewKey,count);else activeForms.delete(viewKey);};},[viewKey]);
 useEffect(()=>{
  if(state.status==='pending'){watching.current=state.id;return;}
  if(watching.current!==state.id)return;
  watching.current=null;
  if(state.meta.scope!==scope)return;
  if(state.status==='success')closeRef.current?.();
  if(state.status==='error')setError(state.error.message);
 },[state,scope]);
 async function run(task){
  if(operations.busy(key))return false;
  setError('');notifications?.store.remove(key);
  const promise=operations.run(key,task,{scope});watching.current=operations.snapshot(key).id;
  try {await promise;for(const draft of drafts.keys())if(draft.startsWith(key+':'))drafts.delete(draft);return true;}
  catch(e){if(!activeForms.has(viewKey))notify(e.message,{type:'error',id:key,action:restore?()=>restoreForm(restore):undefined});return false;}
 }
 return {busy:state.status==='pending',error,run,setError};
}
export function Modal({title,children,onClose,className}){
 const ref=useRef(),id=useId();
 useEffect(()=>{const previous=document.activeElement,dialog=ref.current;dialog.showModal();return()=>{dialog.close();if(previous?.isConnected)previous.focus({preventScroll:true});};},[]);
 const keyboard=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();return;}if(e.key==='Enter'&&(e.nativeEvent.isComposing||e.keyCode===229))e.preventDefault();};
 return <dialog ref={ref} className={className} aria-labelledby={id} onKeyDown={keyboard} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current)onClose();}}><div className="modal-head"><h2 id={id}>{title}</h2><button type="button" className="icon-button" aria-label="关闭弹窗" onClick={onClose}>×</button></div>{children}</dialog>;
}
export function ParticleCanvas(){const ref=useRef();useEffect(()=>mountLandingParticles(ref.current),[]);return <canvas ref={ref} id="bg-particles" className="landing-canvas" aria-hidden="true"/>;}
export function Empty({children,action}){return <div className="empty"><svg className="empty-art" viewBox="0 0 100 80" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><ellipse className="wash" cx="50" cy="43" rx="43" ry="31"/><path d="M26 31 50 19 74 31v30L50 73 26 61Z M26 31l24 13 24-13M50 44v29M38 25l24 13v13"/><path d="M78 16h10M83 11v10M13 42h8" strokeLinecap="round"/></svg><div>{children}</div>{action}</div>;}
export function Skeleton({cards=4,label='正在加载工作台…'}){return <div className="loading-shell" aria-busy="true" aria-label={label}><p role="status">{label}</p><div className="metrics">{Array.from({length:cards},(_,i)=><div key={i} className="skeleton-block" aria-hidden="true"><div className="skeleton"/><div className="skeleton"/><div className="skeleton"/></div>)}</div><div className="skeleton-block" aria-hidden="true"><div className="skeleton"/><div className="skeleton"/><div className="skeleton"/></div></div>;}
