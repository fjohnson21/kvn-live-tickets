import { effectiveTeamLeader } from './disciple-teams.js';

export function createCommunityBonus(store,{commission,order},deps={}){
  store.discipleCommunityBonuses ||= [];
  const prior=store.discipleCommunityBonuses.find(x=>x.sourceCommissionId===commission?.id);if(prior)return prior;
  if(!commission||commission.status==='reversed'||!order||order.commissionEligible===false||Number(order.amountTotal??commission.eligibleBase)<=0)return null;
  const buyer=String(order.buyerEmail||order.customer?.email||'').trim().toLowerCase();
  if(buyer&&(store.disciples||[]).some(x=>String(x.email||'').trim().toLowerCase()===buyer))return null;
  const leader=effectiveTeamLeader(store,commission.discipleId,commission.earnedAt);if(!leader)return null;
  const rate=Number(store.settings?.communityBonusPercent??2),base=Math.max(0,Number(commission.eligibleBase)||0),amount=Math.round(base*rate/100);if(!amount)return null;
  const now=(deps.now||(()=>new Date().toISOString()))(),makeId=deps.id;if(typeof makeId!=='function')throw new Error('id generator is required.');
  const bonus={id:makeId('cbo'),leaderId:leader.id,memberId:commission.discipleId,sourceCommissionId:commission.id,orderId:commission.orderId||order.id||'',eligibleBase:base,ratePercent:rate,amount,status:'pending',earnedAt:commission.earnedAt,createdAt:now,paidAt:'',paymentReference:''};
  store.discipleCommunityBonuses.push(bonus);return bonus;
}
export function reverseCommunityBonusForCommission(store,commissionId,deps={}){const bonus=(store.discipleCommunityBonuses||[]).find(x=>x.sourceCommissionId===commissionId);if(!bonus)return null;if(bonus.status==='paid')throw Object.assign(new Error('Paid Community Bonus requires a manual adjustment.'),{statusCode:409});if(bonus.status!=='reversed'){bonus.status='reversed';bonus.reversedAt=(deps.now||(()=>new Date().toISOString()))();}return bonus;}
