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
export function publicGuest(g,kind){const counts={vip:g.attendees.filter(a=>a.kind==='vip').length,ga:g.attendees.filter(a=>a.kind==='ga').length};return {name:g.name,confirmed:!!g.confirmedAt,closed:g.status==='declined'||Date.now()>Date.parse(CLAIM_DEADLINE),limits:{vip:2,ga:10},counts,...(kind==='manage'?{recognitionConsent:g.recognitionConsent,audienceToken:g.confirmedAt?g.audienceToken:null,attendees:g.attendees.map(a=>({...a}))}:{})};}
export function addAttendee(s,g,input,kind,now=Date.now()){
 if(now>Date.parse(CLAIM_DEADLINE)||g.status==='declined')fail('This guest list is closed.',409);
 const name=clean(input.name,120),email=clean(input.email,254).toLowerCase(),phone=clean(input.phone,60),requestId=clean(input.requestId,80);
 if(!name||!/^\S+@\S+\.\S+$/.test(email)||phone.replace(/\D/g,'').length<7)fail('Provide each attendee’s name, valid email and phone number.');
 if(!/^[\w-]{16,80}$/.test(requestId))fail('Please reload and try again.');
 const prior=g.attendees.find(a=>a.requestId===requestId);if(prior){if(prior.name!==name||prior.email!==email||prior.phone!==phone||prior.kind!==kind)fail('This submission already issued a different pass.',409);return prior;}
 if(!['vip','ga'].includes(kind))fail('Invalid pass type.');if(kind==='ga'&&!g.confirmedAt)fail('The special guest must confirm first.',409);
 if(g.attendees.filter(a=>a.kind===kind).length>=(kind==='vip'?2:10))fail('This guest list has reached its pass limit.',409);
 if((s.specialGuests||[]).some(x=>x.attendees.some(a=>a.email===email)))fail('This email already has a special-guest pass. Contact your host for the existing pass.',409);
 const e=eventFor(s),productId=kind==='vip'?VIP_PRODUCT:GA_PRODUCT,p=e.products.find(p=>p.id===productId);if(!p||ticketCapacity(e,p,s.orders,now)<1)fail('This pass type is currently full. Please contact the KVN team.',409);
 const at=new Date(now).toISOString(),id=crypto.randomUUID(),passToken=token(),ticketName=kind==='vip'?'Special Guest — VIP':'Special Guest List — General Admission';
 const ticket={id:crypto.randomUUID(),code:'KVN-'+crypto.randomBytes(16).toString('hex').toUpperCase(),productId,ticketName,holderName:name,holderEmail:email,apparel:null,includedApparel:null,checkedIn:false,checkedInAt:null,status:'active'};
 const order={id,eventId:e.id,organizationId:e.organizationId,orderType:'special_guest',specialGuestId:g.id,commissionEligible:false,buyerName:name,buyerEmail:email,customer:{name,email,cellPhone:phone},items:[{productId,name:ticketName,type:'ticket',quantity:1,unitAmount:0}],amountSubtotal:0,amountTotal:0,status:'complimentary',createdAt:at,tickets:[ticket]};
 const a={id:crypto.randomUUID(),requestId,name,email,phone,kind,orderId:id,passToken,createdAt:at};s.orders.push(order);p.sold=Number(p.sold||0)+1;g.attendees.push(a);if(!g.confirmedAt&&kind==='vip'){g.confirmedAt=at;g.status='confirmed';g.recognitionConsent=input.recognitionConsent===true;g.recognitionConsentAt=at;}return a;
}
export function guestPass(s,key){if(!/^[a-f0-9]{64}$/.test(key||''))fail('Pass not found.',404);for(const g of s.specialGuests||[]){const a=g.attendees.find(a=>a.passToken===key);if(a){const o=s.orders.find(o=>o.id===a.orderId),t=o?.tickets?.[0];if(!t||o.refunded||t.status==='replaced')fail('Pass unavailable.',410);return {name:a.name,kind:a.kind,code:t.code,checkedIn:t.checkedIn,host:g.name};}}fail('Pass not found.',404);}
