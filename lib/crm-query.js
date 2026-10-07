import {CRM_CATEGORIES,CRM_SOURCES,CRM_STATUSES,PARTNER_STAGES,categoryOf,contactOf} from './crm-records.js';
const zone='America/New_York';
export const invalid=message=>Object.assign(new Error(message),{statusCode:400});
export function localDate(now=new Date()){const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`}
export function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d\d-\d\d$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s&&Number(s.slice(0,4))>=2000&&Number(s.slice(0,4))<=2200}
function shift(s,days){const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function midnight(s){const target=Date.parse(s+'T00:00:00Z');let value=target;for(let i=0;i<3;i++){const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));value+=target-Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`)}return new Date(value).toISOString()}
export function dateBounds(from,to){if(!validDate(from)||!validDate(to)||from>to)throw invalid('Choose a valid date range');return {start:midnight(from),end:midnight(shift(to,1))}}
export function parseCrmFilters(input={},now=new Date()){
 const q=input instanceof URLSearchParams?Object.fromEntries(input):input,today=localDate(now);const choice=(key,allowed,fallback='')=>{const v=q[key]??fallback;if(!allowed.includes(v))throw invalid(`Invalid ${key}`);return v};
 const range=choice('range',['30','7','today','all','custom'],'30');let from,to;
 if(range==='all'){from=null;to=null}else if(q.from||q.to){from=q.from;to=q.to}else{to=today;from=shift(today,range==='7'?-6:range==='today'?0:-29)}
 const bounds=from===null?{start:null,end:null}:dateBounds(from,to);
 const search=String(q.search||'').trim();if(search.length>200)throw invalid('Search is too long');
 const page=Number(q.page??1),pageSize=Number(q.pageSize??25);if(!Number.isSafeInteger(page)||page<1||![25,50,100].includes(pageSize))throw invalid('Invalid page');
 return {preset:choice('preset',['lead_intake','partnership_pipeline','follow_up'],'lead_intake'),range,from,to,...bounds,today,search,category:choice('category',['','Early Access',...CRM_CATEGORIES]),sourceTable:choice('sourceTable',['',...CRM_SOURCES]),workflowStatus:choice('workflowStatus',['',...CRM_STATUSES]),partnerStage:choice('partnerStage',['',...PARTNER_STAGES]),followUp:choice('followUp',['all','overdue','due_today','upcoming','none'],'all'),archived:choice('archived',['exclude','include','only'],'exclude'),page,pageSize};
}
export function queryCrm(store,filters,{paginate=true}={}){
 const f=filters;let rows=(store.crmRecords||[]).filter(r=>{
  const category=categoryOf(r),due=r.followUpDate;
  if(f.archived==='exclude'&&r.archivedAt||f.archived==='only'&&!r.archivedAt)return false;
  if(f.preset==='partnership_pipeline'&&category==='Early Access')return false;
  if(f.category&&category!==f.category||f.sourceTable&&r.sourceTable!==f.sourceTable||f.workflowStatus&&r.workflowStatus!==f.workflowStatus||f.partnerStage&&r.partnerStage!==f.partnerStage)return false;
  if(f.preset==='follow_up'){if(!due||r.workflowStatus==='Closed')return false;if(f.from&&due<f.from||f.to&&due>f.to)return false}
  else if(f.start&&Date.parse(r.receivedAt)<Date.parse(f.start)||f.end&&Date.parse(r.receivedAt)>=Date.parse(f.end))return false;
  if(f.followUp==='none'&&due)return false;
  if(['overdue','due_today','upcoming'].includes(f.followUp)){if(!due||r.workflowStatus==='Closed'||r.archivedAt)return false;if(f.followUp==='overdue'&&due>=f.today||f.followUp==='due_today'&&due!==f.today||f.followUp==='upcoming'&&due<=f.today)return false}
  const c=contactOf(r);return !f.search||[c.name,c.organization,c.email,c.phone].some(v=>String(v||'').toLowerCase().includes(f.search.toLowerCase()));
 });
 rows.sort((a,b)=>f.preset==='follow_up'?String(a.followUpDate).localeCompare(String(b.followUpDate))||a.id.localeCompare(b.id):Date.parse(b.receivedAt)-Date.parse(a.receivedAt)||a.id.localeCompare(b.id));
 const total=rows.length,summary={total,partners:rows.filter(r=>categoryOf(r)!=='Early Access').length,byStage:{}};for(const r of rows)if(r.partnerStage)summary.byStage[r.partnerStage]=(summary.byStage[r.partnerStage]||0)+1;
 return {rows:paginate?rows.slice((f.page-1)*f.pageSize,f.page*f.pageSize):rows,total,summary,filters:f};
}
