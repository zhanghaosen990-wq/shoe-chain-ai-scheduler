import React, {useId, useRef, useState} from 'react';

const suggestions=['精细缝制','立体裁剪','电脑针车','激光切割','注塑成型','冷粘成型','热压贴合','刺绣','丝网印花','成品检验'];

export function ProcessPicker({values,onChange,error}) {
  const [query,setQuery]=useState(''),[expanded,setExpanded]=useState(false);
  const id=useId(),input=useRef();
  const needle=query.trim();
  const options=suggestions.filter(value=>!values.includes(value)&&value.toLocaleLowerCase().includes(needle.toLocaleLowerCase()));
  const custom=needle&&!values.includes(needle)&&!suggestions.includes(needle);
  function add(value) {
    if(!value.trim())return;
    onChange([...new Set([...values,value.trim()])]);setQuery('');input.current?.focus();
  }
  return <div className="process-field full-width">
    <label className="field-label" htmlFor={id}>擅长工艺 <span>可多选</span></label>
    <div className={`process-picker${error?' has-error':''}`}>
      <div className="process-selected" aria-label="已选工艺">
        {values.length?values.map(value=><span className="process-tag" key={value}>{value}<button type="button" aria-label={`移除工艺：${value}`} onClick={()=>onChange(values.filter(item=>item!==value))}>×</button></span>):<span className="process-placeholder">选择工艺，展示你的制造优势</span>}
      </div>
      <div className="process-search"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg><input ref={input} id={id} type="search" aria-label="搜索或添加擅长工艺" aria-describedby={`${id}-help${error?` ${id}-error`:''}`} aria-invalid={Boolean(error)} placeholder="搜索或添加工艺" maxLength={80} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(!e.nativeEvent.isComposing&&e.keyCode!==229)add(needle);}}}/><button type="button" className="text-button" aria-expanded={expanded} aria-controls={`${id}-options`} onClick={()=>setExpanded(!expanded)}>{expanded?'收起':'常用工艺'}</button></div>
      <div id={`${id}-options`} className="process-options" aria-label="可选工艺" hidden={!expanded&&!needle}>
        {options.map(value=><button type="button" key={value} aria-label={`添加工艺：${value}`} onClick={()=>add(value)}><span aria-hidden="true">＋</span>{value}</button>)}
        {custom&&<button type="button" className="process-create" aria-label={`添加工艺：${needle}`} onClick={()=>add(needle)}>＋ 添加「{needle}」</button>}
        {!options.length&&!custom&&<span className="process-placeholder">{needle?'该工艺已添加，可继续搜索其他工艺。':'已添加所有推荐工艺，也可以输入自定义工艺。'}</span>}
      </div>
    </div>
    <small id={`${id}-help`}>输入自定义工艺后按 Enter 添加。</small>
    {error&&<p className="form-error" id={`${id}-error`} role="alert">{error}</p>}
  </div>;
}
