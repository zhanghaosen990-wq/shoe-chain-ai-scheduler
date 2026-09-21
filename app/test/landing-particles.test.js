const {test}=require('node:test');
const assert=require('node:assert/strict');
const particles=require('../ui/landing-particles');
function random(){let seed=12345;return()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};}
const stage={x:340,y:70,width:520,height:240};
function field(){return particles.createField({width:1200,height:800,stage,count:900,random:random()});}
function distance(f,key='shoe'){return f.points.reduce((sum,p)=>sum+Math.hypot(p.x-p[key].x,p.y-p[key].y),0)/f.points.length;}
function run(f,start,end,options={}){for(let elapsed=start;elapsed<=end;elapsed+=1000/30)particles.advanceField(f,1000/30,{elapsed,...options});}

test('shape sampling follows line length and keeps shoe/network points in their stage',()=>{
 assert.equal(typeof particles.samplePaths,'function');
 assert.deepEqual(particles.samplePaths([[[0,0],[4,0],[4,4]]],4),[{x:1,y:0},{x:3,y:0},{x:4,y:1},{x:4,y:3}]);
 const f=field();assert.equal(f.points.length,900);
 for(const key of ['shoe','network'])for(const p of f.points){assert.ok(p[key].x>=340&&p[key].x<=860);assert.ok(p[key].y>=70&&p[key].y<=310);}
 assert.ok(f.points.some(p=>Math.hypot(p.shoe.x-p.network.x,p.shoe.y-p.network.y)>150),'shapes differ visibly');
});
test('initial particles cover all sixteen hero sectors including corners',()=>{
 const f=field(),sectors=Array(16).fill(0);
 for(const p of f.points){assert.ok(p.x>=0&&p.x<1200&&p.y>=0&&p.y<800);sectors[Math.floor(p.y/200)*4+Math.floor(p.x/300)]++;}
 assert.ok(sectors.every(n=>n>35));
});
test('timeline converges once, then holds and interpolates shapes directly in both directions',()=>{
 assert.equal(typeof particles.formationAt,'function');
 for(const [elapsed,phase,formation,mix] of [[0,'converging','shoe',0],[2800,'settled','shoe',0],[7799,'settled','shoe',0],[9000,'settled','to-network',.5],[10200,'settled','network',1],[15199,'settled','network',1],[16400,'settled','to-shoe',.5],[17600,'settled','shoe',0],[32400,'settled','shoe',0]]){
  const state=particles.formationAt(elapsed);assert.equal(state.phase,phase);assert.equal(state.formation,formation);assert.equal(state.mix,mix);
 }
 for(const edge of [2800,7800,10200,15200,17600])assert.ok(Math.abs(particles.formationAt(edge-.01).mix-particles.formationAt(edge+.01).mix)<.001);
});
test('particles converge to shoe, morph into network and return without scattered holds',()=>{
 const f=field();run(f,0,5000);assert.ok(distance(f)<4,`shoe distance ${distance(f)}`);
 run(f,5000,12500);assert.ok(distance(f,'network')<4);
 run(f,12500,19500);assert.ok(distance(f)<4);
});
test('local pointer repulsion is gentle and returns to the active shape',()=>{
 const baseline=field(),repelled=field();run(baseline,0,4000);run(repelled,0,4000);
 const pointer={...repelled.points[0].shoe,active:true};run(baseline,4000,4700);run(repelled,4000,4700,{pointer});
 const near=[],far=[];repelled.points.forEach((p,i)=>{const displacement=Math.hypot(p.x-baseline.points[i].x,p.y-baseline.points[i].y);(Math.hypot(p.shoe.x-pointer.x,p.shoe.y-pointer.y)<70?near:far).push(displacement);});
 assert.ok(Math.max(...near)>3);assert.ok(Math.max(...near)<65);assert.ok(far.filter(d=>d<1).length>far.length*.6);
 run(repelled,4700,7000);assert.ok(distance(repelled)<4);
});
test('reduced motion displays static shoe without pointer effects or timed morphs',()=>{
 const f=field();particles.advanceField(f,33,{elapsed:0,reduced:true});const before=f.points.map(p=>[p.x,p.y]);
 particles.advanceField(f,100,{elapsed:12000,reduced:true,pointer:{x:450,y:200,active:true}});
 assert.deepEqual(f.points.map(p=>[p.x,p.y]),before);assert.equal(distance(f),0);
});
test('resize preserves normalized positions and active timeline instead of restarting scatter',()=>{
 assert.equal(typeof particles.resizeField,'function');
 const f=field();run(f,0,12000);const before=f.points.map(p=>[p.x,p.y]);
 particles.resizeField(f,{width:600,height:600,stage:{x:50,y:40,width:500,height:230}});
 assert.equal(f.points.length,900);assert.equal(f.width,600);
 f.points.forEach((p,i)=>{assert.equal(p.x,before[i][0]*.5);assert.equal(p.y,before[i][1]*.75);});
 run(f,12000,14000);assert.ok(distance(f,'network')<4);
});
