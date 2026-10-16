import {categoryOf,contactOf} from './crm-records.js';
const number=v=>Number.isFinite(Number(v))?Number(v):0;
const timestamp=v=>typeof v==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
const quantity=o=>(o.items||[]).filter(i=>i.type==='ticket').reduce((n,i)=>n+number(i.quantity),0)||(o.tickets||[]).length;
export function collectActivity(store,sourceStates=[],now=new Date()){
 const rows=[],seen=new Set();let undatedCount=0;
 const add=(source,r,category,date,extra={})=>{if(!r.id||seen.has(source+':'+r.id))return;seen.add(source+':'+r.id);const occurredAt=timestamp(date);if(!occurredAt){undatedCount++;return;}rows.push({id:source+':'+r.id,source,sourceId:r.id,personKey:source+':'+r.id,category,occurredAt,status:r.status||'',name:r.name||r.buyerName||'',email:r.email||r.buyerEmail||'',phone:r.phone||'',units:0,amountCents:0,...extra});};
 for(const r of store.crmRecords||[]){const c=contactOf(r);add('crm',r,categoryOf(r),r.receivedAt,{name:c.name,email:c.email,phone:c.phone,organization:c.organization,status:r.workflowStatus,interests:[],discipleId:r.discipleId||''});}
 const claims=(store.sponsoredClaims||[]).filter(c=>!c.liveLaunchTest&&!c.supersededAt),claimOrders=new Set(claims.filter(c=>c.claimedAt).map(c=>c.orderId).filter(Boolean));
 for(const c of claims)add('sponsored',c,c.claimedAt?'Comp passes':'Pending verification',c.claimedAt||c.createdAt,{status:c.claimedAt?'claimed':Date.parse(c.expiresAt)<=now.getTime()?'expired':'pending',units:c.claimedAt?number(c.quantity||1):0,interests:c.interests||[],location:[c.city,c.state].filter(Boolean).join(', '),discipleId:c.discipleId||'',relatedId:c.orderId||''});
 for(const o of store.orders||[]){if((store.sponsoredClaims||[]).some(c=>c.liveLaunchTest&&(c.orderId===o.id||c.id===o.sponsoredClaimId)))continue;if(o.status==='complimentary'&&(claimOrders.has(o.id)||claims.some(c=>c.claimedAt&&c.id===o.sponsoredClaimId)))continue;const category=o.status==='complimentary'?'Comp passes':o.orderType==='sponsored_upgrade'?'Upgrades':'Tickets';add('orders',o,category,o.paidAt||o.createdAt,{status:o.paymentAttention?'payment_review':o.status,units:quantity(o),amountCents:number(o.amountTotal),discipleId:o.discipleId||'',relatedId:o.sponsoredClaimId||''});}
 for(const r of store.discipleApplications||[])add('applications',r,'Disciple applications',r.submittedAt||r.createdAt);
 for(const r of store.shopOrders||[])add('apparel',r,'Apparel',r.paidAt||r.createdAt,{amountCents:number(r.amountTotal),units:(r.items||[]).reduce((n,i)=>n+number(i.quantity),0),discipleId:r.discipleId||''});
 for(const r of store.donations||[])add('donations',r,'Donations',r.paidAt||r.createdAt,{amountCents:number(r.amountTotal??r.amount)});
 for(const r of store.discipleCommissions||[])add('commissions',r,'Commissions',r.earnedAt||r.createdAt,{amountCents:number(r.amount),discipleId:r.discipleId||''});
 for(const r of store.disciplePayouts||[])add('payouts',r,'Payouts',r.paidAt||r.createdAt,{amountCents:number(r.amount),discipleId:r.discipleId||''});
 const sources=[{source:'Engine records',status:'Connected',lastSuccessAt:now.toISOString(),sourceCount:rows.filter(r=>r.source!=='crm').length},...sourceStates,{source:'KV Social activity',status:'Unavailable',detail:'Not connected to this activity report.'},{source:'Separate agreement signing site',status:'Unavailable',detail:'See Agreements for its existing status report.'}];
 if(!sourceStates.length)sources.push({source:'Website inquiry sync',status:'Unavailable',detail:'No verified source status supplied.'});
 return {rows,sources,undatedCount};
}
export function queryActivity(result,{from,to,categories=[]},now=new Date()){
 if(!timestamp(from)||!timestamp(to)||Date.parse(from)>=Date.parse(to))throw Object.assign(Error('Choose a valid start and end timestamp.'),{statusCode:400});
 if(!Array.isArray(categories)||categories.some(c=>typeof c!=='string'))throw Object.assign(Error('Invalid categories.'),{statusCode:400});
 const rows=result.rows.filter(r=>Date.parse(r.occurredAt)>=Date.parse(from)&&Date.parse(r.occurredAt)<Date.parse(to)&&(!categories.length||categories.includes(r.category))).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)||a.id.localeCompare(b.id));
 const allPaid=rows.filter(r=>r.source==='orders'&&r.status==='paid'),paid=allPaid.filter(r=>r.category!=='Upgrades'),upgrades=allPaid.filter(r=>r.category==='Upgrades');const totals={records:rows.length,compClaims:rows.filter(r=>r.category==='Comp passes').length,compPasses:rows.filter(r=>r.category==='Comp passes').reduce((n,r)=>n+r.units,0),paidOrders:paid.length,paidRevenueCents:paid.reduce((n,r)=>n+r.amountCents,0),pendingVerifications:rows.filter(r=>r.category==='Pending verification').length,upgrades:upgrades.length,upgradeRevenueCents:upgrades.reduce((n,r)=>n+r.amountCents,0),byCategory:{}};
 for(const r of rows)totals.byCategory[r.category]=(totals.byCategory[r.category]||0)+1;
 return {...result,rows,totals,from:new Date(from).toISOString(),to:new Date(to).toISOString(),generatedAt:now.toISOString(),timeZone:'America/New_York'};
}
