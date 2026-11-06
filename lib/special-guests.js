import {normalizeApparelConfig} from './apparel.js';
import {reservesTicketInventory} from './checkout.js';
import {PROMO_VIP_PRICE} from './promo-vip.js';
import crypto from 'node:crypto';
import {ticketCapacity,GA_PRODUCT,CLAIM_DEADLINE} from './admission-transition.js';
export const VIP_PRODUCT='kv-all-access-2026';
const token=()=>crypto.randomBytes(32).toString('hex');
const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode});};
const clean=(v,n=200)=>String(v||'').trim().slice(0,n);
export function eventFor(s){const e=s.events.find(e=>e.slug==='kingdom-vibe-live-2026');if(!e)fail('Event unavailable.',503);return e;}
export function canManageGuest(user,g){return user.role==='owner'||(user.role==='staff'&&user.organizationId===g.organizationId&&user.permissions?.includes('guestlists')&&g.assignedRepId===user.id);}
export function createGuest(s,input,user){const e=eventFor(s),name=clean(input.name),handle=clean(input.handle,80).replace(/^@/,'');if(!name)fail('Name is required.');if(handle&&!/^[\w.]+$/.test(handle))fail('Enter an Instagram handle without a URL.');s.specialGuests||=[];if(handle&&s.specialGuests.some(g=>g.handle.toLowerCase()===handle.toLowerCase()))fail('This profile is already on the list.',409);const g={id:crypto.randomUUID(),organizationId:e.organizationId,eventId:e.id,name,handle,email:clean(input.email),phone:clean(input.phone,60),notes:clean(input.notes,3000),assignedRepId:'',status:'new',manageToken:token(),audienceToken:token(),attendees:[],recognitionConsent:false,createdAt:new Date().toISOString(),createdBy:user.id};s.specialGuests.push(g);return g;}
export function findGuest(s,key,kind='manage'){if(!/^[a-f0-9]{64}$/.test(key||''))fail('Invitation not found.',404);const g=(s.specialGuests||[]).find(g=>g[kind==='audience'?'audienceToken':'manageToken']===key);if(!g)fail('Invitation not found.',404);return g;}
export function publicGuest(g,kind){const counts={vip:g.attendees.filter(a=>a.kind==='vip').length,ga:g.attendees.filter(a=>a.kind==='ga').length};return {name:g.name,confirmed:!!g.confirmedAt,closed:g.status==='declined'||Date.now()>Date.parse(CLAIM_DEADLINE),limits:{vip:2,ga:null},counts,...(kind==='manage'?{recognitionConsent:g.recognitionConsent,audienceToken:g.confirmedAt?g.audienceToken:null,attendees:g.attendees.map(a=>({...a}))}:{})};}
export function addAttendee(s,g,input,kind,now=Date.now()){
 if(now>Date.parse(CLAIM_DEADLINE)||g.status==='declined')fail('This guest list is closed.',409);
 const name=clean(input.name,120),email=clean(input.email,254).toLowerCase(),phone=clean(input.phone,60),requestId=clean(input.requestId,80);
 if(!name||!/^\S+@\S+\.\S+$/.test(email)||phone.replace(/\D/g,'').length<7)fail('Provide each attendee’s name, valid email and phone number.');
 if(!/^[\w-]{16,80}$/.test(requestId))fail('Please reload and try again.');
 const prior=g.attendees.find(a=>a.requestId===requestId);if(prior){if(prior.name!==name||prior.email!==email||prior.phone!==phone||prior.kind!==kind||String(prior.shirtSize||'')!==String(input.shirtSize||''))fail('This submission already issued a different pass.',409);return prior;}
 if(!['vip','ga'].includes(kind))fail('Invalid pass type.');if(kind==='ga'&&!g.confirmedAt)fail('The special guest must confirm first.',409);
 if(kind==='vip'&&g.attendees.filter(a=>a.kind==='vip').length>=2)fail('This guest list has reached its pass limit.',409);
 if((s.specialGuests||[]).some(x=>x.attendees.some(a=>a.email===email)))fail('This email already has a special-guest pass. Contact your host for the existing pass.',409);
 const e=eventFor(s),productId=kind==='vip'?VIP_PRODUCT:GA_PRODUCT,p=e.products.find(p=>p.id===productId);if(!p||ticketCapacity(e,p,s.orders,now)<1)fail('This pass type is currently full. Please contact the KVN team.',409);
 const shirtSize=kind==='vip'?clean(input.shirtSize,20):'',config=normalizeApparelConfig(p.includedApparel);
 if(shirtSize){if(config.mode==='none'||!config.sizes.includes(shirtSize))fail('Select an available shirt size.');const pending=s.orders.filter(o=>o.eventId===e.id&&reservesTicketInventory(o,now)).flatMap(o=>o.items||[]).filter(i=>i.productId===p.id).flatMap(i=>i.ticketSelections||[]).filter(x=>x.apparelSelected&&x.apparelSize===shirtSize).length;if(config.sizeInventory[shirtSize]!=null&&config.sizeInventory[shirtSize]<=pending)fail('This shirt size is unavailable. Choose another size or no shirt.',409);}
 const at=new Date(now).toISOString(),id=crypto.randomUUID(),passToken=token(),ticketName=kind==='vip'?'Special Guest — VIP':'Special Guest List — General Admission';
 const ticket={id:crypto.randomUUID(),code:'KVN-'+crypto.randomBytes(16).toString('hex').toUpperCase(),productId,ticketName,holderName:name,holderEmail:email,apparel:shirtSize?{mode:'included',name:config.name,size:shirtSize,unitAmount:0,fulfilled:false}:null,includedApparel:shirtSize?{size:shirtSize,fulfilled:false}:null,checkedIn:false,checkedInAt:null,status:'active'};
 const order={id,eventId:e.id,organizationId:e.organizationId,orderType:'special_guest',bundleWorkflowVersion:1,fulfillmentMethod:'will_call',specialGuestId:g.id,commissionEligible:false,buyerName:name,buyerEmail:email,customer:{name,email,cellPhone:phone},items:[{productId,name:ticketName,type:'ticket',quantity:1,unitAmount:0,apparelMode:shirtSize?'included':'none',ticketSelections:[{apparelSelected:!!shirtSize,apparelSize:shirtSize||null}]}],amountSubtotal:0,amountTotal:0,status:'complimentary',createdAt:at,tickets:[ticket]};
 const a={id:crypto.randomUUID(),requestId,name,email,phone,kind,shirtSize,orderId:id,passToken,createdAt:at};s.orders.push(order);p.sold=Number(p.sold||0)+1;if(shirtSize&&p.includedApparel?.sizeInventory?.[shirtSize]!=null)p.includedApparel.sizeInventory[shirtSize]--;g.attendees.push(a);if(!g.confirmedAt&&kind==='vip'){g.confirmedAt=at;g.status='confirmed';g.recognitionConsent=input.recognitionConsent===true;g.recognitionConsentAt=at;}return a;
}
export function specialUpgradeClaim(s,key){
 if(!/^[a-f0-9]{64}$/.test(key||''))fail('Pass not found.',404);
 for(const g of s.specialGuests||[]){const a=g.attendees.find(a=>a.passToken===key);if(a){if(a.kind!=='ga')fail('Your VIP pass does not require an upgrade.');return {id:a.id,specialGuestId:g.id,name:a.name,email:a.email,phone:a.phone,quantity:1,accessToken:a.passToken,orderId:a.orderId,upgradeOrderId:a.upgradeOrderId,discipleId:''};}}
 fail('Pass not found.',404);
}
export function completeSpecialUpgrade(s,order){
 const g=(s.specialGuests||[]).find(g=>g.id===order.specialGuestId),a=g?.attendees.find(a=>a.id===order.sponsoredClaimId);
 if(!a||a.kind!=='ga')fail('Original guest pass missing.',409);
 if(a.upgradeOrderId){if(a.upgradeOrderId===order.id)return;fail('Another upgrade already completed.',409);}
 const original=s.orders.find(o=>o.id===a.orderId);if(!original)fail('Original order missing.',409);
 for(const [i,t]of original.tickets.entries()){t.status='replaced';t.replacedByOrderId=order.id;if(t.checkedIn&&order.tickets[i]){order.tickets[i].checkedIn=true;order.tickets[i].checkedInAt=t.checkedInAt;}}
 // Move the same admission from GA to VIP; payment finalization has already added VIP inventory.
 const e=eventFor(s),ga=e.products.find(p=>p.id===GA_PRODUCT);if(ga)ga.sold=Math.max(0,Number(ga.sold||0)-1);
 a.upgradeOrderId=order.id;a.upgradedAt=order.paidAt||new Date().toISOString();
}
export function guestPass(s,key){
 if(!/^[a-f0-9]{64}$/.test(key||''))fail('Pass not found.',404);
 for(const g of s.specialGuests||[]){const a=g.attendees.find(a=>a.passToken===key);if(a){const o=s.orders.find(o=>o.id===(a.upgradeOrderId||a.orderId)),t=o?.tickets?.[0];if(!t||o.refunded||o.refundedAt||o.status==='refunded'||o.paymentAttention||t.status==='replaced')fail('Pass unavailable. Contact the KVN team.',410);const e=eventFor(s),vip=e.products.find(p=>p.id===VIP_PRODUCT),pending=s.orders.find(o=>o.sponsoredClaimId===a.id&&o.specialGuestId===g.id&&['pending','checkout_failed'].includes(o.status));return {name:a.name,email:a.email,phone:a.phone,eventId:e.id,upgraded:!!a.upgradeOrderId,kind:a.upgradeOrderId?'vip':a.kind,code:t.code,checkedIn:t.checkedIn,host:g.name,shirtSize:(t.apparel||t.includedApparel)?.size||null,upgrade:a.kind==='ga'&&!a.upgradeOrderId?{price:PROMO_VIP_PRICE,sizes:normalizeApparelConfig(vip?.includedApparel).sizes,available:!!vip&&!t.checkedIn&&ticketCapacity(e,vip,s.orders)>0,pending:pending?{status:pending.status}:null}:null};}}
 fail('Pass not found.',404);
}
