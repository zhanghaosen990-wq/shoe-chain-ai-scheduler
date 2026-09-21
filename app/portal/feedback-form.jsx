import React from 'react';
import {DELIVERY,QUALITY} from '../feedback';
import {useDraftState,useFormTask,notify} from './ui';
export function FeedbackForm({order,previous,factoryName,onSubmit,onClose,Modal,accountId=order.brandId,completed=false}){
 const key=accountId+':feedback:'+order.id;
 const [draft,setDraft]=useDraftState(key+':draft',{delivery:'',quality:'',rating:previous?.rating||0,comment:previous?.comment||'',demo:false});
 const [undo,setUndo]=useDraftState(key+':undo',null);
 const {delivery,quality,rating,comment,demo}=draft;
 const change=(field,value)=>setDraft(d=>({...d,[field]:value}));
 const {busy,error,run}=useFormTask(key,onClose,{kind:'feedback',accountId,orderId:order.id});
 function submit(e){e.preventDefault();if(!completed&&delivery&&quality&&rating)run(()=>onSubmit({orderId:order.id,delivery,quality,rating,comment}));}
 function fill(){setUndo(draft);setDraft({delivery:'on_time',quality:'good',rating:4,comment:'按约定时间交付，做工细节良好，沟通及时。建议下次进一步优化包装一致性。',demo:true});notify('已填入评价演示数据，请核对后提交',{type:'info'});}
 if(completed)return <Modal title="履约反馈已提交" onClose={onClose}><p>反馈已保存，工厂指标已同步。感谢您分享这次合作体验。</p><div className="modal-actions"><button className="primary" onClick={onClose}>完成</button></div></Modal>;
 return <Modal title="订单履约与质量评估" onClose={onClose}><p className="muted">{factoryName} · {order.title} · {order.quantity} 件/双</p><form className="feedback-form" onSubmit={submit}>
 <div className="demo-tools"><button type="button" disabled={busy} onClick={fill}>一键填入演示数据</button>{undo&&<button type="button" disabled={busy} onClick={()=>{setDraft(undo);setUndo(null);notify('已恢复填充前的评价');}}>撤销填充</button>}</div>
 {demo&&<p className="demo-label">演示数据 · 提交后将作为本订单的履约反馈计入工厂指标，请核对后提交。</p>}
 <fieldset disabled={busy}><legend>准时交货情况（必选）</legend>{Object.entries(DELIVERY).map(([key,item])=><label className="feedback-option" key={key}><input required type="radio" name="delivery" checked={delivery===key} onChange={()=>change('delivery',key)}/>{item.label}<small>履约得分 {item.value}%</small></label>)}</fieldset>
 <fieldset disabled={busy}><legend>大货抽检合格情况（必选）</legend>{Object.entries(QUALITY).map(([key,item])=><label className="feedback-option" key={key}><input required type="radio" name="quality" checked={quality===key} onChange={()=>change('quality',key)}/>{item.label}<small>估算值 {item.value}%</small></label>)}</fieldset>
 <fieldset className="rating-picker" disabled={busy}><legend>综合星级（必选）</legend>{[1,2,3,4,5].map(n=><label key={n}><input required type="radio" name="rating" checked={rating===n} onChange={()=>change('rating',n)}/><span>{n} ★</span></label>)}</fieldset>
 <label className="field">详细反馈（选填）<textarea disabled={busy} rows={3} maxLength={500} value={comment} onChange={e=>change('comment',e.target.value)} placeholder="分享交期、工艺细节与沟通体验"/><small>{comment.length}/500 字</small></label>
 <p className="feedback-basis">本次履约得分：{DELIVERY[delivery]?.value??'未选择'}%；质量问卷估算：{QUALITY[quality]?.value??'未选择'}%。履约按本订单分单数量加权，并非严格准时订单占比；质量使用区间代表值，按反馈笔数平均；星级等权平均。提交后不可重复填写。</p>
 {error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={busy||!delivery||!quality||!rating}>{busy?'提交中…':'提交履约反馈'}</button></div></form></Modal>;
}
