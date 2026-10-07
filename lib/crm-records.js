import crypto from 'node:crypto';
export const CRM_SOURCES=['early_access_leads','partner_leads','kingdom_market_applications'];
export const CRM_CATEGORIES=['Vendor','Corporate Sponsor','Ministry Partner','General Partnership'];
export const CRM_STATUSES=['New','Contacted','Follow-up','Qualified','Closed'];
export const PARTNER_STAGES=['Inquiry','Contacted','Proposal Sent','Confirmed','Declined'];
const fields={early_access_leads:['id','first_name','last_name','email','mobile','city_state','interests','email_consent','text_consent','created_at','updated_at'],partner_leads:['id','contact_name','organization','email','phone','social_url','opportunity_type','participation_level','group_size','message','preferred_contact','created_at'],kingdom_market_applications:['id','reference_number','status','contact_name','business_name','email','phone','tier','category','business_url','team_size','message','terms_accepted','created_at','updated_at']};
export function ensureCrmCollections(store){store.crmRecords??=[];store.crmActivities??=[];store.crmSyncState??={};return store}
function timestamp(value){let s=String(value||'');if(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(s))s=s.replace(' ','T')+'Z';if(!/^\d{4}-\d\d-\d\dT/.test(s)||!/(Z|[+-]\d\d:\d\d)$/.test(s)||!Number.isFinite(Date.parse(s)))throw new Error('Invalid source timestamp');return new Date(s).toISOString()}
const flag=x=>x===true||x===1?true:x===false||x===0?false:null;
export function normalizeSourceRow(source,row){
 if(!CRM_SOURCES.includes(source)||!row||typeof row.id!=='string'||!row.id||row.id.length>200)throw new Error('Invalid source identity');
 const originalSubmission={};for(const key of fields[source]){const value=row[key];if(value!==undefined){if(typeof value==='string'&&value.length>20000)throw new Error('Source value too long');originalSubmission[key]=value}}
 const early=source==='early_access_leads',tier=String(row.tier||row.participation_level||''),raw=String(row.opportunity_type||row.tier||''),known=['member','growth','premier','directory','exposure','Kingdom Market Partnership','Exclusive Category Partnership','Community Impact Partnership','Media Partnership'];
 let category=early?'Early Access':'General Partnership',needsCategoryReview=false;
 if(!early){if(tier==='church'||['Group/Church Partnership','KV Ambassador Church','Ministry Partner'].includes(raw))category='Ministry Partner';else if(tier==='sponsor'||['Corporate Sponsorship Activation','Sponsorship Inquiry'].includes(raw))category='Corporate Sponsor';else if(tier==='onsite'||raw==='Premium Vendor Experience')category='Vendor';else if(!known.includes(tier)&&!known.includes(raw))needsCategoryReview=true}
 const sourceCreatedAt=timestamp(row.created_at),sourceUpdatedAt=timestamp(row.updated_at||row.created_at);
 return {sourceSystem:'kvnlive',sourceTable:source,sourceId:row.id,sourceCreatedAt,sourceUpdatedAt,receivedAt:sourceCreatedAt,sourceCategory:raw,category,needsCategoryReview,submittedContact:{name:early?[row.first_name,row.last_name].filter(Boolean).join(' '):String(row.contact_name||''),organization:String(row.organization||row.business_name||''),email:String(row.email||''),phone:String(row.mobile||row.phone||''),location:String(row.city_state||''),website:String(row.social_url||row.business_url||'')},consent:{email:early?flag(row.email_consent):null,text:early?flag(row.text_consent):null,terms:source==='kingdom_market_applications'?flag(row.terms_accepted):null},requestedPackage:tier,submittedAmount:null,originalSubmission};
}
export function upsertCrmRecords(store,records,{now=new Date(),id=()=>crypto.randomUUID()}={}){
 ensureCrmCollections(store);const results={created:0,updated:0,unchanged:0};
 const key=r=>[r.sourceSystem,r.sourceTable,r.sourceId].join(':');const existing=new Map(store.crmRecords.map(r=>[key(r),r]));
 for(const source of records){const record=existing.get(key(source)),sourceHash=crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex');
  if(record){if(record.sourceHash===sourceHash){results.unchanged++;continue}Object.assign(record,source,{sourceHash,revision:record.revision+1,syncedAt:now.toISOString()});results.updated++}
  else{const created={...source,id:id('crm'),sourceHash,correctedContact:{},workflowStatus:'New',partnerStage:source.category==='Early Access'?null:'Inquiry',followUpDate:null,archivedAt:null,revision:1,syncedAt:now.toISOString()};store.crmRecords.push(created);existing.set(key(source),created);results.created++}
 }return results;
}
export function contactOf(record){return {...record.submittedContact,...record.correctedContact}}
export function categoryOf(record){return record.categoryOverride||record.category}
