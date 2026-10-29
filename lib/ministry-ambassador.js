import { receiveDiscipleApplication } from './disciple-intake.js';
import { normalizeDiscipleApplication } from './disciple-application.js';
import { approveDiscipleApplication, resendDiscipleWelcome } from './disciple-operations.js';

// Only this server-owned, recipient-specific invitation can authorize automatic approval.
export const ministryOffers = {'cmp-lanier-20261121': {email:'belanier08@gmail.com',expiresAt:'2026-11-22T05:00:00Z'}};
const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode});};
export async function enrollMinistryAmbassador(store, payload, evidence, deps) {
 const now=deps.now?.()||new Date().toISOString();
 const offer=ministryOffers[payload.offerId];
 if(!offer||Date.parse(offer.expiresAt)<=Date.parse(now))fail('This ministry invitation is unavailable.',404);
 if(String(payload.application?.email||'').trim().toLowerCase()!==offer.email)fail('Use the email associated with this invitation.',403);
 const appEvidence={...evidence,idempotencyKey:payload.offerId,sourceSystem:'kvnlive-ministry-invitation',acceptedAt:now};
 // Validate even on retry; never allow an unsigned request to retrieve an existing registration.
 normalizeDiscipleApplication(payload.application,appEvidence);
 const ministryName=String(payload.ministryName||'').trim();
 if(!ministryName||ministryName.length>180||/[<>]/.test(ministryName))fail('Enter your ministry name.');
 if(!['ministry','acts244'].includes(payload.earningsDestination)||payload.destinationConsent!==true)fail('Choose and authorize the recipient of eligible earnings.');
 const prior=(store.discipleApplications||[]).find(a=>a.idempotencyKey===payload.offerId&&a.sourceSystem===appEvidence.sourceSystem);
 if(!prior && ((store.disciples||[]).some(d=>String(d.email||'').toLowerCase()===offer.email)||(store.discipleApplications||[]).some(a=>String(a.email||'').toLowerCase()===offer.email&&['approved','submitted','needs_info','resubmitted'].includes(a.status))))fail('A Disciple record already exists for this email. Contact info@kvnlive.com so we can connect your ministry invitation to that record.',409);
 const {application}=receiveDiscipleApplication(store,payload.application,appEvidence,deps);
 if(!prior){
  application.ministryInvitationId=payload.offerId;
  application.ministryName=ministryName;
  application.earningsDestination=payload.earningsDestination;
  application.earningsRecipient=payload.earningsDestination==='acts244'?'Acts 2:44':ministryName;
  application.destinationAuthorizedAt=now;
  application.destinationAuthorizedBy=application.typedLegalName;
  application.payoutNotes=`Ministry ambassador: direct eligible earnings to ${application.earningsRecipient}. Authorization ${now}; verify recipient payment details securely before payout. No bank or tax identifiers collected in this form.`;
  deps.persist(store);
 }
 const actor={id:'ministry-invitation',name:'Preapproved private ministry invitation'};
 let result=await approveDiscipleApplication(store,{applicationId:application.id,actor},deps);
 if(!result.created&&result.welcomeEmail?.status!=='sent'){
  const latest=deps.reload?.()||store;
  try{const retry=await resendDiscipleWelcome(latest,{discipleId:result.disciple.id,actor},deps);result={...result,...retry};}
  catch(error){if(error.statusCode!==409)throw error;}
 }
 return {ok:true,applicationReference:application.applicationReference,trackingUrl:result.trackingUrl,welcomeEmailStatus:result.welcomeEmail?.status||'pending',earningsRecipient:result.disciple.earningsRecipient,alreadyRegistered:Boolean(prior)};
}
