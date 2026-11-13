import {csvCell} from './report.js';
const fail=(message,statusCode=400)=>{throw Object.assign(Error(message),{statusCode})};
export function eventBreakdown(store,eventId){
 const event=(store.events||[]).find(e=>e.id===eventId);if(!event)fail('Event not found.',404);
 const orders=(store.orders||[]).filter(o=>o.eventId===eventId),holders=[],types=new Map();
 const summary={paidTickets:0,compTickets:0,checkedIn:0,invalidTickets:0,paidOrders:0,compOrders:0,unpaidAttempts:0,refundedOrders:0,paidAmount:0};
 for(const o of orders){const issued=['paid','complimentary'].includes(o.status)&&!o.paymentAttention;
  if(o.status==='paid'&&!o.paymentAttention){summary.paidOrders++;summary.paidAmount+=Number(o.amountTotal)||0;}
  if(o.status==='complimentary')summary.compOrders++;if(['pending','expired','checkout_failed'].includes(o.status))summary.unpaidAttempts++;if(o.status==='refunded')summary.refundedOrders++;
  for(const t of o.tickets||[]){if(!issued||(t.status&&t.status!=='active')){summary.invalidTickets++;continue;}
   const kind=o.status==='paid'?'Paid':'Complimentary',key=t.productId||t.ticketName||'Other';if(!types.has(key))types.set(key,{id:key,name:t.ticketName||'Ticket',paid:0,comp:0,checkedIn:0});const type=types.get(key);
   if(kind==='Paid'){summary.paidTickets++;type.paid++;}else{summary.compTickets++;type.comp++;}if(t.checkedIn){summary.checkedIn++;type.checkedIn++;}
   holders.push({code:t.code,ticketName:t.ticketName,holderName:t.holderName||o.buyerName,holderEmail:t.holderEmail||o.buyerEmail,buyerName:o.buyerName,buyerEmail:o.buyerEmail,orderId:o.id,kind,checkedIn:!!t.checkedIn,checkedInAt:t.checkedInAt||null});
  }
 }
 return {event:{id:event.id,title:event.title,status:event.status,date:event.date,venue:event.venue},summary,types:[...types.values()],holders,orders:orders.map(o=>({id:o.id,buyerName:o.buyerName,buyerEmail:o.buyerEmail,status:o.paymentAttention?'payment_review':o.status,amountTotal:o.amountTotal||0,createdAt:o.createdAt,items:(o.items||[]).map(i=>({name:i.name,quantity:i.quantity}))}))};
}
export function changeEventLifecycle(store,eventId,action){
 const event=(store.events||[]).find(e=>e.id===eventId);if(!event)fail('Event not found.',404);
 if(!['archive','restore','delete'].includes(action))fail('Invalid event action.');
 if(action==='delete'){
  const referenced=Object.entries(store).some(([key,rows])=>key!=='events'&&Array.isArray(rows)&&rows.some(r=>r.eventId===eventId||r.vendorAssignment?.eventId===eventId));
  if(referenced||(event.products||[]).some(p=>Number(p.sold)>0))fail('This event has recorded history. Archive it instead.',409);
  if(event.status==='published')fail('Unpublish or archive this event before deleting it.',409);
 }
 if(action==='restore'){if(!['archived','deleted'].includes(event.status))fail('This event is not archived or deleted.',409);event.status='draft';delete event.archivedAt;delete event.deletedAt;}
 else {event.status=action==='archive'?'archived':'deleted';event[action==='archive'?'archivedAt':'deletedAt']=new Date().toISOString();}
 event.lifecycleManaged=true;event.updatedAt=new Date().toISOString();return event;
}
export function registerEventManagement(app,{auth,owner,readStore,writeStore,canManage,can,baseUrl,id}){
 const wrap=fn=>(req,res)=>{res.set('Cache-Control','no-store, private');try{fn(req,res)}catch(e){res.status(e.statusCode||500).json({error:e.statusCode?e.message:'Event management unavailable.'})}};
 const access=(req,res,next)=>{const event=readStore().events.find(e=>e.id===req.params.id);if(!event)return res.status(404).json({error:'Event not found.'});if(!canManage(req.user,event)||!can(req.user,'attendees'))return res.status(403).json({error:'No access.'});next()};
 app.get('/api/events/:id/ticket-report',auth,access,wrap((req,res)=>{const report=eventBreakdown(readStore(),req.params.id);if(!can(req.user,'orders')){report.orders=[];report.summary.paidAmount=null;}res.json(report)}));
 app.get('/api/events/:id/holders.csv',auth,access,wrap((req,res)=>{const d=eventBreakdown(readStore(),req.params.id),keys=['code','ticketName','holderName','holderEmail','buyerName','buyerEmail','orderId','kind','checkedIn','checkedInAt'];res.type('text/csv').set('Content-Disposition','attachment; filename="ticket-holders.csv"').send([keys,...d.holders.map(t=>keys.map(k=>t[k]))].map(r=>r.map(csvCell).join(',')).join('\n'))}));
 app.post('/api/events/:id/lifecycle',auth,owner,wrap((req,res)=>{
  if(req.headers['sec-fetch-site']==='cross-site'||![new URL(baseUrl).origin,'https://www.kvnlive.com'].includes(req.headers.origin))return res.status(403).json({error:'Use the signed-in Command Center.'});
  const store=readStore(),event=changeEventLifecycle(store,req.params.id,req.body.action);store.auditLogs??=[];store.auditLogs.push({id:id('audit'),userId:req.user.id,action:'event.'+req.body.action,entityId:event.id,entityType:'event',createdAt:new Date().toISOString()});writeStore(store);res.json({event});
 }));
}
