const ORDER_CACHE='shoe-orders-v1';
function pendingOrders(orders,account){return account?.role==='factory'?(orders||[]).filter(o=>o.factoryId===account.id&&o.status==='pending'):[];}
// API is authoritative. Keep only notification metadata here, not large image/BOM payloads.
function cacheOrders(storage,orders){try{const value=JSON.stringify(orders.map(o=>({id:o.id,brandId:o.brandId,factoryId:o.factoryId,title:o.title,quantity:o.quantity,status:o.status,createdAt:o.createdAt,category:o.demand?.planning_context?.category,deadlineDays:o.demand?.planning_context?.deadline_days,cooperationMode:o.demand?.production_requirements?.cooperation_mode})));if(storage.getItem(ORDER_CACHE)!==value)storage.setItem(ORDER_CACHE,value);}catch{/* Storage quota/privacy settings must not break successful API operations. */}}
module.exports={pendingOrders,cacheOrders,ORDER_CACHE};
