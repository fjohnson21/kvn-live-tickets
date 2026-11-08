import {createHash} from 'node:crypto';
import {smsConnectionStatus} from './sms-model.js';
import {normalizeSmsPhone,smsPermission} from './sms-audiences.js';
const brand='LuxRide Airport Transit';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const reference=id=>'LUXRIDE-'+id.slice(0,8).toUpperCase();
export function content(p,owner=false){
 const ref=reference(p.id),label=p.notificationTest?'Notification test — no payment taken':p.pilot?'$1 booking test — no transportation purchased':'Booking confirmed';
 const legs=p.journey.legs.map((l,i)=>`${i?'Return ride':'First ride'}: ${l.direction==='to'?'To':'From'} ${p.journey.airport}\n${l.date} at ${l.time} Eastern\n${l.address}${l.flight?'\nFlight: '+l.flight:''}`).join('\n\n');
 const text=`${brand}\n${label}\n${ref}\n\nHello ${owner?'Frank':p.name},\n\n${p.notificationTest?'This is a delivery check before checkout. No payment was taken and no ride is booked.':(owner?'A booking payment was verified.':'Your payment was verified.')+'\nPaid: $'+(p.amount/100).toFixed(2)}\n\n${legs}\n\nPassengers: ${p.passengers}\nLuggage: ${p.luggage}\nCapacity: up to 4 regular-size suitcases and 4 personal items/book bags per vehicle.\n\n${p.notificationTest?'TEST ONLY: no calendar holds, charge, or ride booking.':p.pilot?'TEST ONLY: calendar holds are for testing; no ride is scheduled.':'Service provider: Frank Johnson, insured independent contractor with a clean background check. Vehicle: Genesis GV70.'}\n\n${owner?`Rider: ${p.name}\nEmail: ${p.email}\nPhone: ${p.phone}\n`:''}Reply to this email for help with your booking.\n${brand}`;
 return {subject:`${brand} | ${label} | ${ref}`,text,html:`<!doctype html><html lang="en"><body style="margin:0;background:#f5f3ee;color:#151515;font-family:Arial,sans-serif"><main style="max-width:620px;margin:24px auto;background:#fff;padding:32px"><p style="letter-spacing:2px">${brand}</p><h1>${esc(label)}</h1><p style="white-space:pre-line;line-height:1.6">${esc(text)}</p></main></body></html>`};
}
export function validateNotification(p,session){
 if(!p||!/^[-a-f0-9]{36}$/.test(p.id)||session.metadata?.product!=='luxride'||session.metadata?.luxride_order!==p.id||session.payment_status!=='paid'||session.currency!=='usd'||session.amount_total!==p.amount||session.customer_email?.toLowerCase()!==p.email?.toLowerCase()||p.pilot!==(session.metadata?.pilot==='true'))throw Error('Verified LuxRide payment required');
 validateBookingDetails(p);
}
export function validateBookingDetails(p){
 if(!p.name||p.name.length>100||!p.email||p.email.length>254||!p.journey||!['ATL','RDU'].includes(p.journey.airport)||!Array.isArray(p.journey.legs)||p.journey.legs.length<1||p.journey.legs.length>2||!Number.isInteger(p.passengers)||p.passengers<1||p.passengers>3||typeof p.luggage!=='string'||p.luggage.length>100)throw Error('Invalid booking details');
 for(const l of p.journey.legs)if(!/^\d{4}-\d{2}-\d{2}$/.test(l.date)||!/^\d{2}:\d{2}$/.test(l.time)||!['to','from'].includes(l.direction)||typeof l.address!=='string'||l.address.length>300)throw Error('Invalid trip details');
 if(p.smsConsent===true&&(!normalizeSmsPhone(p.phone)||p.smsDisclosureVersion!=='luxride-transactional-1'||!Number.isFinite(Date.parse(p.smsConsentedAt))))throw Error('SMS consent evidence required');
}
export function createLuxrideNotifications({readStore,writeStore,txtClient,twilioClient,env=process.env,fetchImpl=fetch}){
 const inFlight=new Map();let checkedAt=0,verified=false,checking;
 const status=()=>{const s=smsConnectionStatus(env);return {brand,campaignCode:'LUXRIDE',emailConfigured:!!env.RESEND_API_KEY,smsProvider:env.SMS_PROVIDER==='txt180'?'txt180':'twilio',smsConfigured:s.configured,smsSendingEnabled:s.sendingEnabled,smsConnectionVerified:verified,ready:!!env.RESEND_API_KEY&&!!env.LUXRIDE_OWNER_EMAIL&&s.sendingEnabled&&verified,ownerEmailConfigured:!!env.LUXRIDE_OWNER_EMAIL,ownerSmsConfigured:!!normalizeSmsPhone(env.LUXRIDE_OWNER_PHONE),keywordProvisioned:false};};
 async function inspect(){if(Date.now()-checkedAt<60000)return status();if(!checking)checking=(async()=>{try{if(env.SMS_PROVIDER==='txt180')await txtClient.listContacts();else await twilioClient.readService();verified=true;}catch{verified=false;}checkedAt=Date.now();checking=null;})();await checking;return status();}
 const get=id=>readStore().luxrideNotifications?.[id];
 function save(id,patch){const s=readStore();s.luxrideNotifications??={};s.luxrideNotifications[id]={...s.luxrideNotifications[id],...patch};writeStore(s);}
 async function email(p,recipient,role){
  const key=p.id+':email:'+role,old=get(key);if(['accepted','needs_review','submitting'].includes(old?.status))return old;
  if(!env.RESEND_API_KEY||!recipient)return {status:'not_configured'};
  const startedAt=old?.startedAt||Date.now();if(Date.now()-startedAt>23*3600000){const r={status:'needs_review',reason:'Email retry window elapsed'};save(key,r);return r;}
  save(key,{status:'submitting',startedAt,campaignCode:'LUXRIDE'});
  let result;try{const r=await fetchImpl('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:env.LUXRIDE_EMAIL_FROM||'LuxRide Airport Transit <luxride@tickets.kvnlive.com>',to:[recipient],reply_to:env.LUXRIDE_OWNER_EMAIL,...content(p,role==='owner'),tags:[{name:'initiative',value:'LUXRIDE'},{name:'booking',value:p.id}]})});const d=await r.json();result=r.ok&&d.id?{status:'accepted',messageId:d.id}:{status:'failed',reason:'Email provider rejected the request'};}catch{result={status:'retry_pending',reason:'Email provider outcome unknown; idempotent retry available'};}save(key,result);return result;
 }
 async function sms(p){
  const key=p.id+':sms:rider',old=get(key);if(['accepted','needs_review','submitting','opted_out'].includes(old?.status))return old;
  if(p.smsConsent!==true)return {status:'not_requested'};
  const phone=normalizeSmsPhone(p.phone);if(!smsConnectionStatus(env).sendingEnabled)return {status:'not_configured'};
  if(smsPermission(readStore(),phone).reason==='opted_out'){save(key,{status:'opted_out'});return {status:'opted_out'};}
  // TXT180 is a shared transport. LuxRide records never grant KVN marketing consent.
  try{if(env.SMS_PROVIDER==='txt180'){
   const stops=await txtClient.optouts();if(stops.some(s=>normalizeSmsPhone(s.phone)===phone)){save(key,{status:'opted_out'});return {status:'opted_out'};}
   const contacts=await txtClient.listContacts();if(!contacts.some(c=>normalizeSmsPhone(c.phone)===phone))await txtClient.addContact({phone,name:p.name});
  }}catch{return {status:'failed',reason:'Unable to verify SMS contact and opt-out status'};}
  save(key,{status:'submitting',campaignCode:'LUXRIDE',consent:{purpose:'booking_updates',phone,version:p.smsDisclosureVersion,at:p.smsConsentedAt}});
  const legs=p.journey.legs.map((l,i)=>`${i?'Return':'Pickup'} ${l.date} ${l.time} ET ${l.direction==='to'?'to':'from'} ${p.journey.airport}`).join('; ');
  const body=`LuxRide Airport Transit: ${p.notificationTest?'Notification test. No charge or ride booked.':p.pilot?'$1 TEST paid. No ride purchased.':'Booking confirmed.'} ${reference(p.id)}. ${legs}. Details emailed. Reply STOP to unsubscribe, HELP for help.`;
  let result;try{const r=await (env.SMS_PROVIDER==='txt180'?txtClient:twilioClient).sendMessage({to:phone,body,attemptId:'luxride-'+p.id});result={status:'accepted',messageId:r.sid||null,deliveryVerified:false};}catch(e){result={status:e.outcome==='rejected'?'failed':'needs_review',reason:e.outcome==='rejected'?'SMS provider rejected the message':'SMS outcome unknown; do not resend automatically'};}save(key,result);return result;
 }
 async function send(p){
  if(inFlight.has(p.id))return inFlight.get(p.id);
  const task=(async()=>{const hash=createHash('sha256').update(JSON.stringify(p)).digest('hex'),old=get(p.id);if(old&&old.hash!==hash)throw Error('Booking notification content changed');if(!old)save(p.id,{hash,campaignCode:'LUXRIDE',createdAt:Date.now()});
   // Sequential sends bound provider load and retain each result before proceeding.
   const riderEmail=await email(p,p.email,'rider'),ownerEmail=await email(p,env.LUXRIDE_OWNER_EMAIL,'owner'),riderSms=await sms(p);
   const result={riderEmail,ownerEmail,riderSms,campaignCode:'LUXRIDE'};save(p.id,{result});return result;
  })();inFlight.set(p.id,task);try{return await task}finally{inFlight.delete(p.id)}
 }
 // Never blindly replay a submission interrupted by a process restart.
 const s=readStore();let changed=false;for(const r of Object.values(s.luxrideNotifications||{}))if(r.status==='submitting'){r.status='needs_review';changed=true;}if(changed)writeStore(s);
 return {inspect,send};
}
