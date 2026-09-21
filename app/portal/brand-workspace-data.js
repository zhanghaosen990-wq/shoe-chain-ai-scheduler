const {isCompleteFeedback,isSeedReview} = require('../feedback');

const ORDER_STATES = [
  {id:'pending',label:'待接单'},
  {id:'production',label:'生产中'},
  {id:'completed',label:'已完成'},
  {id:'rejected',label:'已拒绝'},
];
const orderTime = order => Date.parse(order.updatedAt || order.createdAt) || 0;

function getBrandSummary(data,brandId) {
  const orders=data.orders.filter(o=>o.brandId===brandId).sort((a,b)=>orderTime(b)-orderTime(a));
  const reviews=data.reviews.filter(r=>r.brandId===brandId);
  const partners=data.factories.filter(f=>orders.some(o=>o.factoryId===f.id));
  const counts=Object.fromEntries(ORDER_STATES.map(s=>[s.id,orders.filter(o=>o.status===s.id).length]));
  const attention=[];
  for(const order of orders) {
    if(order.status==='rejected'&&!order.reassignedBy&&order.demand)attention.push({order,kind:'reassign'});
    const review=reviews.find(r=>r.orderId===order.id);
    if(order.status==='completed'&&(!review||(!isCompleteFeedback(review)&&!isSeedReview(review))))attention.push({order,kind:'review'});
  }
  attention.sort((a,b)=>Number(b.kind==='reassign')-Number(a.kind==='reassign'));
  return {orders,reviews,partners,counts,active:counts.pending+counts.production,attention};
}

function filterOrders(orders,factories,{status='all',query=''}={}) {
  const needle=query.trim().toLocaleLowerCase();
  return orders.filter(o=>(status==='all'||o.status===status||(status==='active'&&['pending','production'].includes(o.status)))&&(!needle||
    [o.title,o.id,o.rootDemandId,factories.find(f=>f.id===o.factoryId)?.name].filter(Boolean).join(' ').toLocaleLowerCase().includes(needle)));
}

function pageItems(items,requestedPage=1,size=10) {
  const pages=Math.max(1,Math.ceil(items.length/size));
  const page=Math.min(pages,Math.max(1,Math.floor(Number(requestedPage))||1));
  return {items:items.slice((page-1)*size,page*size),page,pages,total:items.length};
}

module.exports={ORDER_STATES,getBrandSummary,filterOrders,pageItems};
