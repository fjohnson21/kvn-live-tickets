import crypto from 'node:crypto';
import {categoriesOf} from './crm-records.js';
export const normalizeEmail=value=>String(value||'').trim().toLowerCase();
const same=(value,email)=>normalizeEmail(value)===email;
const valid=email=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export function personalIdentity(store,input){
 const email=normalizeEmail(input);if(!valid(email))return null;
 const disciples=(store.disciples||[]).filter(d=>same(d.email,email));if(disciples.length>1)return null;
 const disciple=disciples.find(d=>d.status==='active');
 const lead=(store.crmRecords||[]).find(r=>same(r.submittedContact?.email,email));
 const order=[...(store.orders||[]),...(store.shopOrders||[])].find(o=>same(o.buyerEmail,email));
 const holder=(store.orders||[]).some(o=>(o.tickets||[]).some(t=>same(t.holderEmail,email)));
 if(!disciple&&!lead&&!order&&!holder)return null;
 return {id:'contact_'+crypto.createHash('sha256').update('email:'+email).digest('hex'),email,name:disciple?.name||lead?.submittedContact?.name||order?.buyerName||'KVN member',disciple:disciple||null};
}
export function personalDashboard(store,input){
 const email=normalizeEmail(input),identity=personalIdentity(store,email);if(!identity)throw Object.assign(Error('Account records unavailable.'),{statusCode:403});
 const events=new Map((store.events||[]).map(e=>[e.id,e]));const tickets=[];
 for(const order of store.orders||[]){if(!['paid','complimentary'].includes(order.status)||order.paymentAttention)continue;
  for(const t of order.tickets||[]){if(t.status&&t.status!=='active')continue;
   const assigned=normalizeEmail(t.holderEmail);if(assigned?assigned!==email:!same(order.buyerEmail,email))continue;
   const e=events.get(order.eventId)||{};tickets.push({code:t.code,name:t.ticketName,holderName:t.holderName||order.buyerName,eventId:order.eventId,event:e.title||'Event',date:e.date,venue:e.venue,location:e.location,checkedIn:!!t.checkedIn,checkedInAt:t.checkedInAt||null,kind:order.status==='complimentary'?'Complimentary':'Paid'});
  }
 }
 const orders=[],carts=[];
 for(const [kind,collection]of [['Tickets','orders'],['Apparel','shopOrders']])for(const o of store[collection]||[]){if(!same(o.buyerEmail,email))continue;
  const row={id:o.id,kind,event:events.get(o.eventId)?.title||'',status:o.paymentAttention?'payment_review':o.status,createdAt:o.createdAt,amountTotal:o.amountTotal||0,items:(o.items||[]).map(i=>({name:i.name||i.ticketName||'Item',quantity:i.quantity,size:i.size||i.options?.size||'',unitAmount:i.unitAmount??i.unitPrice??i.price??null}))};
  orders.push(row);if(['pending','expired','checkout_failed'].includes(o.status)&&!o.paymentAttention)carts.push({...row,status:o.status==='pending'&&o.checkoutExpiresAt&&Date.parse(o.checkoutExpiresAt)<=Date.now()?'expired':row.status,expiresAt:o.checkoutExpiresAt||null,canResume:(!o.eventId||events.get(o.eventId)?.status==='published')&&o.status==='pending'&&o.checkoutMode!=='embedded'&&!!o.stripeSessionId&&(!o.checkoutExpiresAt||Date.parse(o.checkoutExpiresAt)>Date.now()),shopPath:kind==='Apparel'?'/shop':'/passes'});
 }
 const submissions=(store.crmRecords||[]).filter(r=>same(r.submittedContact?.email,email));
 const partnerships=submissions.filter(r=>r.sourceTable!=='sponsored_survey'&&categoriesOf(r).some(c=>['Vendor','Ministry Partner','Corporate Sponsor','General Partnership'].includes(c))).map(r=>({id:r.id,categories:categoriesOf(r),organization:r.submittedContact?.organization||'',status:r.partnerStage||'Inquiry',package:r.requestedPackage||'Not specified',space:r.vendorAssignment?.space||'Not assigned',event:events.get(r.vendorAssignment?.eventId)?.title||'',assignmentStatus:r.vendorAssignment?.status||'Not assigned',receivedAt:r.receivedAt}));
 const activity=submissions.map(r=>({id:r.id,categories:categoriesOf(r),source:r.sourceTable,receivedAt:r.receivedAt,status:r.sourceTable==='sponsored_survey'?r.ticketStatus:'Received'}));
 return {generatedAt:new Date().toISOString(),profile:{name:identity.name,email,contactId:identity.id,isDisciple:!!identity.disciple},tickets,orders,carts,partnerships,activity};
}
