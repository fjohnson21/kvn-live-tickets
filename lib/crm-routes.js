import {CRM_CATEGORIES,CRM_STATUSES,PARTNER_STAGES,ensureCrmCollections,contactOf,categoryOf} from './crm-records.js';
import {parseCrmFilters,queryCrm,validDate,invalid} from './crm-query.js';
import {crmSourceStates} from './crm-sync.js';
import {crmReportCsv} from './crm-export.js';
export function registerCrmRoutes(app,{auth,owner,readStore,writeStore,id,sync,now=()=>new Date(),configured=false,baseUrl}){
 const safe=handler=>async(req,res)=>{try{res.set('Cache-Control','no-store');await handler(req,res)}catch(error){res.status(error.statusCode||500).json({error:error.statusCode?error.message:'CRM request failed. Please retry.'})}};
 const sources=store=>crmSourceStates(store,configured,now());
 const audit=(store,req,action,entityId,changedFields=[])=>{store.auditLogs??=[];store.auditLogs.push({id:id('audit'),userId:req.user.id,userName:req.user.name,action,entityType:'crm',entityId,changedFields,createdAt:now().toISOString()})};
 const sameOrigin=(req,res,next)=>{if(req.headers['sec-fetch-site']==='cross-site'||!req.headers.origin||req.headers.origin!==new URL(baseUrl).origin)return res.status(403).json({error:'Use the signed-in dashboard to make changes.'});next()};
 const missing=()=>Object.assign(new Error('Record not found'),{statusCode:404});
 const report=req=>{const store=ensureCrmCollections(readStore()),filters=parseCrmFilters(req.query,now());return {...queryCrm(store,filters,{paginate:false}),generatedAt:now().toISOString(),timezone:'America/New_York',sources:sources(store)}};
 app.get('/api/crm/overview',auth,owner,safe((req,res)=>{
  const store=ensureCrmCollections(readStore()),filters=parseCrmFilters(req.query,now());const all=queryCrm(store,filters,{paginate:false}),partnerFilters={...filters,preset:'partnership_pipeline'},overdueFilters=parseCrmFilters({range:'all',preset:'follow_up',followUp:'overdue'},now());
  res.json({total:all.total,partners:queryCrm(store,partnerFilters).total,overdue:queryCrm(store,overdueFilters).total,filters,partnerFilters,overdueFilters,sources:sources(store),generatedAt:now().toISOString()});
 }));
 app.get('/api/crm/records',auth,owner,safe((req,res)=>{const store=ensureCrmCollections(readStore());res.json({...queryCrm(store,parseCrmFilters(req.query,now())),sources:sources(store),generatedAt:now().toISOString()})}));
 app.get('/api/crm/records/:id',auth,owner,safe((req,res)=>{
  const store=ensureCrmCollections(readStore()),record=store.crmRecords.find(r=>r.id===req.params.id);if(!record)throw missing();
  const email=String(contactOf(record).email||'').trim().toLowerCase(),relatedPurchases=[];
  if(email)for(const [collection,label] of [['orders','Event order'],['shopOrders','Standalone apparel']])for(const order of store[collection]||[])if(String(order.buyerEmail||'').trim().toLowerCase()===email)relatedPurchases.push({id:order.id,source:label,match:'Email match — verify identity',status:order.status,amountTotal:order.amountTotal,createdAt:order.createdAt});
  res.json({record,activities:store.crmActivities.filter(a=>a.recordId===record.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),relatedPurchases});
 }));
 app.patch('/api/crm/records/:id',auth,owner,sameOrigin,safe((req,res)=>{
  const patch=req.body;if(!patch||Array.isArray(patch)||typeof patch!=='object')throw invalid('Invalid record update');
  const keys=Object.keys(patch),allowed=['revision','correctedContact','workflowStatus','partnerStage','followUpDate','archived','note','categoryOverride'];if(keys.some(k=>!allowed.includes(k))||keys.length<2)throw invalid('Choose a field to update');
  if(!Number.isSafeInteger(patch.revision))throw invalid('A record revision is required');
  const changes={};
  if('workflowStatus'in patch){if(!CRM_STATUSES.includes(patch.workflowStatus))throw invalid('Invalid CRM status');changes.workflowStatus=patch.workflowStatus}
  if('partnerStage'in patch){if(!PARTNER_STAGES.includes(patch.partnerStage))throw invalid('Invalid partner stage');changes.partnerStage=patch.partnerStage}
  if('categoryOverride'in patch){if(!CRM_CATEGORIES.includes(patch.categoryOverride))throw invalid('Invalid category');changes.categoryOverride=patch.categoryOverride;changes.needsCategoryReview=false}
  if('followUpDate'in patch){if(patch.followUpDate!==null&&!validDate(patch.followUpDate))throw invalid('Invalid follow-up date');changes.followUpDate=patch.followUpDate}
  if('archived'in patch){if(typeof patch.archived!=='boolean')throw invalid('Invalid archive state');changes.archivedAt=patch.archived?now().toISOString():null}
  if('note'in patch&&(typeof patch.note!=='string'||!patch.note.trim()||patch.note.length>4000))throw invalid('Note must contain 1–4000 characters');
  if('correctedContact'in patch){const c=patch.correctedContact,limits={name:200,organization:200,email:254,phone:80};if(!c||Array.isArray(c)||typeof c!=='object'||Object.keys(c).some(k=>!Object.hasOwn(limits,k)))throw invalid('Invalid contact fields');changes.correctedContact={};for(const [key,value]of Object.entries(c)){if(typeof value!=='string'||value.length>limits[key])throw invalid('Contact value is too long');if(key==='email'&&value.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))throw invalid('Enter a valid email');changes.correctedContact[key]=value.trim()}}
  const store=ensureCrmCollections(readStore()),record=store.crmRecords.find(r=>r.id===req.params.id);if(!record)throw missing();if(record.revision!==patch.revision)throw Object.assign(new Error('This record changed. Reload it before saving; your unsaved inputs are still available.'),{statusCode:409});
  if(categoryOf(record)==='Early Access'&&('partnerStage'in changes||'categoryOverride'in changes))throw invalid('Early-access records are not partnership applications');
  if(changes.correctedContact)changes.correctedContact={...record.correctedContact,...changes.correctedContact};
  Object.assign(record,changes,{revision:record.revision+1,updatedAt:now().toISOString()});const action='archived'in patch?(patch.archived?'crm.archive':'crm.restore'):'crm.update';
  store.crmActivities.push({id:id('activity'),recordId:record.id,actorId:req.user.id,actorName:req.user.name,action,changedFields:Object.keys(changes),note:patch.note?.trim()||'',createdAt:now().toISOString()});audit(store,req,action,record.id,Object.keys(changes));writeStore(store);res.json({record});
 }));
 app.get('/api/crm/reports',auth,owner,safe((req,res)=>res.json(report(req))));
 app.get('/api/crm/reports.csv',auth,owner,safe((req,res)=>{const result=report(req),csv=crmReportCsv(result),store=ensureCrmCollections(readStore());audit(store,req,'crm.export',result.filters.preset,['report']);writeStore(store);res.type('text/csv').set('Content-Disposition',`attachment; filename="kvn-${result.filters.preset}-${now().toISOString().slice(0,10)}.csv"`).send(csv)}));
 app.post('/api/crm/sync',auth,owner,sameOrigin,safe(async(req,res)=>{const result=await sync();res.json({...result,sources:sources(readStore())})}));
}
