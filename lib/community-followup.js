import {randomUUID} from 'node:crypto';
import {ensureSms,smsEncoding,smsSenderFingerprint,smsSenderIdentity,txt180Scope} from './sms-model.js';
import {normalizeSmsPhone,recordSmsConsent,smsPermission} from './sms-audiences.js';
export const FOLLOWUP='community-rsvp-thank-you';
const VERSION='2026-10-24.2';
const EVIDENCE='By selecting Yes, I agree to receive recurring text messages from Kingdom Vibe Network at the mobile number provided about KV Live, future events, offers and promotions, including automated messages. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.';
export const followupText=token=>`KV Live: Thank you! Your free passes are secured. Upgrade to reserved for $25: https://kvnlive.com/passes#p=${token} Reply STOP to opt out.`;
export function queueCommunityFollowup(store,order,input,{trusted=false,env=process.env}={}){
 if(order.followupSms)return order.followupSms;
 const phone=normalizeSmsPhone(order.customer?.cellPhone);
 if(!trusted||input.consentVersion!==VERSION||typeof input.textConsent!=='boolean'||!phone||!order.passAccessToken){order.followupSms={status:'excluded',reason:'SMS permission was not verified.'};return order.followupSms;}
 ensureSms(store);
 // A new web form may record preferences, but never clear a provider opt-out.
 const suppressed=store.sms.consentEvents.some(e=>e.phone===phone&&e.action==='withdraw'&&['txt180','twilio'].includes(e.source));
 if(suppressed){order.followupSms={status:'excluded',reason:'Provider opt-out retained.'};return order.followupSms;}
 recordSmsConsent(store,{id:'community-rsvp:'+order.id,scopeId:'kvn',phone,purpose:'marketing',action:input.textConsent?'grant':'withdraw',source:'community_rsvp_form',evidence:EVIDENCE,disclosureVersion:VERSION,occurredAt:order.createdAt});
 if(!input.textConsent||suppressed||!smsPermission(store,phone).eligible){order.followupSms={status:'excluded',reason:suppressed?'Provider opt-out retained.':'SMS updates declined.'};return order.followupSms;}
 const text=followupText(order.passAccessToken),sender=smsSenderIdentity(env),encoding=smsEncoding(text,{sender:sender.publicSender});
 if(encoding.segments!==1)throw Error('RSVP follow-up must fit one SMS segment.');
 const campaignId=randomUUID(),attemptId=randomUUID(),at=new Date().toISOString();
 store.sms.campaigns.push({id:campaignId,scopeId:'kvn',kind:'automation',automation:FOLLOWUP,orderId:order.id,text,segmentIds:[],status:'queued',actor:'owner-authorized-rsvp-followup',createdAt:at,estimatedUnits:1,encoding,recipientCount:1,senderFingerprint:smsSenderFingerprint(env),...sender});
 store.sms.attempts.unshift({id:attemptId,campaignId,scopeId:'kvn',automation:FOLLOWUP,orderId:order.id,phone,sourceIds:['orders:'+order.id],consentId:'community-rsvp:'+order.id,...sender,testAuthorized:false,status:'queued',createdAt:at,units:1,expiresAt:new Date(Date.now()+30*60000).toISOString()});
 store.sms.audit.push({id:randomUUID(),kind:'automatic_rsvp_followup',actor:'owner-authorized-rsvp-followup',at,targetId:campaignId});store.sms.revision++;
 order.followupSms={status:'queued',campaignId,attemptId};return order.followupSms;
}
export function createCommunityRecipientPreparation({readStore,writeStore,client,env=process.env}){
 return async attempt=>{
  if(attempt.automation!==FOLLOWUP||env.SMS_PROVIDER!=='txt180')return;
  let s=ensureSms(readStore());
  if(s.sms.consentEvents.some(e=>e.phone===attempt.phone&&e.action==='withdraw'&&['txt180','twilio'].includes(e.source))||!smsPermission(s,attempt.phone).eligible)throw Object.assign(Error('Recipient opted out or permission missing.'),{excluded:true});
  const scope=txt180Scope(env);s.sms.contacts||=[];
  if(s.sms.contacts.some(c=>c.phone===attempt.phone&&c.providerScope===scope&&c.status==='active'))return;
  let current=s.sms.attempts.find(a=>a.id===attempt.id);
  if(current.contactPreparation?.status==='submitting'||current.contactPreparation?.status==='needs_review')throw Error('Contact registration needs review.');
  // Find provider contacts before adding, including contacts not yet imported locally.
  const contacts=await client.listContacts();let found=contacts.find(c=>normalizeSmsPhone(c.phone)===attempt.phone);
  if(!found){s=ensureSms(readStore());current=s.sms.attempts.find(a=>a.id===attempt.id);current.contactPreparation={status:'submitting'};writeStore(s);const result=await client.addContact({phone:attempt.phone,name:''});found={contactId:result.contactId};}
  s=ensureSms(readStore());s.sms.contacts||=[];if(!s.sms.contacts.some(c=>c.phone===attempt.phone&&c.providerScope===scope))s.sms.contacts.push({id:randomUUID(),phone:attempt.phone,name:'',providerScope:scope,providerContactId:found.contactId,groupIds:[],status:'active',createdAt:new Date().toISOString(),source:FOLLOWUP});
  s.sms.attempts.find(a=>a.id===attempt.id).contactPreparation={status:'complete'};writeStore(s);
 };
}
export function readCommunityPass(store,token){
 if(!/^[A-Za-z0-9_-]{22}$/.test(String(token||'')))return null;
 const order=store.orders.find(o=>o.orderType==='community_rsvp'&&o.status==='complimentary'&&!o.paymentAttention&&o.passAccessToken===token);
 if(!order)return null;
 return {orderId:order.id,tickets:order.tickets.filter(t=>t.status!=='replaced').map(t=>({code:t.code,ticketName:t.ticketName,seating:t.seating})),emailStatus:order.confirmationEmail?.status||'pending'};
}
