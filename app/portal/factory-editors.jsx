import React,{useEffect,useRef,useState} from 'react';
import {ProcessPicker} from './process-picker';

const categories=['商务男鞋','休闲男鞋','运动鞋','女装','女式晚礼服','包袋'];
const lines=text=>[...new Set(text.split(/[\n；;]+/).map(x=>x.trim()).filter(Boolean))];
const selectDraft=(factory,section)=>section==='capacity'?{
  dailyCapacity:factory.dailyCapacity,min_order_quantity:factory.min_order_quantity,categories:factory.categories,
  equipment:factory.equipment.join('\n'),process_capabilities:factory.process_capabilities,
}:{description:factory.description||'',images:factory.images};

function useSectionDraft({factory,section,onSave,onStatus,notify}){
  const incoming=JSON.stringify(selectDraft(factory,section));
  const [draft,setDraft]=useState(()=>JSON.parse(incoming)),[baseline,setBaseline]=useState(incoming);
  const [saving,setSaving]=useState(false),[error,setError]=useState('');
  const alive=useRef(true),lock=useRef(false);
  const dirty=JSON.stringify(draft)!==baseline;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{if(!dirty&&incoming!==baseline){setDraft(JSON.parse(incoming));setBaseline(incoming);}},[incoming,baseline,dirty]);
  const update=(key,value)=>setDraft(previous=>({...previous,[key]:value}));
  async function submit(payload){
    if(lock.current)return;
    lock.current=true;setSaving(true);setError('');
    try{
      const next=await onSave({section,...payload});
      if(!alive.current)return;
      const saved=selectDraft(next.factories.find(f=>f.id===factory.id),section);
      setDraft(saved);setBaseline(JSON.stringify(saved));
      notify(section==='capacity'?'产能与工艺已保存':'工厂档案已保存');
    }catch(e){if(alive.current)setError(e.message);}
    finally{lock.current=false;if(alive.current)setSaving(false);}
  }
  return {draft,setDraft,update,saving,error,setError,dirty,submit,alive,onStatus};
}

export function CapacityEditor({factory,onSave,onImport,onStatus,notify,blocked=false}){
  const state=useSectionDraft({factory,section:'capacity',onSave,onStatus,notify});
  const {draft,setDraft,update,saving,error,setError,dirty,submit,alive}=state;
  const [extra,setExtra]=useState(''),[file,setFile]=useState(null),[recognizing,setRecognizing]=useState(false),[processError,setProcessError]=useState(''),[categoryError,setCategoryError]=useState('');
  const controller=useRef(),generation=useRef(0),form=useRef();
  useEffect(()=>()=>{generation.current++;controller.current?.abort();},[]);
  useEffect(()=>onStatus({busy:saving||recognizing,dirty}),[saving,recognizing,dirty,onStatus]);
  function selectFile(next){generation.current++;controller.current?.abort();setRecognizing(false);setFile(next);setError('');}
  async function recognize(){
    if(!file||recognizing||saving||blocked)return;
    const current=++generation.current;controller.current=new AbortController();setRecognizing(true);setError('');setProcessError('');
    try{
      const body=new FormData();body.append('file',file);const result=await onImport(body,controller.current.signal);
      if(current!==generation.current||!alive.current)return;
      setDraft(d=>({...d,...(result.equipment.length?{equipment:result.equipment.join('\n')}:{}),...(result.process_capabilities.length?{process_capabilities:[...new Set(result.process_capabilities)]}:{}),...(result.categories.length?{categories:result.categories.map(c=>c==='晚礼服'?'女式晚礼服':c)}:{}),...(result.dailyCapacity?{dailyCapacity:result.dailyCapacity}:{}),...(result.min_order_quantity?{min_order_quantity:result.min_order_quantity}:{})}));
      setCategoryError('');notify('工厂资料已回填，请校对后保存；未识别字段保留原值');
    }catch(e){if(current===generation.current&&alive.current&&e.name!=='AbortError')setError(e.message);}
    finally{if(current===generation.current&&alive.current)setRecognizing(false);}
  }
  function addCategory(){if(!extra.trim())return;update('categories',[...new Set([...draft.categories,extra.trim()])]);setExtra('');setCategoryError('');}
  function save(e){
    e.preventDefault();if(saving||recognizing||blocked)return;
    if(!draft.categories.length){setCategoryError('请至少选择一项擅长品类。');form.current?.querySelector('input[type=checkbox]')?.focus();return;}
    if(!draft.process_capabilities.length){setProcessError('请至少选择或添加一项擅长工艺。');form.current?.querySelector('input[type=search]')?.focus();return;}
    setProcessError('');setCategoryError('');submit({...draft,equipment:lines(draft.equipment)});
  }
  return <section className="factory-editor factory-capacity-view">
    <div className="factory-view-heading"><h2>产能与工艺</h2><span className="factory-save-state">{recognizing?'正在识别…':saving?'正在保存…':dirty?'有未保存的修改':'修改后保存生效'}</span></div>
    <div className="factory-editor-surface">
      <details className="factory-import"><summary>从资料导入<span aria-hidden="true">＋</span></summary><div className="factory-import-body"><p>XLSX、JPG 或 PNG，单个文件不超过 20MB。识别后请校对。</p><div className="factory-import-controls"><label className="secondary upload-label">选择资料<input aria-label="上传工厂设备产能资料" type="file" accept=".xlsx,.jpg,.jpeg,.png" disabled={saving||blocked} onChange={e=>{const next=e.target.files[0];if(next){if(next.size>20*1024*1024||!/\.(xlsx|png|jpe?g)$/i.test(next.name))setError('请选择 20MB 以内的 XLSX、JPG 或 PNG 文件');else selectFile(next);}e.target.value='';}}/></label>{file&&<span className="factory-selected-file">{file.name}<button type="button" className="text-button" disabled={saving||blocked} onClick={()=>selectFile(null)}>移除</button></span>}<button type="button" className="secondary" disabled={!file||recognizing||saving||blocked} onClick={recognize}>{recognizing?'正在识别资料…':'一键识别 →'}</button></div></div></details>
      <form id="factory-capacity-form" ref={form} onSubmit={save}>
        <fieldset className="factory-form-fields" disabled={saving||recognizing||blocked}>
          <div className="form-grid"><label className="field">最小起订量（件/双）<input type="number" min="1" max="1000000" step="1" required value={draft.min_order_quantity} onChange={e=>update('min_order_quantity',e.target.value)}/></label><label className="field">日均产能（件/双）<input type="number" min="1" max="1000000" step="1" required value={draft.dailyCapacity} onChange={e=>update('dailyCapacity',e.target.value)}/></label></div>
          <div className="factory-form-section"><fieldset className="category-options" aria-describedby={categoryError?'factory-category-error':undefined}><legend>擅长品类</legend>{[...new Set([...categories,...draft.categories])].map(c=><label key={c}><input type="checkbox" checked={draft.categories.includes(c)} onChange={e=>{update('categories',e.target.checked?[...draft.categories,c]:draft.categories.filter(v=>v!==c));setCategoryError('');}}/><span>{c}</span></label>)}</fieldset><div className="custom-category"><input aria-label="其他擅长品类" placeholder="其他品类" maxLength={40} value={extra} onChange={e=>setExtra(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(!e.nativeEvent.isComposing&&e.keyCode!==229)addCategory();}}}/><button type="button" className="text-button" disabled={!extra.trim()} onClick={addCategory}>添加</button></div>{categoryError&&<p className="form-error" id="factory-category-error" role="alert">{categoryError}</p>}</div>
          <div className="factory-form-section"><label className="field">设备清单<textarea aria-label="设备清单" aria-describedby="factory-equipment-help" rows={3} required placeholder="例如：电脑针车 × 20 台" value={draft.equipment} onChange={e=>update('equipment',e.target.value)}/><small id="factory-equipment-help">每行一项，可注明型号和数量。</small></label></div>
          <ProcessPicker values={draft.process_capabilities} onChange={values=>{update('process_capabilities',values);setProcessError('');}} error={processError}/>
        </fieldset>
        {error&&<p className="form-error" role="alert">{error}</p>}
      </form>
    </div>
  </section>;
}

export function ShowcaseEditor({factory,onSave,onStatus,notify,blocked=false}){
  const {draft,update,saving,error,setError,dirty,submit,alive}=useSectionDraft({factory,section:'showcase',onSave,onStatus,notify});
  const [reading,setReading]=useState(false),readLock=useRef(false);
  useEffect(()=>onStatus({busy:saving||reading,dirty}),[saving,reading,dirty,onStatus]);
  async function photos(files){
    if(readLock.current||saving||blocked)return;
    const selected=Array.from(files);if(!selected.length)return;setError('');
    if(draft.images.length+selected.length>6||selected.some(f=>!['image/jpeg','image/png'].includes(f.type)||f.size>2*1024*1024)){setError('最多 6 张 JPG/PNG，每张不超过 2MB。');return;}
    readLock.current=true;setReading(true);
    try{const images=await Promise.all(selected.map(f=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('图片读取失败'));reader.readAsDataURL(f);})));if(alive.current)update('images',[...draft.images,...images]);}
    catch(e){if(alive.current)setError(e.message);}
    finally{readLock.current=false;if(alive.current)setReading(false);}
  }
  return <section className="factory-editor factory-showcase-view">
    <div className="factory-view-heading"><h2>工厂档案与展示</h2><span className="factory-save-state">{saving?'正在保存…':dirty?'有未保存的修改':'修改后保存生效'}</span></div>
    <form id="factory-showcase-form" className="factory-editor-surface" onSubmit={e=>{e.preventDefault();if(!saving&&!reading&&!blocked)submit(draft);}}>
      <fieldset className="factory-form-fields" disabled={saving||reading||blocked}>
        <label className="field"><span className="factory-field-heading">工厂介绍<small>{draft.description.length} / 600</small></span><textarea aria-label="工厂介绍" maxLength={600} rows={5} placeholder="介绍工厂规模、合作经验与核心优势" value={draft.description} onChange={e=>update('description',e.target.value)}/></label>
        <div className="factory-photo-section"><div className="factory-field-heading"><h3>产品细节与样衣图</h3><small>最多 6 张 · JPG / PNG · 单张 2MB</small></div><div className="photo-grid">{draft.images.map((src,i)=><figure key={i}><img src={src} alt={`产品细节 ${i+1}`}/><button type="button" aria-label={`删除细节图 ${i+1}`} onClick={()=>update('images',draft.images.filter((_,n)=>n!==i))}>×</button></figure>)}{draft.images.length<6&&<label className="factory-photo-add upload-label"><span aria-hidden="true">＋</span><span>{reading?'读取中…':'添加细节图'}</span><input aria-label="上传产品细节图" type="file" accept="image/png,image/jpeg" multiple onChange={e=>{photos(e.target.files);e.target.value='';}}/></label>}</div></div>
      </fieldset>
      {error&&<p className="form-error" role="alert">{error}</p>}
    </form>
  </section>;
}
