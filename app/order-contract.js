const { normalizeBomData }=require('./payload');
function normalizeDemand(input){
 if(!input||typeof input!=='object')throw Error('请提交完整需求');
 const p=input.planning_context||{},r=input.production_requirements||{};
 if(!Number.isSafeInteger(p.quantity)||p.quantity<1||p.quantity>1000000||!Number.isSafeInteger(p.deadline_days)||p.deadline_days<1||p.deadline_days>365||typeof p.category!=='string'||!p.category.trim()||p.category.length>80)throw Error('需求数量、品类或交期无效');
 const bom=normalizeBomData(input.bom_data);if(!bom.style_name||!bom.sku_code||!bom.craftsmanship||Object.values(bom).some(v=>v.length>10000))throw Error('请填写款式、货号和制作工艺');
 const images=input.sample_images||[];if(!Array.isArray(images)||images.length>8||images.some(x=>typeof x!=='string'||!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(x)||x.length>8000000))throw Error('样品图片无效或超过大小限制');
 if(typeof r.cooperation_mode!=='string'||r.cooperation_mode.length>80||typeof r.special_notes!=='string'||r.special_notes.length>10000)throw Error('合作方式或备注无效');
 return {bom_data:bom,sample_images:images,planning_context:{category:p.category.trim(),quantity:p.quantity,deadline_days:p.deadline_days,splittable:p.splittable!==false},production_requirements:{cooperation_mode:r.cooperation_mode,special_notes:r.special_notes}};
}
module.exports={normalizeDemand};
