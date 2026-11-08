import {tripCopy} from './luxride-trip-updates.js';
import {createHash,createHmac} from 'node:crypto';
import {smsConnectionStatus,smsEncoding} from './sms-model.js';
import {normalizeSmsPhone,smsPermission} from './sms-audiences.js';
const brand='LuxRide Airport Transit';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const reference=id=>'LUXRIDE-'+id.slice(0,8).toUpperCase();
export function tripUrl(p,env=process.env){const id=p.id.slice(0,36);if(!/^[a-f0-9-]{36}$/.test(id)||!env.LUXRIDE_BRIDGE_SECRET||!env.LUXRIDE_CALLBACK_ORIGIN)return null;const u=new URL(env.LUXRIDE_CALLBACK_ORIGIN);if(u.protocol!=='https:'||u.pathname!=='/'||u.username||u.password)return null;return u.origin+'/t#'+createHmac('sha256',env.LUXRIDE_BRIDGE_SECRET).update('luxride-status:'+id).digest().subarray(0,16).toString('base64url');}
export function content(p,owner=false){
 if(p.tripUpdate){const copy=tripCopy(p),text=`${brand}\n${reference(p.id)}\n\n${copy.text}\n\nReply to this email for booking help.\nA venture of Kingdom Alliance Partners Inc.`;return {subject:`${brand} | ${p.pilot?'TEST · ':''}${copy.label} | ${reference(p.id)}`,text,html:`<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;background:#f5f3ee;color:#151515"><main style="max-width:620px;margin:24px auto;background:white;padding:32px"><h1>${esc(copy.label)}</h1><p style="white-space:pre-line;line-height:1.6">${esc(text)}</p>${p.tripUrl?`<p><a href="${esc(p.tripUrl)}">View your trip</a></p>`:''}<a href="${esc(p.accountUrl)}">My LuxRide account</a></main></body></html>`};}

 const ref=reference(p.id),label=p.cancellation?'Booking canceled':p.notificationTest?'Notification test — no payment taken':p.pilot?'$1 booking test — no transportation purchased':'Booking confirmed';
 const legs=p.journey.legs.map((l,i)=>`${i?'Return ride':'First ride'}: ${l.direction==='to'?'To':'From'} ${p.journey.airport}\n${l.date} at ${l.time} Eastern\n${l.address}${l.flight?'\nFlight: '+l.flight:''}`).join('\n\n');
 const text=`${brand}\n${label}\n${ref}\n\nHello ${owner?'Frank':p.name},\n\n${p.cancellation?`Your entire booking is canceled. Your reserved times have been released.\nRefund requested: $${(p.cancellation.refund/100).toFixed(2)}. A request is not a completed refund; check your LuxRide account for status.\nRide credit issued: $${(p.cancellation.credit/100).toFixed(2)}. Sign in with this email to see and use your balance.`:p.notificationTest?'This is a delivery check before checkout. No payment was taken and no ride is booked.':(owner?'A booking payment was verified.':'Your payment was verified.')+'\nCard payment: $'+(p.amount/100).toFixed(2)+(p.creditUsed?'\nRide credit used: $'+(p.creditUsed/100).toFixed(2):'')}\n\n${legs}\n\nPassengers: ${p.passengers}\nLuggage: ${p.luggage}\nCapacity: up to 4 full-size suitcases and 4 personal items per vehicle.\n\n${p.cancellation?'No ride remains reserved for this booking.':p.notificationTest?'TEST ONLY: no calendar holds, charge, or ride booking.':p.pilot?'TEST ONLY: no time slot is reserved and no ride is scheduled.':'Service provider: Frank Johnson, insured independent contractor with a clean background check. Vehicle: Genesis GV70.'}\n\n${owner?`Rider: ${p.name}\nEmail: ${p.email}\nPhone: ${p.phone}\n`:''}${p.tripUrl&&!p.cancellation&&!p.notificationTest?'View your trip: '+p.tripUrl+'\n\nMy account: '+new URL(p.tripUrl).origin+'/account\nSign in with this email address and request a six-digit code. No password needed.\n\n':''}Reply to this email for help with your booking.\n${brand} — A KAP venture`;
 return {subject:`${brand} | ${label} | ${ref}`,text,html:`<!doctype html><html lang="en"><body style="margin:0;background:#f5f3ee;color:#151515;font-family:Arial,sans-serif"><main style="max-width:620px;margin:24px auto;background:#fff;padding:32px"><p style="letter-spacing:2px">${brand}</p><h1>${esc(label)}</h1><p style="white-space:pre-line;line-height:1.6">${esc(text)}</p>${p.tripUrl&&!p.cancellation&&!p.notificationTest?`<p><a href="${esc(p.tripUrl)}" style="display:inline-block;background:#20241c;color:white;padding:14px 22px;text-decoration:none">View your trip</a></p><p><a href="${esc(new URL(p.tripUrl).origin+'/account')}">My LuxRide account</a> · Sign in with your email and a one-time code.</p>`:''}</main></body></html>`};
}
export function smsContent(p){
 const footer='Reply STOP to stop; HELP for help.';
 let body;
 if(p.tripUpdate){const t=p.tripUpdate,eta=t.eta?new Date(t.eta).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}):'';
 const state={on_way:'On the way.'+(eta?' ETA '+eta+' ET.':''),arrived:'Driver at pickup.',complete:'Trip complete.',reminder_24h:'Ride reminder: tomorrow.',reminder_2h:'Ride reminder: in 2 hours.',five_minutes:'Driver about 5 minutes away.'}[t.state]||'Ride update.';
 body=brand+': '+(p.pilot?'TEST: ':'')+state+' '+(p.tripUrl||p.accountUrl)+' '+footer;
 if(smsEncoding(body).segments>1)body='LuxRide: '+(p.pilot?'TEST. ':'')+'Trip update. '+(p.tripUrl||p.accountUrl)+' '+footer;
 }else{const status=p.cancellation?'Booking canceled. Refund/credit details emailed.':p.notificationTest?'Notification test. No charge or ride booked.':p.pilot?'$1 TEST paid. No ride purchased.':'Booking confirmed.';
 body=brand+': '+status+' '+reference(p.id)+'. '+(p.cancellation?'':'Details emailed. ')+footer;
 if(p.tripUrl&&!p.cancellation&&!p.notificationTest)body='LuxRide: '+(p.pilot?'TEST paid; no ride.':'Booking confirmed.')+' '+p.tripUrl+' '+footer;}
 if(smsEncoding(body).segments>1||smsEncoding(body).encoding!=='GSM-7')throw Error('LuxRide SMS exceeds provider limit');
 return body;
}
export function validateNotification(p,session){
 if(!p||!/^[-a-f0-9]{36}$/.test(p.id)||session.metadata?.product!=='luxride'||session.metadata?.luxride_order!==p.id||session.payment_status!=='paid'||session.currency!=='usd'||session.amount_total!==p.amount||session.customer_email?.toLowerCase()!==p.email?.toLowerCase()||p.pilot!==(session.metadata?.pilot==='true'))throw Error('Verified LuxRide payment required');
 validateBookingDetails(p);
}
export function validateBookingDetails(p){
 if(!p.name||p.name.length>100||!p.email||p.email.length>254||!p.journey||!['ATL','RDU'].includes(p.journey.airport)||!Array.isArray(p.journey.legs)||p.journey.legs.length<1||p.journey.legs.length>2||!Number.isInteger(p.passengers)||p.passengers<1||p.passengers>4||typeof p.luggage!=='string'||p.luggage.length>100)throw Error('Invalid booking details');
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
  let result;try{const r=await fetchImpl('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:env.LUXRIDE_EMAIL_FROM||'LuxRide Airport Transit <luxride@tickets.kvnlive.com>',to:[recipient],reply_to:env.LUXRIDE_OWNER_EMAIL,...content({...p,tripUrl:tripUrl(p,env)},role==='owner'),tags:[{name:'initiative',value:'LUXRIDE'},{name:'booking',value:p.id}]})});const d=await r.json();result=r.ok&&d.id?{status:'accepted',messageId:d.id}:{status:'failed',reason:'Email provider rejected the request'};}catch{result={status:'retry_pending',reason:'Email provider outcome unknown; idempotent retry available'};}save(key,result);return result;
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
  const body=smsContent({...p,tripUrl:tripUrl(p,env)});
  let result;try{const r=await (env.SMS_PROVIDER==='txt180'?txtClient:twilioClient).sendMessage({to:phone,body,attemptId:'luxride-'+p.id});result={status:'accepted',messageId:r.sid||null,deliveryVerified:false};}catch(e){result={status:e.outcome==='rejected'?'failed':'needs_review',providerCode:Number.isInteger(e.providerCode)?e.providerCode:null,reason:e.outcome==='rejected'?'SMS provider rejected the message':'SMS outcome unknown; do not resend automatically'};}save(key,result);return result;
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
