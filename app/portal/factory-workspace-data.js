const time=order=>Date.parse(order.updatedAt||order.createdAt)||0;
function factoryOrders(orders,factoryId){return orders.filter(o=>o.factoryId===factoryId).sort((a,b)=>time(b)-time(a)||a.id.localeCompare(b.id));}
function previewOrders(orders){return [...orders].sort((a,b)=>Number(b.status==='pending')-Number(a.status==='pending')||time(b)-time(a)||a.id.localeCompare(b.id)).slice(0,3);}
function filterFactoryOrders(orders,brands,{status='all',query=''}={}){
 const needle=query.trim().toLocaleLowerCase();
 return orders.filter(o=>(status==='all'||o.status===status)&&(!needle||[o.title,o.id,o.rootDemandId,brands.find(b=>b.id===o.brandId)?.name].filter(Boolean).join(' ').toLocaleLowerCase().includes(needle)));
}
function orderPageFor(orders,id){const index=orders.findIndex(o=>o.id===id);return index<0?null:Math.floor(index/10)+1;}
module.exports={factoryOrders,previewOrders,filterFactoryOrders,orderPageFor};
