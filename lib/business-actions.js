import crypto from 'node:crypto';
import {CRM_STATUSES,PARTNER_STAGES} from './crm-records.js';
import {ensureMarketing,validateDraft} from './marketing.js';
import {applyFinanceAction,financeSummary} from './business-finance.js';
import {transitionFulfillment,collectShopFulfillment} from './shop-fulfillment.js';
const bad=(message,statusCode=400)=>Object.assign(Error(message),{statusCode});
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v??null)).digest('hex');
const definitions=[['event.update','Edit event details','kvn:edit'],['crm.update','Update lead / partner disposition','kvn:edit'],['finance.record','Record or correct finance entry','kvn:edit'],['fulfillment.transition','Update apparel fulfillment','kvn:edit'],['campaign.save','Save campaign draft','kvn:edit'],['campaign.send','Release approved email broadcast','kvn:send']];
function principalId(p){if(p?.role!=='owner'||!(p.id||p.sub))throw bad('Owner access required.',403);return p.id||p.sub;}
function permission(p,name){principalId(p);const def=definitions.find(d=>d[0]===name);if(!def)throw bad('Unknown business action.');if(!p.scopes?.includes(def[2]))throw bad('This action permission is required.',403);return def;}
export function listBusinessActions(principal){principalId(principal);return definitions.filter(d=>principal.scopes?.includes(d[2])).map(([name,label,scope])=>({name,label,scope}));}
export function createBusinessActionService({readStore,writeStore,campaignTransport,now=()=>Date.now()}={}){
 const target=(d,name,a)=>{switch(name){case 'event.update':return d.events?.find(e=>e.id===a.eventId);case 'crm.update':return d.crmRecords?.find(e=>e.id===a.recordId);case 'finance.record':return d.businessFinance||null;case 'fulfillment.transition':return collectShopFulfillment(d).filter(r=>a.itemIds?.includes(r.id));case 'campaign.save':case 'campaign.send':return d.marketing||null;}};
 const validate=(d,name,a,actor)=>{
  if(!a||Array.isArray(a)||typeof a!=='object')throw bad('Action arguments are required.');
  if(name==='event.update'){const e=target(d,name,a);if(!e)throw bad('Choose an exact existing event ID.',404);const patch=a.patch,allowed=['title','subtitle','description','date','venue','location'];if(!patch||!Object.keys(patch).length||Object.keys(patch).some(k=>!allowed.includes(k)))throw bad('Choose supported event detail fields.');for(const [k,v]of Object.entries(patch))if(typeof v!=='string'||v.length>(k==='description'?5000:300)||k==='title'&&!v.trim()||k==='date'&&!Number.isFinite(Date.parse(v)))throw bad('Invalid event detail: '+k);return {before:Object.fromEntries(Object.keys(patch).map(k=>[k,e[k]||''])),after:patch,target:e.id};}
  if(name==='crm.update'){const r=target(d,name,a),p=a.patch;if(!r)throw bad('Choose an exact lead record ID.',404);if(!p||!Object.keys(p).length||Object.keys(p).some(k=>!['workflowStatus','partnerStage','followUpDate','note'].includes(k)))throw bad('Choose supported disposition fields.');if(p.workflowStatus&&!CRM_STATUSES.includes(p.workflowStatus)||p.partnerStage&&!PARTNER_STAGES.includes(p.partnerStage)||p.followUpDate!==undefined&&p.followUpDate!==null&&!/^\d{4}-\d\d-\d\d$/.test(p.followUpDate)||p.note!==undefined&&(typeof p.note!=='string'||!p.note.trim()||p.note.length>4000))throw bad('Invalid lead disposition.');return {before:{workflowStatus:r.workflowStatus,partnerStage:r.partnerStage,followUpDate:r.followUpDate},after:p,target:r.id};}
  if(name==='finance.record'){const copy=structuredClone(d);applyFinanceAction(copy,{kind:a.kind,input:a.input,expectedRevision:d.businessFinance?.revision||0,requestId:'preview-'+crypto.randomUUID(),actor});return {before:financeSummary(d,{}),after:financeSummary(copy,{}),target:'business-finance'};}
  if(name==='fulfillment.transition'){const rows=target(d,name,a),expectedRevision=Object.fromEntries(rows.map(r=>[r.id,r.revision]));transitionFulfillment(structuredClone(d),{...a,expectedRevision,requestId:'preview-'+crypto.randomUUID(),actor});return {before:rows.map(r=>({id:r.id,state:r.state,revision:r.revision})),after:{transition:a.transition,itemIds:a.itemIds,details:a.details},target:a.itemIds.join(',')};}
  ensureMarketing(d);if(name==='campaign.save'){const c=a.campaignId?d.marketing.campaigns.find(c=>c.id===a.campaignId):null;if(a.campaignId&&!c)throw bad('Campaign not found.',404);if(c&&c.status!=='draft')throw bad('Only a draft can be edited.',409);const draft=validateDraft(a.draft,d.marketing);return {before:c?{subject:c.subject,body:c.body,listIds:c.listIds}:null,after:draft,target:c?.id||'new-draft'};}
  const c=d.marketing.campaigns.find(c=>c.id===a.campaignId);if(!c||c.status!=='draft')throw bad('Choose an unsent draft campaign.',409);if(!campaignTransport)throw bad('The existing broadcast service must be configured before chat can send.',503);return {before:{status:c.status},after:{subject:c.subject,listIds:c.listIds},target:c.id};
 };
 async function prepare({principal,name,args}){
  permission(principal,name);const actor=principalId(principal),a=structuredClone(args),d=readStore(),review=validate(d,name,a,actor);let transportReview;
  if(name==='campaign.send'){const p=await campaignTransport.preview(a.campaignId);transportReview={previewToken:p.previewToken,count:p.count,subject:p.campaign?.subject||p.content?.subject,listIds:p.campaign?.listIds};if(!p.previewToken||!Number.isSafeInteger(p.count)||!p.count)throw bad('Preview must identify a nonempty approved broadcast audience.',409);review.after={...review.after,recipientCount:p.count,subject:transportReview.subject};}
  const latest=readStore(),operationId=crypto.randomUUID(),expiresAt=new Date(now()+15*60*1000).toISOString(),snapshot=hash(target(latest,name,a));(latest.businessOperations??=[]).push({operationId,actor,name,args:a,snapshot,review,transportReview,expiresAt,status:'prepared'});writeStore(latest);return {operationId,...review,expectedRevision:snapshot,expiresAt,requirements:name==='campaign.send'?['Review exact draft and recipient count before release.']:['Review proposed changes.']};
 }
 async function execute({principal,operationId,requestId}){
  const actor=principalId(principal);if(typeof requestId!=='string'||!requestId||requestId.length>128)throw bad('A request ID is required.');let d=readStore(),op=d.businessOperations?.find(o=>o.operationId===operationId&&o.actor===actor);if(!op)throw bad('Prepared operation not found.',404);permission(principal,op.name);
  if(op.status==='complete'||op.status==='needs_review')return {...op.result,replayed:true};if(op.status==='executing')return {status:'needs_review',message:'This operation may already have executed. Review its history before retrying.'};
  if(Date.parse(op.expiresAt)<=now())throw bad('Prepared action expired. Prepare it again.',409);if(hash(target(d,op.name,op.args))!==op.snapshot)throw bad('The record or audience changed. Prepare the action again.',409);
  const previous=(d.businessActionAudit||[]).find(r=>r.requestId===requestId&&r.actor===actor);if(previous&&previous.operationId!==operationId)throw bad('Request ID belongs to another action.',409);
  validate(d,op.name,op.args,actor);const a=op.args;let result;
  if(op.name==='campaign.send'){
   op.status='executing';op.requestId=requestId;writeStore(d);
   try{const p=await campaignTransport.preview(a.campaignId);if(p.previewToken!==op.transportReview.previewToken||p.count!==op.transportReview.count)throw bad('Draft or audience changed before release.',409);const response=await campaignTransport.release(a.campaignId,p.previewToken);result={status:'complete',result:response};}catch(error){result={status:'needs_review',message:'Broadcast result requires review. Inspect the saved campaign and provider status before any resend.'};}
   d=readStore();op=d.businessOperations.find(o=>o.operationId===operationId);
  }else{
   if(op.name==='event.update'){Object.assign(target(d,op.name,a),a.patch);result={eventId:a.eventId,message:'Event details updated.'};}
   if(op.name==='crm.update'){const r=target(d,op.name,a),{note,...fields}=a.patch;Object.assign(r,fields,{revision:(r.revision||0)+1,updatedAt:new Date(now()).toISOString()});(d.crmActivities??=[]).push({id:crypto.randomUUID(),recordId:r.id,actorId:actor,action:'crm.update',changedFields:Object.keys(fields),note:note||'',createdAt:new Date(now()).toISOString()});result={recordId:r.id,message:'Disposition saved.'};}
   if(op.name==='finance.record')result=applyFinanceAction(d,{kind:a.kind,input:a.input,expectedRevision:d.businessFinance?.revision||0,requestId:operationId,actor}).result;
   if(op.name==='fulfillment.transition')result=transitionFulfillment(d,{...a,expectedRevision:Object.fromEntries(target(d,op.name,a).map(r=>[r.id,r.revision])),requestId:operationId,actor}).result;
   if(op.name==='campaign.save'){ensureMarketing(d);let c=d.marketing.campaigns.find(c=>c.id===a.campaignId);const draft=validateDraft(a.draft,d.marketing);if(c)Object.assign(c,draft,{revision:(c.revision||0)+1});else{c={...draft,id:crypto.randomUUID(),status:'draft',revision:1,recipients:[],createdAt:new Date(now()).toISOString()};d.marketing.campaigns.push(c);}result={campaignId:c.id,status:'draft',message:'Draft saved. No email was sent.'};}
   result={status:'complete',result};
  }
  op.status=result.status;op.result=result;op.completedAt=new Date(now()).toISOString();const auditId=crypto.randomUUID();op.result={...result,auditId};(d.businessActionAudit??=[]).push({auditId,actor,operationId,requestId,name:op.name,target:op.review.target,status:result.status,at:op.completedAt});writeStore(d);return {...result,auditId};
 }
 return {list:listBusinessActions,prepare,execute};
}
