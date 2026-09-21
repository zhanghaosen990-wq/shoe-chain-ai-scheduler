import React,{useState} from 'react';
import {DELIVERY,QUALITY} from '../feedback';
export function FeedbackForm({order,previous,factoryName,onSubmit,onClose,Modal}){
 const [delivery,setDelivery]=useState(''),[quality,setQuality]=useState(''),[rating,setRating]=useState(previous?.rating||0),[comment,setComment]=useState(previous?.comment||''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e){e.preventDefault();if(!delivery||!quality||!rating)return;setBusy(true);setError('');try{await onSubmit({orderId:order.id,delivery,quality,rating,comment});onClose();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <Modal title="订单履约与质量评估" onClose={()=>!busy&&onClose()}><p className="muted">{factoryName} · {order.title} · {order.quantity} 件/双</p><form className="feedback-form" onSubmit={submit}>
 <fieldset><legend>准时交货情况（必选）</legend>{Object.entries(DELIVERY).map(([key,item])=><label className="feedback-option" key={key}><input required type="radio" name="delivery" checked={delivery===key} onChange={()=>setDelivery(key)}/>{item.label}<small>履约得分 {item.value}%</small></label>)}</fieldset>
 <fieldset><legend>大货抽检合格情况（必选）</legend>{Object.entries(QUALITY).map(([key,item])=><label className="feedback-option" key={key}><input required type="radio" name="quality" checked={quality===key} onChange={()=>setQuality(key)}/>{item.label}<small>估算值 {item.value}%</small></label>)}</fieldset>
 <fieldset className="rating-picker"><legend>综合星级（必选）</legend>{[1,2,3,4,5].map(n=><label key={n}><input required type="radio" name="rating" checked={rating===n} onChange={()=>setRating(n)}/><span>{n} ★</span></label>)}</fieldset>
 <label className="field">详细反馈（选填）<textarea rows={3} maxLength={500} value={comment} onChange={e=>setComment(e.target.value)} placeholder="分享交期、工艺细节与沟通体验"/><small>{comment.length}/500 字</small></label>
 <p className="feedback-basis">本次履约得分：{DELIVERY[delivery]?.value??'未选择'}%；质量问卷估算：{QUALITY[quality]?.value??'未选择'}%。履约按本订单分单数量加权，并非严格准时订单占比；质量使用区间代表值，按反馈笔数平均；星级等权平均。提交后不可重复填写。</p>
 {error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>取消</button><button className="primary" disabled={busy||!delivery||!quality||!rating}>{busy?'提交中…':'提交履约反馈'}</button></div></form></Modal>;
}
