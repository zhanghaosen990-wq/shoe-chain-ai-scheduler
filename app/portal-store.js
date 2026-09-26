const fs = require('node:fs');
const path = require('node:path');
const { normalizeDemand } = require('./order-contract');
const { toAgentOrder } = require('./payload');
const { assessFactory } = require('./recommendations');
const { randomUUID, createHash } = require('node:crypto');
const {calculateFeedback,isCompleteFeedback,isSeedReview,validAnswers}=require('./feedback');
const demo = require('../data/demo_data.json');
function seed() {
  const brands = [{ id: 'BRAND-A', role: 'brand', name: '云步男鞋', city: '温州 · 永嘉', description: '都市商务鞋履品牌，专注轻商务与舒适通勤。' }, { id: 'BRAND-B', role: 'brand', name: '拾光衣舍', city: '杭州 · 滨江', description: '设计师女装品牌，关注小批量试单与精细工艺。' }];
  const factories = demo.factories.map((f, i) => ({ ...f, role: 'factory', name: f.name.replace('（模拟）', ''), description: ['专注皮鞋精工制造，支持小批量协同生产。', '灵活排期与稳定交付，服务成长中的鞋履品牌。', '高端鞋履定制与精细化生产。'][i], categories: [...f.categories], equipment: ['电脑针车 × 12', '裁断机 × 2', '定型设备 × 3'], dailyCapacity: [60, 40, 100][i], images: [], delivered: [982, 951, 960][i], deliveryTotal: 1000, qualityPassed: [995, 988, 992][i], qualityTotal: 1000 }));
  const orders = [
    { id: 'DEMO-001', brandId: 'BRAND-A', factoryId: 'FAC-A', title: '轻商务德训鞋 · 秋季补单', quantity: 300, status: 'completed', createdAt: '2026-09-01T09:00:00Z' },
    { id: 'DEMO-002', brandId: 'BRAND-A', factoryId: 'FAC-B', title: '城市通勤皮鞋', quantity: 200, status: 'production', createdAt: '2026-09-10T09:00:00Z' },
    { id: 'DEMO-003', brandId: 'BRAND-B', factoryId: 'FAC-A', title: '联名系列配套鞋履', quantity: 350, status: 'completed', createdAt: '2026-08-15T09:00:00Z' },
    { id: 'DEMO-004', brandId: 'BRAND-B', factoryId: 'FAC-C', title: '礼服配套定制皮鞋', quantity: 500, status: 'completed', createdAt: '2026-08-21T09:00:00Z' },
    { id: 'DEMO-005', brandId: 'BRAND-A', factoryId: 'FAC-B', title: '休闲鞋首批试单', quantity: 200, status: 'completed', createdAt: '2026-08-03T09:00:00Z' }
  ];
  const reviews = [
    { id: 'REVIEW-1', orderId: 'DEMO-003', brandId: 'BRAND-B', factoryId: 'FAC-A', rating: 5, comment: '车线细节整齐，交付节点反馈及时，期待继续合作。', createdAt: '2026-08-30T08:00:00Z' },
    { id: 'REVIEW-2', orderId: 'DEMO-004', brandId: 'BRAND-B', factoryId: 'FAC-C', rating: 5, comment: '样品确认认真，成品做工符合约定要求。', createdAt: '2026-09-02T08:00:00Z' },
    { id: 'REVIEW-3', orderId: 'DEMO-005', brandId: 'BRAND-A', factoryId: 'FAC-B', rating: 4, comment: '配合度高，小批量排期灵活，希望提前同步备料进度。', createdAt: '2026-08-16T08:00:00Z' }
  ];
  return { brands, factories, orders, reviews };
}
function createStore(filename) {
  let state = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : seed();
  const save = next => { fs.writeFileSync(filename + '.tmp', JSON.stringify(next, null, 2)); fs.renameSync(filename + '.tmp', filename); state = next; };
  if(state.reviews.some(r=>r.analysisStatus==='pending'))save({...state,reviews:state.reviews.map(r=>r.analysisStatus==='pending'?{...r,analysisStatus:'failed',analysisError:'分析被服务重启中断，请重试',analysisToken:null}:r)});
  const account = id => [...state.brands, ...state.factories].find(x => x.id === id);
  function requireRole(id, role) { if (account(id)?.role !== role) throw new Error('当前账号无权执行此操作。'); }
  function snapshot() {
    return { ...state, factories: state.factories.map(f => {
      const reviews = state.reviews.filter(r => r.factoryId === f.id);
      const booked = state.orders.filter(o => o.factoryId === f.id && o.status === 'production').reduce((sum, o) => sum + o.quantity, 0);
      return { ...f, analytics: { ...calculateFeedback(reviews,f.id), booked, available: Math.max(0, f.dailyCapacity * 10 - booked), daysBooked: f.dailyCapacity ? Math.ceil(booked / f.dailyCapacity) : null } };
    }), updatedAt: new Date().toISOString(), demo: true };
  }
  function syncProfile(input) {
    if (!input || typeof input.id !== 'string' || input.id.length > 80 || !['brand','factory'].includes(input.role) || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80) throw new Error('企业资料无效');
    const previous = account(input.id);
    if (previous && previous.role !== input.role) throw new Error('不能修改账号身份');
    if (!Array.isArray(input.categories) || input.categories.length > 30 || input.categories.some(c => typeof c !== 'string' || !c.trim() || c.length > 40)) throw new Error('主营品类无效');
    const defaults = input.role === 'factory' ? { equipment: [], process_capabilities: [], images: [], dailyCapacity: 0, min_order_quantity: 50, delivered: 0, deliveryTotal: 0, qualityPassed: 0, qualityTotal: 0, location: '', material_status: {}, available_capacity_by_day: Array(10).fill(0), on_time_rate: 0, data_authorization: [] } : {city: ''};
    const profile = { ...defaults, ...previous, id: input.id, role: input.role, name: input.name.trim(), contactName: String(input.contactName || '').slice(0,40), phone: String(input.phone || '').slice(0,25), description: String(input.description || '').slice(0,600), categories: input.categories };
    // Automatic login sync omits factory contacts; only explicit profile edits replace them.
    if (input.role === 'factory') for (const key of ['contactName','phone']) {
      if (!Object.hasOwn(input,key)) profile[key] = previous?.[key] ?? '';
    }
    const key = input.role === 'factory' ? 'factories' : 'brands';
    save({ ...state, [key]: previous ? state[key].map(p => p.id === input.id ? profile : p) : [...state[key], profile] });
    return snapshot();
  }
  function updateFactory(actorId, input) {
    requireRole(actorId, 'factory');
    const previous = state.factories.find(f => f.id === actorId);
    if (input.section !== undefined && !['capacity','showcase'].includes(input.section)) throw new Error('工厂资料分组无效。');
    const capacity = input.section !== 'showcase', showcase = input.section !== 'capacity';
    const positive = n => (typeof n === 'number' || (typeof n === 'string' && /^\d+$/.test(n))) && Number.isSafeInteger(Number(n)) && Number(n) > 0 && Number(n) <= 1000000;
    const list = v => Array.isArray(v) && v.length > 0 && v.length <= 30 && v.every(x => typeof x === 'string' && x.trim() && x.length <= 160);
    if (capacity && (!positive(input.min_order_quantity) || !positive(input.dailyCapacity) || !list(input.categories) || !list(input.equipment) || !list(input.process_capabilities))) throw new Error('请填写有效的品类、设备、工艺、MOQ 与日均产能。');
    if (showcase && (!Array.isArray(input.images) || input.images.length > 6 || input.images.some(x => typeof x !== 'string' || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(x) || x.length > 3000000))) throw new Error('最多上传 6 张 JPG/PNG，每张不超过 2MB。');
    if (input.section === 'showcase' && (typeof input.description !== 'string' || input.description.length > 600)) throw new Error('工厂介绍最多 600 字。');
    const updated = { ...previous,
      ...(capacity ? {categories:[...new Set(input.categories)],equipment:input.equipment,process_capabilities:input.process_capabilities,min_order_quantity:Number(input.min_order_quantity),dailyCapacity:Number(input.dailyCapacity)} : {}),
      ...(showcase ? {description:String(input.description || '').slice(0,600),images:input.images} : {})
    };
    save({ ...state, factories: state.factories.map(f => f.id === actorId ? updated : f) });
    return snapshot();
  }
  function createOrders(actorId, input) {
    requireRole(actorId, 'brand');
    if(!input || typeof input.requestId !== 'string' || !/^[a-zA-Z0-9_-]{6,100}$/.test(input.requestId))throw Error('缺少有效的提交标识');
    if(typeof input.title!=='string'||!input.title.trim()||input.title.length>160||!Array.isArray(input.allocations)||!input.allocations.length||input.allocations.length>30)throw Error('订单或工厂分配信息不完整');
    const source=input.reassignOrderId?state.orders.find(o=>o.id===input.reassignOrderId&&o.brandId===actorId):null;
    if(input.reassignOrderId&&(!source||source.status!=='rejected'))throw Error('仅能重新分配本人被拒绝的订单');
    const demand=normalizeDemand(source?.demand||input.demand);
    const total=source?source.quantity:demand.planning_context.quantity;
    const ids=new Set();const allocations=input.allocations.map(a=>{
      if(!state.factories.some(f=>f.id===a.factory_id)||ids.has(a.factory_id)||!Number.isSafeInteger(a.quantity)||a.quantity<1||a.quantity>1000000)throw Error('工厂重复、不存在或分配数量无效');
      ids.add(a.factory_id);return {factory_id:a.factory_id,quantity:a.quantity};
    });
    if(!demand.planning_context.splittable&&allocations.length>1)throw Error('该需求不允许拆单');
    if(allocations.reduce((n,a)=>n+a.quantity,0)!==total)throw Error(`分配数量之和必须为 ${total}`);
    const signature=createHash('sha256').update(JSON.stringify({title:input.title.trim(),demand,allocations,reassignOrderId:source?.id||null})).digest('hex');
    const previous=state.orders.find(o=>o.brandId===actorId&&o.requestId===input.requestId);
    if(previous){if(previous.submissionSignature!==signature)throw Error('提交标识已用于其他内容，请重新确认');return snapshot();}
    if(source?.reassignedBy)throw Error('该拒单已重新分配，不能重复提交');
    const rootDemandId=source?.rootDemandId||source?.id||randomUUID();
    const orders=allocations.map(a=>{
      const factory=snapshot().factories.find(f=>f.id===a.factory_id);
      const info=assessFactory(toAgentOrder(demand),factory,a.quantity);
      return {id:randomUUID(),requestId:input.requestId,submissionSignature:signature,rootDemandId,reassignOrderId:source?.id||null,brandId:actorId,factoryId:a.factory_id,title:input.title.trim(),quantity:a.quantity,status:'pending',createdAt:new Date().toISOString(),demand,risks:[...info.risks,'工艺、物料与正式报价均待工厂确认', ...(toAgentOrder(demand).required_processes.filter(p=>!factory.process_capabilities.includes(p)).length ? ['待确认工艺：'+toAgentOrder(demand).required_processes.filter(p=>!factory.process_capabilities.includes(p)).join('、')] : [])],rejectionReason:null};
    });
    save({...state,orders:[...orders,...state.orders.map(o=>o.id===source?.id?{...o,reassignedBy:input.requestId}:o)]});
    return snapshot();
  }
  function transition(actorId, orderId, status, options={}) {
    const order=state.orders.find(o=>o.id===orderId);
    const role=account(actorId)?.role;
    const ownFactory=role==='factory'&&actorId===order?.factoryId;
    const ownBrand=role==='brand'&&actorId===order?.brandId;
    const valid=order&&((ownFactory&&order.status==='pending'&&['production','rejected'].includes(status))||((ownFactory||ownBrand)&&order.status==='production'&&status==='completed'));
    if(!valid)throw Error('当前账号不能执行此订单状态变更。');
    if(status==='rejected'&&(typeof options.reason!=='string'||!options.reason.trim()||options.reason.length>500))throw Error('请填写 1–500 字拒绝原因');
    if(status==='production'&&order.demand){
      const f=snapshot().factories.find(f=>f.id===order.factoryId),capacity=assessFactory(toAgentOrder(order.demand),f,order.quantity);
      if((order.quantity<f.min_order_quantity||order.quantity>capacity.available)&&options.confirmRisks!==true)throw Error('该订单存在 MOQ 或产能风险，请确认后接单');
    }
    save({...state,orders:state.orders.map(o=>o.id===orderId?{...o,status,updatedAt:new Date().toISOString(),...(status==='rejected'?{rejectionReason:options.reason.trim()}:{ }),...(status==='production'?{risksConfirmed:options.confirmRisks===true}:{})}:o)});
    return snapshot();
  }
  function review(actorId, input) {
    requireRole(actorId, 'brand');
    const order = state.orders.find(o => o.id === input.orderId && o.brandId === actorId);
    if (!order || order.status !== 'completed') throw Error('仅能评价本人已完成的订单。');
    const previous=state.reviews.find(r=>r.orderId===order.id);
    if(previous&&isSeedReview(previous))throw Error('预置示例评价不支持补填，不计入履约指标。');
    if(previous&&isCompleteFeedback(previous))throw Error('该订单已提交履约反馈，请勿重复提交。');
    if(!validAnswers(input)||typeof input.comment!=='string'||input.comment.length>500)throw Error('请选择交货情况、质量档位和 1–5 星；自由反馈最多 500 字。');
    if(!Number.isSafeInteger(order.quantity)||order.quantity<1)throw Error('订单分配数量无效，无法计算履约权重。');
    const now=new Date().toISOString(),comment=input.comment.trim();
    const next={...previous,id:previous?.id||randomUUID(),source:'user',orderId:order.id,brandId:actorId,factoryId:order.factoryId,rating:input.rating,comment,createdAt:previous?.createdAt||now,delivery:input.delivery,quality:input.quality,feedbackVersion:1,feedbackSubmittedAt:now,orderQuantity:order.quantity,tags:[],analysisStatus:comment?'pending':'skipped',analysisError:null};
    save({...state,reviews:previous?state.reviews.map(r=>r.id===previous.id?next:r):[next,...state.reviews]});
    return snapshot();
  }
  function beginReviewAnalysis(actorId,reviewId){
    requireRole(actorId,'brand');
    const review=state.reviews.find(r=>r.id===reviewId&&r.brandId===actorId);
    if(!review||!isCompleteFeedback(review))throw Error('仅可分析本人已提交的完整履约反馈。');
    if(!review.comment)return null;
    if(review.analysisStatus==='completed')return null;
    const token=randomUUID();
    save({...state,reviews:state.reviews.map(r=>r.id===reviewId?{...r,analysisStatus:'pending',analysisToken:token,analysisError:null}:r)});
    return {id:review.id,comment:review.comment,token};
  }
  function finishReviewAnalysis(reviewId,token,result){
    const current=state.reviews.find(r=>r.id===reviewId);
    if(!current||current.analysisToken!==token)return;
    save({...state,reviews:state.reviews.map(r=>r.id===reviewId?{...r,tags:result.tags||[],analysisStatus:result.status,analysisError:result.error||null,analysisFinishedAt:new Date().toISOString()}:r)});
  }
  return { snapshot, account, syncProfile, updateFactory, createOrders, transition, review, beginReviewAnalysis, finishReviewAnalysis };
}
module.exports = { createStore };
