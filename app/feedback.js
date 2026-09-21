// One statistics contract used by both the Node API and React client.
const DELIVERY={on_time:{label:'按时 / 提前交付',value:100},minor_delay:{label:'轻微延期 1–2 天',value:90},late:{label:'延期 3 天及以上',value:70}};
const QUALITY={perfect:{label:'完美 · 99%–100%',value:99.5},good:{label:'良好 · 95%–98%',value:96.5},fair:{label:'一般 / 有瑕疵 · 90%–94%',value:92},poor:{label:'较差 · 低于 90%',value:85}};
const own=(map,key)=>Object.prototype.hasOwnProperty.call(map,key);
function isSeedReview(review){return review.source==='seed'||['REVIEW-1','REVIEW-2','REVIEW-3'].includes(review.id);}
function validAnswers(r){return own(DELIVERY,r.delivery)&&own(QUALITY,r.quality)&&Number.isInteger(r.rating)&&r.rating>=1&&r.rating<=5;}
function isCompleteFeedback(r){return !isSeedReview(r)&&r.feedbackVersion===1&&validAnswers(r)&&Number.isSafeInteger(r.orderQuantity)&&r.orderQuantity>0&&typeof r.feedbackSubmittedAt==='string'&&Number.isFinite(Date.parse(r.feedbackSubmittedAt));}
function calculateFeedback(reviews,factoryId){
 const valid=reviews.filter(r=>r.factoryId===factoryId&&isCompleteFeedback(r)),count=valid.length,round=n=>Math.round(n*10)/10;
 const weight=valid.reduce((n,r)=>n+r.orderQuantity,0);
 return {deliveryRate:count?round(valid.reduce((n,r)=>n+DELIVERY[r.delivery].value*r.orderQuantity,0)/weight):null,qualityRate:count?round(valid.reduce((n,r)=>n+QUALITY[r.quality].value,0)/count):null,rating:count?round(valid.reduce((n,r)=>n+r.rating,0)/count):null,reviewCount:count,feedbackCount:count,feedbackQuantity:weight,statisticsBasis:'all_complete_feedback_v1',qualityEstimated:true};
}
module.exports={DELIVERY,QUALITY,isSeedReview,validAnswers,isCompleteFeedback,calculateFeedback};
