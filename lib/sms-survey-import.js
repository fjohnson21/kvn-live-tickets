import crypto from 'node:crypto';
import {ensureSms,txt180Scope,smsHash} from './sms-model.js';
import {normalizeSmsPhone,recordSmsConsent,smsPermission} from './sms-audiences.js';
const categories=new Set(['Vendor','Ministry Partner','Disciple Prospect','Volunteer','Corporate Sponsor','Donor Prospect','Event Audience']);
// Operational import: run before the HTTP server starts, with exclusive store access.
// A durable snapshot and per-operation markers prevent repeats after interruption.
export async function runSurveySmsImport({readStore,writeStore,client,env=process.env,now=()=>new Date()}){
 const runId=env.TXT180_SURVEY_IMPORT_ID;
 if(!runId)return {status:'disabled'};
 const scope=txt180Scope(env),evidence=String(env.TXT180_SURVEY_IMPORT_EVIDENCE||'').trim();
 if(env.SMS_PROVIDER!=='txt180'||!/^[-a-zA-Z0-9_]{1,80}$/.test(runId)||!evidence||evidence.length>500)throw Error('Invalid survey import authorization configuration.');
 const groups=JSON.parse(env.TXT180_SURVEY_IMPORT_GROUPS||'{}');
 if(!Object.keys(groups).length||Object.entries(groups).some(([k,g])=>!categories.has(k)||!g||!/^\d+$/.test(g.providerGroupId)||!g.name||!g.extension))throw Error('Invalid survey import group mapping.');
 const fingerprint=smsHash({scope,evidence,groups});
 const data=()=>{const d=ensureSms(readStore());d.sms.contacts??=[];d.sms.groups??=[];d.sms.surveyImports??=[];return d;};
 let d=data(),run=d.sms.surveyImports.find(r=>r.id===runId);
 if(run&&run.fingerprint!==fingerprint)throw Error('Survey import configuration changed. Review the existing run.');
 if(['complete','blocked'].includes(run?.status))return run.summary;
 if(!run){
  const byPhone=new Map(),excluded=[];
  for(const r of d.crmRecords||[]){
   if(r.sourceTable!=='sponsored_survey'||r.archivedAt)continue;
   const contact={...r.submittedContact,...r.correctedContact},phone=normalizeSmsPhone(contact.phone),selected=[...new Set(r.leadCategories||[])].filter(k=>categories.has(k));
   if(!selected.length)continue;
   if(selected.some(k=>!groups[k]))throw Error('Survey category is missing a group mapping.');
   if(!phone){excluded.push({recordId:r.id,reason:'invalid_or_missing_phone'});continue;}
   const item=byPhone.get(phone)||{phone,name:String(contact.name||'').slice(0,100),sourceIds:[],categories:[],status:'pending',memberships:{}};
   item.sourceIds.push(r.id);item.categories=[...new Set([...item.categories,...selected])];byPhone.set(phone,item);
  }
  if(byPhone.size>500)throw Error('Survey import exceeds the reviewed 500-contact limit.');
  run={id:runId,fingerprint,scope,evidence,createdAt:now().toISOString(),status:'running',contacts:[...byPhone.values()],excluded};
  d.sms.surveyImports.push(run);writeStore(d);
 }
 // A lookup failure stops before any new provider mutation. Never reactivate STOPs.
 const stopped=await client.optouts(),providerContacts=await client.listContacts();
 const remote=new Map();for(const c of providerContacts){const phone=normalizeSmsPhone(c.phone);if(!phone||!/^\d+$/.test(c.contactId))throw Error('Invalid provider contact list.');if(remote.has(phone)&&remote.get(phone)!==c.contactId)throw Error('Duplicate provider contact requires review.');remote.set(phone,c.contactId);}
 d=data();run=d.sms.surveyImports.find(r=>r.id===runId);
 for(const o of stopped){const phone=normalizeSmsPhone(o.phone);if(!phone)throw Error('Invalid provider opt-out record.');if(!d.sms.consentEvents.some(e=>e.id==='txt180-stop:'+scope+':'+o.id))recordSmsConsent(d,{id:'txt180-stop:'+scope+':'+o.id,scopeId:'kvn',phone,purpose:'marketing',action:'withdraw',source:'txt180',evidence:'TXT180 opt-out '+o.id,disclosureVersion:'sms-1',occurredAt:now().toISOString()});}
 for(const g of Object.values(groups))if(!d.sms.groups.some(x=>x.providerScope===scope&&x.providerGroupId===g.providerGroupId))d.sms.groups.push({id:crypto.randomUUID(),...g,providerScope:scope,createdAt:now().toISOString()});
 const save=()=>{d.sms.revision++;writeStore(d);};
 save();
 for(const item of run.contacts){
  if(item.status==='complete'||item.status==='excluded'||item.status==='needs_review'||item.status==='failed')continue;
  if(item.status==='submitting'||Object.values(item.memberships).includes('submitting')){item.status='needs_review';save();continue;}
  if(smsPermission(d,item.phone).reason==='opted_out'||stopped.some(o=>normalizeSmsPhone(o.phone)===item.phone)){item.status='excluded';item.reason='opted_out';save();continue;}
  if((d.sms.contactOperations||[]).some(o=>o.key===item.phone&&['submitting','needs_review'].includes(o.status))){item.status='needs_review';save();continue;}
  let c=d.sms.contacts.find(c=>c.providerScope===scope&&c.phone===item.phone);
  const providerId=remote.get(item.phone)||item.providerContactId;
  if(c&&providerId&&c.providerContactId!==providerId){item.status='needs_review';save();continue;}
  if(c&&!providerId){item.status='needs_review';save();continue;}
  if(!c){
   let contactId=providerId;
   if(!contactId){
    item.status='submitting';save();
    try{({contactId}=await client.addContact({phone:item.phone,name:item.name}));remote.set(item.phone,contactId);}
    catch(e){item.status=e.outcome==='rejected'?'failed':'needs_review';item.providerCode=e.providerCode||null;save();continue;}
   }
   item.providerContactId=contactId;item.status='added';
   c={id:crypto.randomUUID(),phone:item.phone,name:item.name,providerScope:scope,providerContactId:contactId,groupIds:[],status:'active',createdAt:now().toISOString()};d.sms.contacts.push(c);save();
  }
  if(c.status!=='active'){item.status='excluded';item.reason='inactive_contact';save();continue;}
  const consentId='survey-import:'+runId+':'+c.id;
  if(!d.sms.consentEvents.some(e=>e.id===consentId))recordSmsConsent(d,{id:consentId,scopeId:'kvn',phone:item.phone,purpose:'marketing',action:'grant',source:'owner_attestation',evidence,disclosureVersion:'owner-attestation-1',occurredAt:run.createdAt,actor:'owner-approved-survey-import'});
  for(const category of item.categories){
   const g=d.sms.groups.find(g=>g.providerScope===scope&&g.providerGroupId===groups[category].providerGroupId);
   if(item.memberships[category]==='complete')continue;
   item.memberships[category]='submitting';save();
   try{await client.assignGroup({contactId:c.providerContactId,groupId:g.providerGroupId});}
   catch(e){item.status=e.outcome==='rejected'?'failed':'needs_review';item.providerCode=e.providerCode||null;item.memberships[category]=item.status;save();break;}
   c.groupIds=[...new Set([...(c.groupIds||[]),g.id])];item.memberships[category]='complete';save();
  }
  if(item.categories.every(k=>item.memberships[k]==='complete'))item.status='complete';save();
  if(['failed','needs_review'].includes(item.status))break;
 }
 const pending=run.contacts.filter(c=>['pending','added'].includes(c.status)).length;
 run.status=pending?'blocked':'complete';run.finishedAt=now().toISOString();
 run.summary={status:run.status,runId,pending,sourceContacts:run.contacts.length+run.excluded.length,imported:run.contacts.filter(c=>c.status==='complete').length,excluded:run.excluded.length+run.contacts.filter(c=>c.status==='excluded').length,failed:run.contacts.filter(c=>c.status==='failed').length,needsReview:run.contacts.filter(c=>c.status==='needs_review').length,groups:Object.fromEntries(Object.keys(groups).map(k=>[k,run.contacts.filter(c=>c.memberships[k]==='complete').length]))};
 d.sms.audit.push({kind:'survey_import',actor:'owner-approved-survey-import',at:run.finishedAt,runId,summary:run.summary});save();return run.summary;
}
