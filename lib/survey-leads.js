import {createHash} from 'node:crypto';
import {ensureCrmCollections,upsertCrmRecords} from './crm-records.js';
export const SURVEY_CATEGORIES={business:'Vendor',ministry:'Ministry Partner',disciple:'Disciple Prospect',volunteer:'Volunteer',sponsor:'Corporate Sponsor',donate:'Donor Prospect',events:'Event Audience',attend:'Event Audience'};
// Keep a safe, durable survey snapshot even after expired claim cleanup. Never copy access tokens.
export function routeSurveyLeads(store,{now=new Date()}={}){
 ensureCrmCollections(store);
 const records=new Map(store.crmRecords.filter(r=>r.sourceTable==='sponsored_survey').map(r=>[r.sourceId,r]));
 const submissions=new Map([...records].map(([key,r])=>[key,new Map((r.surveySubmissions||[]).map(s=>[s.id,s]))]));
 for(const c of store.sponsoredClaims||[]){
  if(c.liveLaunchTest||!c.surveyCompletedAt||!Array.isArray(c.interests)||!c.interests.some(i=>SURVEY_CATEGORIES[i]))continue;
  const email=String(c.email||'').trim().toLowerCase();if(!email||!c.id||!Number.isFinite(Date.parse(c.createdAt)))continue;
  const key=createHash('sha256').update(email).digest('hex');
  if(!submissions.has(key))submissions.set(key,new Map());
  const prior=submissions.get(key).get(c.id);
  submissions.get(key).set(c.id,{...(prior||{id:c.id,name:c.name||'',email,phone:c.phone||'',city:c.city||'',state:c.state||'',zip:c.zip||'',interests:[...new Set(c.interests.filter(i=>SURVEY_CATEGORIES[i]))],createdAt:c.createdAt,surveyCompletedAt:c.surveyCompletedAt}),claimedAt:c.claimedAt||null,expiresAt:c.expiresAt||null,supersededAt:c.supersededAt||null});
 }
 const normalized=[];
 for(const [key,byId] of submissions){
  const rows=[...byId.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));if(!rows.length)continue;
  const first=rows[0],last=rows.at(-1),interests=[...new Set(rows.flatMap(c=>c.interests))],leadCategories=[...new Set(interests.map(i=>SURVEY_CATEGORIES[i]))];
  const ticketStatus=rows.some(c=>c.claimedAt)?'Verified':rows.some(c=>!c.supersededAt&&Date.parse(c.expiresAt)>now.getTime())?'Pending verification':'Expired';
  normalized.push({sourceSystem:'kvn-engine',sourceTable:'sponsored_survey',sourceId:key,sourceCreatedAt:first.createdAt,sourceUpdatedAt:last.createdAt,receivedAt:first.createdAt,sourceCategory:'Comp ticket survey',category:leadCategories[0],leadCategories,needsCategoryReview:false,submittedContact:{name:last.name,email:last.email,phone:last.phone,organization:'',location:[last.city,last.state,last.zip].filter(Boolean).join(', '),website:''},consent:{email:null,text:null,terms:null},requestedPackage:'Interest only — not an application',submittedAmount:null,interests,ticketStatus,surveySubmissions:rows,originalSubmission:{interests,submissions:rows}});
 }
 const result=upsertCrmRecords(store,normalized,{now});
 // Survey leads have follow-up workflows; they are not partner applications.
 for(const r of store.crmRecords)if(r.sourceTable==='sponsored_survey')r.partnerStage=null;
 return {...result,contacts:normalized.length,byCategory:Object.fromEntries([...new Set(Object.values(SURVEY_CATEGORIES))].map(c=>[c,normalized.filter(r=>r.leadCategories.includes(c)).length]))};
}
