// Spread a demand across selected factories only when all known limits can be met.
function distribute(total, factories) {
 if(!factories.length || !Number.isSafeInteger(total) || total<=0) return null;
 const limits=factories.map(f=>({...f,min:Math.max(1,Math.ceil(f.min||1)),max:Math.floor(f.max)}));
 if(limits.some(f=>!Number.isFinite(f.max)||f.max<f.min)||limits.reduce((n,f)=>n+f.min,0)>total||limits.reduce((n,f)=>n+f.max,0)<total)return null;
 const result=Object.fromEntries(limits.map(f=>[f.id,f.min]));
 let remaining=total-limits.reduce((n,f)=>n+f.min,0);
 while(remaining>0){
  const open=limits.filter(f=>result[f.id]<f.max),share=Math.ceil(remaining/open.length);
  for(const f of open){const extra=Math.min(share,remaining,f.max-result[f.id]);result[f.id]+=extra;remaining-=extra;}
 }
 return result;
}
module.exports={distribute};
