import { normalizeDiscipleApplication } from './disciple-application.js';

export function receiveDiscipleApplication(store,payload,evidence,deps={}){
  store.discipleApplications ||= [];store.auditLogs ||= [];
  const prior=store.discipleApplications.find(item=>item.idempotencyKey===evidence.idempotencyKey&&item.sourceSystem===evidence.sourceSystem);
  if(prior)return {store,application:prior,created:false};
  const now=(deps.now||(()=>new Date().toISOString()))();
  const normalized=normalizeDiscipleApplication(payload,{...evidence,acceptedAt:evidence.acceptedAt||now});
  const requestedLeader=String(payload?.recruitingLeaderHandle||'').trim().toLowerCase();
  const recruitingLeader=(store.disciples||[]).find(item=>String(item.handle||'').toLowerCase()===requestedLeader&&item.status==='active'&&item.isKingdomLeader===true);
  normalized.recruitingLeaderHandle=recruitingLeader?.handle||'';
  normalized.recruitingLeaderId=recruitingLeader?.id||'';
  const duplicateRisk=store.discipleApplications.some(item=>['submitted','resubmitted','needs_info','approved'].includes(item.status)&&(String(item.email).toLowerCase()===normalized.email||item.mobile===normalized.mobile));
  const makeId=deps.id||((prefix)=>`${prefix}_${Math.random().toString(36).slice(2,14)}`);
  const applicationReference=`KVN-D-${now.slice(0,10).replaceAll('-','')}-${makeId('ref').replace(/[^a-z0-9]/gi,'').slice(-8).toUpperCase().padStart(8,'0')}`;
  const application={id:makeId('dapp'),applicationReference,status:'submitted',...normalized,duplicateRisk,submittedAt:now,createdAt:now,updatedAt:now};
  store.discipleApplications.unshift(application);
  store.auditLogs.unshift({id:makeId('log'),action:'disciple.application_submitted',entityType:'disciple_application',entityId:application.id,meta:{applicationReference,sourceSystem:application.sourceSystem,duplicateRisk},createdAt:now});
  return {store,application,created:true};
}
