import React from 'react';
import {useDraftState,useFormTask} from './ui';
export function AuthForm({mode,onMode,onSubmit,onClose,Modal,notice}){
 const key='auth';
 const [input,setInput]=useDraftState(key+':'+mode+':input',{username:'',password:'',name:'',role:''});
 const {busy,error,run,setError}=useFormTask(key,onClose,{kind:'auth',mode});
 const register=mode==='register';
 const change=(key,value)=>setInput(v=>({...v,[key]:value}));
 function submit(e){e.preventDefault();run(()=>onSubmit(mode,input));}
 return <Modal title={register?'注册账号':'登录账号'} onClose={onClose}><p className="auth-intro">{notice||'连接品牌与制造，从你的企业账号开始。'}</p><form className="account-form" onSubmit={submit}>
 {register&&<fieldset className="category-options"><legend>注册身份 · 必选</legend>{[['brand','品牌方'],['factory','工厂端']].map(([value,label])=><label key={value}><input disabled={busy} required type="radio" name="role" value={value} checked={input.role===value} onChange={()=>change('role',value)}/><span>{label}</span></label>)}</fieldset>}
 <label className="field">账号 / 手机号<input disabled={busy} autoFocus required autoComplete="username" maxLength={32} value={input.username} onChange={e=>change('username',e.target.value)} placeholder="请输入账号或手机号"/></label>
 <label className="field">密码<input disabled={busy} required type="password" autoComplete={register?'new-password':'current-password'} minLength={register?6:undefined} maxLength={72} value={input.password} onChange={e=>change('password',e.target.value)} placeholder={register?'至少 6 位密码':'请输入密码'}/></label>
 {register&&<label className="field">企业 / 主体名称<input disabled={busy} required maxLength={80} autoComplete="organization" value={input.name} onChange={e=>change('name',e.target.value)} placeholder="请输入品牌或工厂名称"/></label>}
 {error&&<p className="form-error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'正在处理…':register?'注册并登录':'登录'}</button><p className="auth-switch">{register?'已有账号？':'还没有账号？'}<button type="button" className="text-button" disabled={busy} onClick={()=>{setError('');onMode(register?'login':'register');}}>{register?'立即登录':'注册账号'}</button></p></form></Modal>;
}
export function ProfileForm({account,onSave,onClose,Modal}){
 const key=account.id+':profile';
 const [draft,setDraft]=useDraftState(key+':draft',{...account,categories:(account.categories||[]).join('、')});
 const {busy,error,run}=useFormTask(key,onClose,{kind:'profile',accountId:account.id});
 function submit(e){e.preventDefault();run(()=>onSave({...draft,categories:draft.categories.split(/[、,，;；\n]/)}));}
 return <Modal title="编辑企业资料" onClose={onClose}><form className="account-form" onSubmit={submit}>{[['name','企业名称',80],['contactName','联系人姓名',40],['phone','联系电话',25],['categories','主营品类',500]].map(([key,label,max])=><label className="field" key={key}>{label}<input disabled={busy} required={key==='name'} type={key==='phone'?'tel':'text'} maxLength={max} value={draft[key]||''} onChange={e=>setDraft(d=>({...d,[key]:e.target.value}))}/>{key==='categories'&&<small>多个品类以顿号或逗号分隔</small>}</label>)}<label className="field">优势说明<textarea disabled={busy} rows={4} maxLength={600} value={draft.description||''} onChange={e=>setDraft(d=>({...d,description:e.target.value}))}/></label>{error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={busy}>{busy?'保存中…':'保存资料'}</button></div></form></Modal>;
}
