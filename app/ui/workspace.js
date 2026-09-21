/* Shared experience for the embedded and standalone BOM workspace. */
(function(){
  const embedded=window.parent!==window&&new URLSearchParams(location.search).get('embedded')==='1';
  document.body.classList.toggle('embedded-workspace',embedded);
  let execution='',undo=null,demo=false,fillVersion=0;
  const targets=['workflow-upload','workflow-bom','workflow-demand','workflow-execute'];
  function update(){
    const step=ShoeUI.workflowStep({file:!!bomFile,bom:readBomData(),execution});
    document.querySelectorAll('[data-workflow-step]').forEach(button=>{const n=Number(button.dataset.workflowStep);button.classList.toggle('complete',n<step);if(n===step)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
    $('#workflow-execution-label').textContent=({running:'正在分析需求',success:'分析完成 · 待提交',error:'可重试或手动选厂',submitted:'需求已提交'})[execution]||'推荐与工厂确认';
    $('#demo-source').hidden=!demo;
  }
  const post=data=>window.parent.postMessage(data,location.origin);
  function locate(target){const top=target.getBoundingClientRect().top+scrollY;target.focus({preventScroll:true});if(embedded)post({type:'shoe-ui:scroll',top});else target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
  document.querySelectorAll('[data-workflow-step]').forEach(button=>button.addEventListener('click',()=>locate(document.getElementById(targets[Number(button.dataset.workflowStep)-1]))));
  const fields=()=>[...document.querySelectorAll('#order-form input:not([type=file]),#order-form textarea,#order-form select')].filter(el=>el.id&&el.id!=='demo-kind');
  function snapshot(){return {fields:fields().map(el=>({id:el.id,value:el.value,checked:el.checked})),sampleImages:sampleImages.map(x=>({...x})),bomFile,bomHints:{...bomHints},productionBaseline:productionBaseline&&{...productionBaseline},lastInferred:{...lastInferred},autoValues:{...autoValues},interaction:{...bomInteraction,isRecognizing:false,status:bomInteraction.isRecognizing?'ready':bomInteraction.status},hint:$('#bom-source-hint').textContent,demo,preview:$('#demo-bom-preview').getAttribute('src')};}
  const samples={
    shoe:{image:'/app/assets/demo-shoe.png',name:'商务男鞋-BOM-演示.png',category:'商务男鞋',bom:{style_name:'都市轻履 · 商务德比鞋',sku_code:'SC-2609-S01',color_info:'深咖棕 / BR-08',size_range:'39–44',fabric_details:'头层牛皮鞋面；透气超纤内里',accessory_details:'圆蜡鞋带；记忆海绵鞋垫；橡胶大底',craftsmanship:'裁断；针车；成型；胶粘',material_info:'鞋面单耗 1.6 平方尺 / 双，需核对色差',production_hints:{category:'商务男鞋',quantity:800,deadline_days:10,cooperation_mode:'包工包料'}}},
    apparel:{image:'/app/assets/demo-apparel.png',name:'女装-BOM-演示.png',category:'女装',bom:{style_name:'云影 · 通勤连衣裙',sku_code:'SC-2609-D02',color_info:'鼠尾草绿 / SG-02',size_range:'S–XL',fabric_details:'天丝棉混纺，单耗 2.2 米 / 件',accessory_details:'隐形拉链；同色包边条；洗水唛',craftsmanship:'裁剪；精细缝制；包边；整烫',material_info:'注意裙摆对称与拼缝平整，首件确认后生产',production_hints:{category:'女装',quantity:500,deadline_days:14,cooperation_mode:'包工包料'}}}
  };
  async function fill(){
    const token=++fillVersion,revision=demandRevision,sample=samples[$('#demo-kind').value];$('#fill-demo').disabled=true;
    try{
      const response=await fetch(sample.image);if(!response.ok)throw Error('演示图片暂时无法加载，请重试');const blob=await response.blob();
      const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('演示图片读取失败'));reader.readAsDataURL(blob);});
      if(token!==fillVersion)return;
      if(revision!==demandRevision){showToast('资料已更新，已取消演示填充，请按需重新填入',{type:'info'});return;}
      undo=snapshot();clearBomSelection();
      bomFile=new File([blob],sample.name,{type:'image/png'});bomInteraction={selectedFile:bomFile,status:'demo',isRecognizing:false,error:null};
      sampleImages=[{name:sample.name,dataUrl,url:dataUrl,status:'uploaded'}];fillBomData(sample.bom);
      $('#category').value=sample.category;$('#quantity').value=sample.bom.production_hints.quantity;$('#deadline').value=sample.bom.production_hints.deadline_days;
      $('#cooperation-mode').value='包工包料';$('#splittable').checked=true;$('#special-notes').value='演示需求：请先确认样品、物料和交期，再安排生产。';
      demo=true;$('#demo-bom-preview').src=sample.image;$('#demo-bom-preview').hidden=false;$('#undo-demo').hidden=false;
      $('#bom-source-hint').textContent='演示数据 · 已填入预置 BOM 结果，可编辑，也可点击“开始识别 BOM”进行真实识别。';
      renderSamplePreview();renderBomFileState();update();showToast('演示图片与 BOM 已填入，请核对需求后继续',{type:'info'});
    }catch(e){showToast(e.message,{type:'error'});}finally{if(token===fillVersion)$('#fill-demo').disabled=false;}
  }
  function restore(){if(!undo)return;const saved=undo;clearBomSelection();bomFile=saved.bomFile;bomHints=saved.bomHints;productionBaseline=saved.productionBaseline;lastInferred=saved.lastInferred;autoValues=saved.autoValues;bomInteraction=saved.interaction;sampleImages=saved.sampleImages;for(const entry of saved.fields){const el=document.getElementById(entry.id);if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===entry.value))el.add(new Option(entry.value,entry.value));el.value=entry.value;if(el.type==='checkbox')el.checked=entry.checked;}demo=saved.demo;$('#demo-bom-preview').hidden=!saved.preview;if(saved.preview)$('#demo-bom-preview').src=saved.preview;$('#bom-source-hint').textContent=saved.hint;undo=null;$('#undo-demo').hidden=true;renderBomTags();renderBomFileState();renderSamplePreview();update();showToast('已恢复填充前的资料，旧推荐需要重新分析');}
  $('#fill-demo').addEventListener('click',fill);$('#undo-demo').addEventListener('click',restore);
  $('#order-form').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.isComposing||e.keyCode===229))e.preventDefault();});
  $('#order-form').addEventListener('input',update);
  function sendHeight(){if(!embedded)return;const height=Math.ceil(document.querySelector('.shell').getBoundingClientRect().height);if(height>=100)post({type:'shoe-ui:height',height});}
  const resize=new ResizeObserver(sendHeight);resize.observe(document.querySelector('.shell'));
  const message=e=>{if(!embedded||!ShoeUI.validBridgeMessage(e,location.origin,window.parent)||e.data.type!=='shoe-ui:visibility')return;if(e.data.visible)sendHeight();};
  window.addEventListener('message',message);
  window.workspaceUI={update,setExecution(value){execution=value;update();},reset(){execution='';update();},clearDemo(){demo=false;$('#demo-bom-preview').hidden=true;$('#demo-bom-preview').removeAttribute('src');update();}};
  window.addEventListener('pagehide',()=>{resize.disconnect();window.removeEventListener('message',message);},{once:true});
  update();sendHeight();
})();
