(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ShoeUI=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const sha256Constants=[
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  const activeCrypto=()=>typeof globalThis!=='undefined'?globalThis.crypto:null;
  const rotateRight=(value,bits)=>(value>>>bits)|(value<<(32-bits));
  const toHex=bytes=>Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
  function randomId(cryptoApi=activeCrypto()){
    if(typeof cryptoApi?.randomUUID==='function')return cryptoApi.randomUUID();
    if(typeof cryptoApi?.getRandomValues!=='function')throw Error('当前浏览器不支持安全随机数，请更换现代浏览器');
    const bytes=cryptoApi.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=toHex(bytes);return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  function sha256Fallback(bytes){
    const length=Math.ceil((bytes.length+9)/64)*64,data=new Uint8Array(length),view=new DataView(data.buffer),words=new Uint32Array(64);
    data.set(bytes);data[bytes.length]=128;view.setUint32(length-8,Math.floor(bytes.length/0x20000000));view.setUint32(length-4,(bytes.length*8)>>>0);
    const state=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    for(let offset=0;offset<length;offset+=64){
      for(let i=0;i<16;i++)words[i]=view.getUint32(offset+i*4);
      for(let i=16;i<64;i++){
        const a=words[i-15],b=words[i-2],s0=rotateRight(a,7)^rotateRight(a,18)^(a>>>3),s1=rotateRight(b,17)^rotateRight(b,19)^(b>>>10);
        words[i]=(words[i-16]+s0+words[i-7]+s1)>>>0;
      }
      let [a,b,c,d,e,f,g,h]=state;
      for(let i=0;i<64;i++){
        const s1=rotateRight(e,6)^rotateRight(e,11)^rotateRight(e,25),choice=(e&f)^(~e&g),t1=(h+s1+choice+sha256Constants[i]+words[i])>>>0;
        const s0=rotateRight(a,2)^rotateRight(a,13)^rotateRight(a,22),majority=(a&b)^(a&c)^(b&c),t2=(s0+majority)>>>0;
        h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
      }
      state[0]=(state[0]+a)>>>0;state[1]=(state[1]+b)>>>0;state[2]=(state[2]+c)>>>0;state[3]=(state[3]+d)>>>0;
      state[4]=(state[4]+e)>>>0;state[5]=(state[5]+f)>>>0;state[6]=(state[6]+g)>>>0;state[7]=(state[7]+h)>>>0;
    }
    return state.map(value=>value.toString(16).padStart(8,'0')).join('');
  }
  async function sha256(value,cryptoApi=activeCrypto()){
    const bytes=new TextEncoder().encode(String(value));
    if(cryptoApi?.subtle?.digest){const digest=await cryptoApi.subtle.digest('SHA-256',bytes);return toHex(new Uint8Array(digest));}
    return sha256Fallback(bytes);
  }
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
  return {createNotifications,createOperations,workflowStep,validBridgeMessage,mountNotifications,randomId,sha256};
});
