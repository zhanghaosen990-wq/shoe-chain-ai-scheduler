(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ShoeUI=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function createNotifications(){
    let items=[],serial=0;const listeners=new Set();
    const emit=()=>listeners.forEach(fn=>fn(items));
    return {get items(){return items;},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
      push(message,options={}){const id=options.id||String(message);const item={...options,id,message:String(message),type:options.type||'success',duration:options.type==='error'?8000:4000,revision:++serial};items=[...items.filter(x=>x.id!==id),item].slice(-3);emit();return id;},
      remove(id){items=items.filter(x=>x.id!==id);emit();}};
  }
  function createOperations(){
    const pending=new Map(),states=new Map(),listeners=new Set();
    const idle=Object.freeze({id:0,status:'idle'});let serial=0;
    const emit=()=>listeners.forEach(fn=>fn());
    return {
      busy:key=>pending.has(key),snapshot:key=>states.get(key)||idle,
      subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
      run(key,task,meta={}){
        if(pending.has(key))return pending.get(key);
        const id=++serial;
        const settle=(status,error)=>{pending.delete(key);states.set(key,{id,status,meta,error});emit();};
        const promise=Promise.resolve().then(task).then(value=>{settle('success');return value;},error=>{settle('error',error);throw error;});
        pending.set(key,promise);states.set(key,{id,status:'pending',meta});emit();return promise;
      }
    };
  }
  function workflowStep({file,bom={},execution}={}){if(execution)return 4;if(['style_name','sku_code','craftsmanship'].every(k=>String(bom[k]||'').trim()))return 3;return file?2:1;}
  function validBridgeMessage(e,origin,source){
    if(e.origin!==origin||e.source!==source||!e.data||typeof e.data!=='object')return false;
    const d=e.data;
    if(d.type==='shoe-ui:height')return Number.isFinite(d.height)&&d.height>=100&&d.height<=100000;
    if(d.type==='shoe-ui:scroll')return Number.isFinite(d.top)&&d.top>=0&&d.top<=100000;
    if(d.type==='shoe-ui:visibility')return typeof d.visible==='boolean';
    if(d.type==='shoe-ui:toast')return typeof d.message==='string'&&d.message.length<=2000&&(!d.kind||['success','error','info'].includes(d.kind));
    return false;
  }
  function mountNotifications(doc=document){
    const store=createNotifications(),host=doc.createElement('aside'),rows=new Map();
    host.className='toast-stack';host.setAttribute('popover','manual');host.setAttribute('aria-label','操作通知');doc.body.append(host);
    function move(){
      const target=[...doc.querySelectorAll('dialog[open]')].at(-1)||doc.body;
      if(host.parentNode!==target){if(host.matches(':popover-open'))host.hidePopover();target.append(host);}
      if(store.items.length&&host.showPopover&&!host.matches(':popover-open'))host.showPopover();
    }
    const observer=new MutationObserver(move);observer.observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
    // Keep transient messages below navigation so hover-to-pause never traps its actions.
    const navigation=doc.querySelector('.nav,.topbar'),view=doc.defaultView;
    const position=()=>{const bottom=navigation?.getBoundingClientRect().bottom||0;host.style.setProperty('--toast-offset',Math.max(16,Math.min(bottom+12,view.innerHeight-80))+'px');};
    const placement=new ResizeObserver(position);if(navigation)placement.observe(navigation);
    view.addEventListener('scroll',position,{passive:true});view.addEventListener('resize',position);position();
    function createRow(item){
      const el=doc.createElement('div'),icon=doc.createElement('span'),text=doc.createElement('span'),action=doc.createElement('button'),close=doc.createElement('button');
      icon.className='toast-icon';icon.setAttribute('aria-hidden','true');action.type=close.type='button';close.setAttribute('aria-label','关闭提示');close.textContent='×';
      el.append(icon,text,action,close);
      const row={el,item,timer:null,remaining:item.duration,start:0,hover:false,focused:false};
      function pause(){if(row.timer!==null){clearTimeout(row.timer);row.timer=null;row.remaining=Math.max(0,row.remaining-(Date.now()-row.start));}}
      function resume(){if(row.destroyed||row.hover||row.focused||row.timer!==null)return;row.start=Date.now();row.timer=setTimeout(()=>store.remove(row.item.id),row.remaining);}
      row.update=next=>{
        pause();row.item=next;row.remaining=next.duration;el.className='toast-message '+next.type;el.setAttribute('role',next.type==='error'?'alert':'status');
        icon.textContent=next.type==='error'?'!':next.type==='info'?'i':'✓';text.textContent=next.message;action.hidden=!next.action;action.textContent=next.actionLabel||'重新打开';resume();
      };
      row.destroy=()=>{row.destroyed=true;pause();el.remove();};
      close.onclick=()=>store.remove(row.item.id);action.onclick=()=>{const callback=row.item.action;store.remove(row.item.id);callback?.();};
      el.onmouseenter=()=>{row.hover=true;pause();};el.onmouseleave=()=>{row.hover=false;resume();};
      el.onfocusin=()=>{row.focused=true;pause();};el.onfocusout=()=>queueMicrotask(()=>{row.focused=el.contains(doc.activeElement);resume();});
      row.update(item);host.append(el);return row;
    }
    const unsubscribe=store.subscribe(items=>{
      const ids=new Set(items.map(item=>item.id));
      for(const [id,row] of rows)if(!ids.has(id)){row.destroy();rows.delete(id);}
      for(const item of items){const row=rows.get(item.id);if(!row)rows.set(item.id,createRow(item));else if(row.item.revision!==item.revision)row.update(item);}
      if(!items.length&&host.matches(':popover-open'))host.hidePopover();move();
    });
    return {notify:(message,options)=>store.push(message,options),destroy(){observer.disconnect();placement.disconnect();view.removeEventListener('scroll',position);view.removeEventListener('resize',position);unsubscribe();rows.forEach(row=>row.destroy());if(host.matches(':popover-open'))host.hidePopover();host.remove();},store};
  }
  return {createNotifications,createOperations,workflowStep,validBridgeMessage,mountNotifications};
});
