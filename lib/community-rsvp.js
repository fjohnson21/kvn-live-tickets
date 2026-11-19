import {randomUUID, randomBytes, createHash} from 'node:crypto';
import {reservesTicketInventory} from './checkout.js';
export const COMMUNITY_PRODUCT='kv-community-rsvp-2026';
const generalIds=[COMMUNITY_PRODUCT];
export function communityAvailable(event,orders=[],now=Date.now()) {
 const product=event.products.find(p=>p.id===COMMUNITY_PRODUCT);
 const sold=event.products.filter(p=>generalIds.includes(p.id)).reduce((n,p)=>n+Number(p.sold||0),0);
 const pending=orders.filter(o=>o.eventId===event.id&&reservesTicketInventory(o,now)).flatMap(o=>o.items||[]).filter(i=>generalIds.includes(i.productId)).reduce((n,i)=>n+Number(i.quantity||0),0);
 return Math.max(0,Number(product?.inventory||0)-sold-pending);
}
export function applyCommunityPivot(event) {
 const previous=event.products.find(p=>p.id===COMMUNITY_PRODUCT);
 const ga=event.products.find(p=>p.id==='kv-general-admission-2026');
 event.communityRsvp=true;event.date='2026-11-21T17:00:00-05:00';event.doorsOpen=event.date;
 event.description='KV Live is now FREE. Registration is mandatory—every attendee must have a pass for entry. November 21, 2026. Doors open at 5 PM. A night of prayer, praise and worship, with our same lineup and Trailblazer honorees.';
 for(const p of event.products)if(p.type==='ticket'&&p.id!==COMMUNITY_PRODUCT){p.salesClosed=true;p.description='Existing passes remain valid. Doors open at 5 PM. VIP benefits are honored; paid General Admission is upgraded to reserved seating in the first five center rows. Trailblazers will be honored during the gathering.';}
 event.products=event.products.filter(p=>p.id!==COMMUNITY_PRODUCT);
 event.products.unshift({id:COMMUNITY_PRODUCT,type:'ticket',name:'Free Community Pass',price:0,inventory:previous?.inventory??1000,sold:previous?.sold||0,minPerOrder:1,maxPerOrder:20,quantityStep:1,description:'Free admission. RSVP is mandatory for every attendee. Doors open at 5 PM. Open seating outside the reserved center section. No donation is required.',includedApparel:{mode:'none',enabled:false},earlyRelease:{enabled:false},group:{enabled:false}});
 event.layout=[{id:'community-details',type:'details',title:'November 21, 2026 · Doors open at 5 PM',body:'Prayer, praise and worship with Jalisa Faye, Yael Hilton, Imani Raeford, the KV Worship Collective and host Asa Clark. Trailblazers will be honored during the gathering.'},{id:'community-tickets',type:'tickets',title:'Get your FREE pass',body:'Registration is mandatory. Every attendee must have a pass for entry. Existing passes remain valid; no new RSVP is needed.'},{id:'community-prayer',type:'text',title:'Join us for prayer',body:'Every day at 7 PM Eastern, beginning Sunday, November 15. RSVP for your event pass. Prayer-call details will be texted Sunday, November 15.'}];
}
export function registerCommunityPass(store,input,{now=Date.now()}={}) {
 const fail=(message,statusCode=400)=>{throw Object.assign(Error(message),{statusCode});};
 const name=String(input.name||'').trim().slice(0,120),email=String(input.email||'').trim().toLowerCase(),phone=String(input.phone||'').trim(),quantity=Number(input.quantity),requestId=String(input.requestId||'');
 if(!/^[a-zA-Z0-9-]{20,80}$/.test(requestId))fail('Refresh the page and try again.');
 if(!name||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||phone.replace(/\D/g,'').length<10||phone.length>30)fail('Enter your name, valid email and mobile number.');
 if(!Number.isInteger(quantity)||quantity<1||quantity>20)fail('Choose between 1 and 20 passes.');
 const fingerprint=createHash('sha256').update(JSON.stringify({name,email,phone,quantity})).digest('hex');
 const existing=store.orders.find(o=>o.communityRequestId===requestId);
 if(existing){if(existing.communityFingerprint!==fingerprint)fail('This request has changed. Refresh and try again.',409);return {order:existing,reused:true};}
 const event=store.events.find(e=>e.slug==='kingdom-vibe-live-2026'&&e.status==='published'&&e.communityRsvp);
 if(!event||now>=Date.parse('2026-11-22T04:59:59-05:00'))fail('Registration is closed.',409);
 if(quantity>communityAvailable(event,store.orders,now))fail('Not enough passes remain for this request. Choose fewer passes or contact the event team.',409);
 const product=event.products.find(p=>p.id===COMMUNITY_PRODUCT),disciple=(store.disciples||[]).find(d=>d.code===String(input.discipleCode||'').toUpperCase()&&d.status==='active');
 const order={id:'ord_'+randomUUID(),orderType:'community_rsvp',passAccessToken:randomBytes(16).toString('base64url'),communityRequestId:requestId,communityFingerprint:fingerprint,eventId:event.id,organizationId:event.organizationId,status:'complimentary',buyerName:name,buyerEmail:email,customer:{name,email,cellPhone:phone},amountSubtotal:0,amountTotal:0,discipleId:disciple?.id||'',discipleCode:disciple?.code||'',createdAt:new Date(now).toISOString(),prayerSmsConsent:input.prayerSmsConsent===true,items:[{productId:COMMUNITY_PRODUCT,name:'Free Community Pass',type:'ticket',quantity,unitAmount:0,apparelMode:'none'}],tickets:Array.from({length:quantity},()=>({id:'tkt_'+randomUUID(),code:randomBytes(18).toString('hex').toUpperCase(),productId:COMMUNITY_PRODUCT,ticketName:'Free Community Pass',holderName:name,checkedIn:false,checkedInAt:null,seating:'Open seating outside the reserved center section'}))};
 product.sold=Number(product.sold||0)+quantity;store.orders.push(order);return {order,reused:false};
}
export function upgradePaidSeating(store){let changed=false;for(const order of store.orders||[]){if(order.status!=='paid'||!store.events.some(e=>e.id===order.eventId&&e.slug==='kingdom-vibe-live-2026'))continue;for(const ticket of order.tickets||[]){if(ticket.seating==='Reserved seating · First five center rows')continue;ticket.seating='Reserved seating · First five center rows';ticket.originalTicketName ||= ticket.ticketName;if(ticket.productId==='kv-general-admission-2026')ticket.ticketName='Reserved Seating — Paid General Admission Upgrade';changed=true;}}return changed;}
