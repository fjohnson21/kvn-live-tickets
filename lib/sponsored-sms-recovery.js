import crypto from 'node:crypto';
import {ensureSms,smsHash,txt180Scope,smsConnectionStatus,smsSenderIdentity,smsSenderFingerprint} from './sms-model.js';
import {normalizeSmsPhone,smsPermission,recordSmsConsent} from './sms-audiences.js';
import {refreshVerification} from './sponsored-passes.js';
const groupName='Comp Tickets - Unclaimed Recovery';
const email=x=>String(x||'').trim().toLowerCase();
const signature=c=>smsHash([email(c.email),normalizeSmsPhone(c.phone),c.name,c.discipleId||'',c.invitationId||'',c.quantity||1]);
const tally=items=>Object.fromEntries([...new Set(items)].map(k=>[k,items.filter(x=>x===k).length]));
function select(store,remote,stopped,scope){
 const all=store.sponsoredClaims||[],pending=all.filter(c=>!c.claimedAt&&!c.supersededAt&&!c.liveLaunchTest),excluded=[],candidates=[];
 for(const c of pending){
  const phone=normalizeSmsPhone(c.phone);let reason;
  if(!phone)reason='invalid_phone';
  else if(all.some(x=>x.claimedAt&&(email(x.email)===email(c.email)||normalizeSmsPhone(x.phone)===phone)))reason='already_claimed';
  else if(c.discipleId&&!(store.disciples||[]).some(d=>d.id===c.discipleId))reason='unknown_referral';
  else if(c.invitationId&&!(store.sponsoredInvitations||[]).some(i=>i.id===c.invitationId&&!i.claimedAt&&String(i.discipleId||'')===String(c.discipleId||'')))reason='invitation_unavailable';
  else if(stopped.has(phone)||smsPermission(store,phone).reason==='opted_out')reason='opted_out';
  else if(!smsPermission(store,phone).eligible)reason='missing_sms_permission';
  const contact=(store.sms.contacts||[]).find(x=>x.phone===phone&&x.providerScope===scope&&x.status==='active');
  if(!reason&&(!contact||!remote.has(phone)||remote.get(phone)!==contact.providerContactId))reason='not_registered';
  if(reason){excluded.push({claimId:c.id,reason});continue;}
  // A shared phone/email with conflicting identity, quantity or attribution needs owner review.
  const peers=pending.filter(x=>email(x.email)===email(c.email)||normalizeSmsPhone(x.phone)===phone);
  if(peers.some(x=>signature(x)!==signature(c))){excluded.push({claimId:c.id,reason:'ambiguous_identity_or_referral'});continue;}
  const chosen=peers.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))||a.id.localeCompare(b.id))[0];
  if(chosen.id!==c.id){excluded.push({claimId:c.id,reason:'duplicate_request'});continue;}
  candidates.push({claimId:c.id,phone,contactId:contact.id,providerContactId:contact.providerContactId,signature:signature(c),discipleId:c.discipleId||'',referral:(store.disciples||[]).find(d=>d.id===c.discipleId)?.name||'Direct KAP',status:'pending'});
 }
 return {sourceCount:pending.length,recipients:candidates,excluded};
}
function summary(run){return {runId:run.id,status:run.status,sourceCount:run.sourceCount,eligible:run.recipients.length,accepted:run.recipients.filter(r=>r.status==='accepted').length,excluded:run.recipients.filter(r=>r.status==='excluded').length,failed:run.recipients.filter(r=>r.status==='failed').length,needsReview:run.recipients.filter(r=>r.status==='needs_review').length,pending:run.recipients.filter(r=>r.status==='pending').length,exclusions:tally((run.excluded||[]).map(x=>x.reason)),attribution:tally(run.recipients.map(r=>r.referral)),acceptedAttribution:tally(run.recipients.filter(r=>r.status==='accepted').map(r=>r.referral)),groupId:run.group?.providerGroupId||null,campaignId:run.campaignId||null};}
// Operator-only, explicitly scoped one-time job. Must run in prestart with exclusive disk access.
export async function runSponsoredSmsRecovery({readStore,writeStore,client,env=process.env,now=Date.now}){
 const runId=env.TXT180_RECOVERY_ID;if(!runId)return {status:'disabled'};
 const scope=txt180Scope(env),mode=env.TXT180_RECOVERY_MODE;
 if(!/^[-\w]{1,80}$/.test(runId)||env.SMS_PROVIDER!=='txt180'||env.TXT180_RECOVERY_SCOPE!==scope||!['preview','send'].includes(mode))throw Error('Invalid recovery authorization configuration.');
 const at=()=>new Date(now()).toISOString(),d=ensureSms(readStore());d.sms.claimRecoveryRuns??=[];d.sms.groups??=[];d.sms.contacts??=[];
 let run=d.sms.claimRecoveryRuns.find(r=>r.id===runId);
 const save=()=>{d.sms.revision++;writeStore(d);};
 if(run&&run.scope!==scope)throw Error('Recovery account scope changed.');
 if(run&&['complete','blocked'].includes(run.status))return summary(run);
 if(run&&run.status==='running'){
  for(const r of run.recipients)if(r.status==='submitting'){r.status='needs_review';const a=d.sms.attempts.find(a=>a.id===r.attemptId);if(a){a.status='needs_review';a.reason='Interrupted recovery; do not resend without provider review.';}}
  run.status='blocked';save();return summary(run);
 }
 if(mode==='send'&&(!run||!/^\d+$/.test(env.TXT180_RECOVERY_EXPECTED_COUNT||'')||Number(env.TXT180_RECOVERY_EXPECTED_COUNT)!==run.recipients.length))throw Error('Preview and exact recipient count are required.');
 if(!d.events?.some(e=>e.slug==='kingdom-vibe-live-2026'&&e.status==='published'))throw Error('KV Live is not published.');
 const stopped=new Set((await client.optouts()).map(o=>normalizeSmsPhone(o.phone)));
 const remote=new Map();for(const c of await client.listContacts()){const p=normalizeSmsPhone(c.phone);if(!p||!/^\d+$/.test(c.contactId)||remote.has(p))throw Error('Ambiguous provider contact list.');remote.set(p,c.contactId);}
 if(mode==='preview'){
  if(run)return summary(run);
  const selected=select(d,remote,stopped,scope);if(selected.recipients.length>500)throw Error('Recovery exceeds 500 recipients.');
  run={id:runId,scope,status:'preview',createdAt:at(),...selected};d.sms.claimRecoveryRuns.push(run);save();return summary(run);
 }
 if(!smsConnectionStatus(env).sendingEnabled)throw Error('SMS sending is disabled.');
 const current=select(d,remote,stopped,scope),eligible=new Map(current.recipients.map(r=>[r.claimId,r]));
 for(const r of run.recipients)if(!eligible.has(r.claimId)||eligible.get(r.claimId).signature!==r.signature){r.status='excluded';r.reason=current.excluded.find(e=>e.claimId===r.claimId)?.reason||'claim_changed_or_completed';}
 const ready=run.recipients.filter(r=>r.status==='pending');
 if(!ready.length){run.status='complete';run.finishedAt=at();save();return summary(run);}
 const day=x=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(x));
 const used=d.sms.attempts.filter(a=>a.submittedAt&&day(a.submittedAt)===day(at())).reduce((n,a)=>n+(a.units||0),0);
 if(used+ready.length>10000)throw Error('Recovery exceeds daily SMS limit.');
 run.status='running';run.startedAt=at();save();
 try{
  let group=d.sms.groups.find(g=>g.providerScope===scope&&g.name===groupName);
  if(!group){
   run.group={status:'submitting'};save();
   const {groupId}=await client.addGroup({name:groupName,extension:'claim'});
   group={id:crypto.randomUUID(),name:groupName,extension:'claim',providerGroupId:groupId,providerScope:scope,createdAt:at()};d.sms.groups.push(group);
  }
  run.group={status:'complete',providerGroupId:group.providerGroupId,localId:group.id};
  const identity=smsSenderIdentity(env),campaign={id:crypto.randomUUID(),scopeId:'kvn',kind:'campaign',text:'KVN: Claim your comp pass within 48h: [private claim link] Reply STOP to opt out.',segmentIds:['group:'+group.id],status:'sending',actor:'owner-authorized-claim-recovery',createdAt:at(),recipientCount:ready.length,estimatedUnits:ready.length,senderFingerprint:smsSenderFingerprint(env),...identity};
  run.campaignId=campaign.id;d.sms.campaigns.push(campaign);save();
  for(const r of ready){
   // Recheck provider withdrawals immediately before each recipient, including long runs.
   const optouts=await client.optouts();
   for(const o of optouts){const phone=normalizeSmsPhone(o.phone);if(phone&&!d.sms.consentEvents.some(e=>e.id==='txt180-stop:'+scope+':'+o.id))recordSmsConsent(d,{id:'txt180-stop:'+scope+':'+o.id,scopeId:'kvn',phone,purpose:'marketing',action:'withdraw',source:'txt180',evidence:'TXT180 opt-out '+o.id,disclosureVersion:'sms-1',occurredAt:at()});}
   if(!smsPermission(d,r.phone).eligible){r.status='excluded';r.reason='opted_out';save();continue;}
   const c=d.sponsoredClaims.find(c=>c.id===r.claimId);
   if(!c||c.claimedAt||c.supersededAt||signature(c)!==r.signature){r.status='excluded';r.reason='claim_changed_or_completed';save();continue;}
   r.stage='group_assignment';r.status='submitting';save();
   await client.assignGroup({contactId:r.providerContactId,groupId:group.providerGroupId});
   const contact=d.sms.contacts.find(c=>c.id===r.contactId);contact.groupIds=[...new Set([...(contact.groupIds||[]),group.id])];
   const priorEmail=c.verificationEmail,referral=c.discipleId,quantity=c.quantity;
   const refreshed=refreshVerification(d,c.id,{actorId:'owner-authorized-claim-recovery',now});
   c.verificationEmail=priorEmail; // No email was sent by this SMS recovery operation.
   if(c.discipleId!==referral||c.quantity!==quantity)throw Error('Claim attribution changed.');
   const text='KVN: Claim your comp pass within 48h: https://kvnlive.com/promo#verify='+refreshed.verificationToken+' Reply STOP to opt out.';
   if(text.length>160)throw Error('Recovery text exceeds reseller SMS limit.');
   const attempt={id:crypto.randomUUID(),campaignId:campaign.id,scopeId:'kvn',phone:r.phone,sourceIds:['sponsoredClaims:'+c.id],consentId:smsPermission(d,r.phone).event.id,...identity,status:'submitting',createdAt:at(),submittedAt:at(),updatedAt:at(),units:1,deliveryText:text,claimId:c.id,discipleId:c.discipleId};
   d.sms.attempts.push(attempt);r.attemptId=attempt.id;r.stage='send';c.smsRecovery={runId,attemptId:attempt.id,status:'submitting',expiresAt:c.expiresAt};save();
   try{await client.sendMessage({to:r.phone,body:text});r.status='accepted';attempt.status='accepted';attempt.reason='Comp claim recovery; referral: '+r.referral+'. Provider accepted; delivery unconfirmed.';c.smsRecovery.status='accepted';}
   catch(e){r.status=e.outcome==='rejected'?'failed':'needs_review';attempt.status=r.status;attempt.providerCode=e.providerCode||null;attempt.reason=r.status==='failed'?'Provider rejected recovery text.':'Unknown recovery outcome; do not retry.';c.smsRecovery.status=r.status;throw e;}
   attempt.updatedAt=at();r.acceptedAt=at();save();
  }
  campaign.status='complete';run.status='complete';run.finishedAt=at();save();
 }catch(e){
  for(const r of run.recipients)if(r.status==='submitting')r.status=e.outcome==='rejected'?'failed':'needs_review';
  run.status='blocked';run.providerCode=e.providerCode||null;run.finishedAt=at();const c=d.sms.campaigns.find(c=>c.id===run.campaignId);if(c)c.status='paused';save();
 }
 const result=summary(run);d.sms.audit.push({kind:'comp_claim_sms_recovery',actor:'owner-authorized-claim-recovery',at:at(),runId,summary:result});save();return result;
}
