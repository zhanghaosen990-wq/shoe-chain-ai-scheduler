/* Landing shape particles. Geometry is sampled once; animation is linear in particle count. */
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
const INTRO_MS=2800,HOLD_MS=5000,MORPH_MS=2400,CYCLE_MS=14800;
// Sneaker outline, sole, heel, quarter panel and laces, sampled as the canonical shoe geometry.
const SHOE_PATHS=[
 [[.10,.64],[.12,.49],[.17,.29],[.22,.28],[.29,.39],[.39,.35],[.46,.42],[.55,.48],[.68,.54],[.79,.56],[.88,.60],[.91,.67],[.88,.72],[.78,.75],[.50,.74],[.29,.71],[.12,.72],[.10,.64]],
 [[.11,.67],[.26,.67],[.48,.70],[.76,.71],[.87,.69],[.91,.67]],
 [[.12,.73],[.13,.79],[.29,.79],[.31,.74],[.52,.79],[.80,.80],[.89,.77],[.91,.72],[.91,.67]],
 [[.18,.32],[.18,.49],[.14,.62]],[[.29,.39],[.33,.51],[.40,.59],[.47,.60],[.57,.51]],
 [[.39,.36],[.41,.44],[.47,.47],[.52,.47]],[[.33,.43],[.44,.40]],[[.35,.47],[.47,.44]],[[.38,.51],[.50,.48]],[[.64,.56],[.61,.65],[.65,.70]]
];
const NODES=[[.17,.38],[.40,.21],[.76,.30],[.84,.65],[.52,.76],[.22,.69],[.50,.47]];
const EDGES=[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[0,6],[1,6],[2,6],[3,6],[4,6],[5,6]];
function samplePaths(paths,count){
 const segments=[];let total=0;
 for(const path of paths)for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  if(length){total+=length;segments.push({a,b,length,end:total});}
 }
 if(!segments.length)return [];
 let index=0;
 return Array.from({length:count},(_,i)=>{
  const distance=(i+.5)/count*total;while(index<segments.length-1&&segments[index].end<distance)index++;
  const {a,b,length,end}=segments[index],t=(distance-end+length)/length;
  return {x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t};
 });
}
function shapeTargets(stage,count){
 const networkPaths=EDGES.map(([a,b])=>[NODES[a],NODES[b]]);
 for(const [x,y] of NODES)networkPaths.push(Array.from({length:25},(_,i)=>[x+Math.cos(i*Math.PI/12)*.028,y+Math.sin(i*Math.PI/12)*.05]));
 const map=p=>({x:stage.x+p.x*stage.width,y:stage.y+p.y*stage.height});
 return {shoe:samplePaths(SHOE_PATHS,count).map(p=>map({x:p.x,y:(p.y-.28)*1.4+.14})),network:samplePaths(networkPaths,count).map(map)};
}
function formationAt(elapsed,reduced=false){
 if(reduced)return {phase:'settled',formation:'shoe',mix:0,convergence:1};
 if(elapsed<INTRO_MS)return {phase:'converging',formation:'shoe',mix:0,convergence:smooth(elapsed/INTRO_MS)};
 const cycle=(elapsed-INTRO_MS)%CYCLE_MS;
 if(cycle<HOLD_MS)return {phase:'settled',formation:'shoe',mix:0,convergence:1};
 if(cycle<HOLD_MS+MORPH_MS)return {phase:'settled',formation:'to-network',mix:smooth((cycle-HOLD_MS)/MORPH_MS),convergence:1};
 if(cycle<HOLD_MS*2+MORPH_MS)return {phase:'settled',formation:'network',mix:1,convergence:1};
 return {phase:'settled',formation:'to-shoe',mix:1-smooth((cycle-HOLD_MS*2-MORPH_MS)/MORPH_MS),convergence:1};
}
function createField({width,height,stage,count=width<720?450:900,random=Math.random}){
 stage=stage||{x:width*.2,y:height*.1,width:width*.6,height:height*.3};
 const targets=shapeTargets(stage,count),columns=Math.ceil(Math.sqrt(count*width/height)),rows=Math.ceil(count/columns);
 const points=Array.from({length:count},(_,i)=>{
  const sx=(i%columns+random())/columns*width,sy=(Math.floor(i/columns)+random())/rows*height;
  return {x:sx,y:sy,sx,sy,shoe:targets.shoe[i],network:targets.network[(i*137)%count],vx:0,vy:0,
   phase:random()*Math.PI*2,radius:.75+random()*.75,tone:i%5===0?1:0,alpha:.42+random()*.48};
 });
 return {width,height,stage,points};
}
function resizeField(field,{width,height,stage}){
 const targets=shapeTargets(stage,field.points.length),rx=width/field.width,ry=height/field.height;
 field.points.forEach((p,i)=>{
  p.x*=rx;p.y*=ry;p.sx*=rx;p.sy*=ry;p.vx*=rx;p.vy*=ry;
  p.shoe=targets.shoe[i];p.network=targets.network[(i*137)%field.points.length];
 });
 Object.assign(field,{width,height,stage});return field;
}
function advanceField(field,delta,{elapsed=0,pointer,reduced=false}={}){
 const state=formationAt(elapsed,reduced),step=Math.min(delta,50)/16.667,time=elapsed/1000;
 const floatX=Math.sin(time*.48)*1.4,floatY=Math.cos(time*.39)*1.2;
 for(const p of field.points){
  if(reduced){p.x=p.shoe.x;p.y=p.shoe.y;p.vx=p.vy=0;continue;}
  const targetX=p.shoe.x+(p.network.x-p.shoe.x)*state.mix,targetY=p.shoe.y+(p.network.y-p.shoe.y)*state.mix;
  const goalX=p.sx+(targetX-p.sx)*state.convergence+floatX,goalY=p.sy+(targetY-p.sy)*state.convergence+floatY;
  p.vx+=(goalX-p.x)*.034*step;p.vy+=(goalY-p.y)*.034*step;
  if(pointer?.active){
   const dx=p.x-pointer.x,dy=p.y-pointer.y,d2=dx*dx+dy*dy,radius=85;
   if(d2<radius*radius){
    const distance=Math.sqrt(d2),force=(1-distance/radius)**2*1.5;
    p.vx+=(distance>.01?dx/distance:Math.cos(p.phase))*force*step;
    p.vy+=(distance>.01?dy/distance:Math.sin(p.phase))*force*step;
   }
  }
  const damping=Math.pow(.76,step);p.vx*=damping;p.vy*=damping;p.x+=p.vx*step;p.y+=p.vy*step;
 }
 return state;
}
function mountLandingParticles(canvas){
 if(!canvas)return()=>{};
 const hero=canvas.closest('.landing-hero'),stageElement=hero?.querySelector('.landing-particle-stage'),title=hero?.querySelector('.particle-title');
 let ctx;try{ctx=canvas.getContext('2d');}catch{}
 let announced=false;
 const announce=()=>{if(!announced){announced=true;window.dispatchEvent(new CustomEvent('shoe-ui:landing-settled'));}};
 Object.assign(canvas.dataset,{mode:'showcase',ready:'false',phase:'converging',formation:'shoe',animating:'false',particleCount:'0',pointerMoves:'0'});
 if(!ctx||!hero||!stageElement){canvas.dataset.phase='settled';announce();return()=>{};}
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)'),pointer={x:0,y:0,active:false};
 let width=0,height=0,field=null,elapsed=0,last=null,raf=0,layoutRaf=0,disposed=false,visible=true,titleRect=null,colors=[];
 function updateState(state=formationAt(elapsed,reduced.matches)){
  canvas.dataset.phase=state.phase;canvas.dataset.formation=state.formation;
  if(state.phase==='settled')announce();
 }
 function draw(){
  if(!field)return;
  ctx.clearRect(0,0,width,height);
  for(const p of field.points){
   if(p.x<0||p.x>width||p.y<0||p.y>height)continue;
   // The DOM title remains the foreground; particles passing behind it are softened.
   const behind=titleRect&&p.x>titleRect.x-18&&p.x<titleRect.x+titleRect.width+18&&p.y>titleRect.y-10&&p.y<titleRect.y+titleRect.height+10;
   ctx.globalAlpha=p.alpha*(behind?.14:1);ctx.fillStyle=colors[p.tone];
   ctx.beginPath();ctx.arc(p.x,p.y,p.radius,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
 }
 function active(){return !disposed&&!!field&&visible&&!document.hidden&&!reduced.matches;}
 function frame(time){
  raf=0;if(!active()){canvas.dataset.animating='false';return;}
  if(last===null)last=time;
  const delta=time-last;
  if(delta>=1000/30-.1){last=time;elapsed+=Math.min(delta,100);updateState(advanceField(field,delta,{elapsed,pointer}));draw();}
  raf=requestAnimationFrame(frame);
 }
 function sync(){
  cancelAnimationFrame(raf);raf=0;last=null;
  if(reduced.matches&&field){elapsed=Math.max(elapsed,INTRO_MS);advanceField(field,0,{elapsed,reduced:true});updateState();draw();}
  canvas.dataset.animating=String(active());if(active())raf=requestAnimationFrame(frame);
 }
 function complete(){
  elapsed=INTRO_MS;pointer.active=false;
  if(field){advanceField(field,0,{elapsed,reduced:true});draw();}updateState();sync();
 }
 function size(){
  const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
  width=rect.width;height=rect.height;
  const relative=element=>{const r=element.getBoundingClientRect();return {x:r.left-rect.left,y:r.top-rect.top,width:r.width,height:r.height};};
  const stage=relative(stageElement);titleRect=title?relative(title):null;
  const styles=getComputedStyle(canvas);colors=[styles.getPropertyValue('--particle').trim()||'#60A5FA',styles.getPropertyValue('--particle-light').trim()||'#93C5FD'];
  const dpr=Math.min(window.devicePixelRatio||1,1.5);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  if(field){
   resizeField(field,{width,height,stage});
   const count=width<720?450:900;
   if(count!==field.points.length){
    const old=field,next=createField({width,height,stage,count});
    next.points.forEach((p,i)=>{const previous=old.points[Math.floor(i*old.points.length/count)];for(const key of ['x','y','sx','sy','vx','vy'])p[key]=previous[key];});field=next;
   }
  }else field=createField({width,height,stage});
  canvas.dataset.ready='true';canvas.dataset.particleCount=String(field.points.length);updateState();draw();sync();
 }
 function resize(){cancelAnimationFrame(layoutRaf);layoutRaf=requestAnimationFrame(()=>{layoutRaf=0;if(!disposed)size();});}
 function move(event){
  if(reduced.matches||event.pointerType==='touch')return;
  const rect=canvas.getBoundingClientRect();pointer.x=event.clientX-rect.left;pointer.y=event.clientY-rect.top;
  pointer.active=pointer.x>=0&&pointer.x<=rect.width&&pointer.y>=0&&pointer.y<=rect.height;
  if(pointer.active)canvas.dataset.pointerMoves=String(Number(canvas.dataset.pointerMoves)+1);
 }
 function leave(){pointer.active=false;}
 const observer=new ResizeObserver(resize);observer.observe(canvas);observer.observe(stageElement);if(title)observer.observe(title);
 const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();});intersection.observe(hero);
 window.addEventListener('pointermove',move,{passive:true});window.addEventListener('blur',leave);window.addEventListener('scroll',leave,{passive:true});document.addEventListener('pointerleave',leave);
 window.addEventListener('shoe-ui:particle-settle',complete);document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
 size();document.fonts?.ready.then(()=>{if(!disposed)resize();});
 return()=>{
  disposed=true;cancelAnimationFrame(raf);cancelAnimationFrame(layoutRaf);observer.disconnect();intersection.disconnect();
  window.removeEventListener('pointermove',move);window.removeEventListener('blur',leave);window.removeEventListener('scroll',leave);document.removeEventListener('pointerleave',leave);
  window.removeEventListener('shoe-ui:particle-settle',complete);document.removeEventListener('visibilitychange',sync);reduced.removeEventListener('change',sync);
  canvas.dataset.animating='false';
 };
}
module.exports={samplePaths,shapeTargets,formationAt,createField,resizeField,advanceField,mountLandingParticles};
