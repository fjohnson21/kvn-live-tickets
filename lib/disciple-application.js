import { DISCIPLE_AGREEMENT_TEXT, DISCIPLE_AGREEMENT_VERSION, agreementHash } from './disciple-agreement.js';

const executable=/<\s*\/?\s*(script|iframe|object|embed|svg|math)\b|javascript\s*:|on[a-z]+\s*=/i;
const clean=(value,name,{required=true,max=2000}={})=>{const text=String(value??'').trim().replace(/\s+/g,' ');if(required&&!text)throw new Error(`${name} is required.`);if(text.length>max)throw new Error(`${name} is too long.`);if(executable.test(text))throw new Error('Executable markup is not allowed.');return text;};
const social=(value,host)=>{const text=clean(value,host,{required:false,max:300});if(!text)return '';if(text.startsWith('@'))return `https://${host}.com/${text.slice(1)}`;if(/^https?:\/\//i.test(text))return text;return text;};
const phone=value=>{const raw=clean(value,'mobile',{max:24}),digits=raw.replace(/\D/g,'');if(digits.length===10)return `+1${digits}`;if(digits.length>=11&&digits.length<=15)return `+${digits}`;throw new Error('Enter a valid mobile number.');};

export function normalizeDiscipleApplication(payload={},evidence={},options={}){
  if(Buffer.byteLength(JSON.stringify(payload))>40000)throw new Error('Submission is too large.');
  const legalFirstName=clean(payload.legalFirstName,'legal first name',{max:80}),legalLastName=clean(payload.legalLastName,'legal last name',{max:80});
  const typedLegalName=clean(payload.typedLegalName,'typed legal name',{max:170});
  if(typedLegalName.toLowerCase()!==`${legalFirstName} ${legalLastName}`.toLowerCase())throw new Error('Typed legal name must match the legal name.');
  const email=clean(payload.email,'email',{max:200}).toLowerCase();if(!/^\S+@\S+\.\S+$/.test(email))throw new Error('Enter a valid email address.');
  if(![payload.weeklyPostCommitment,payload.agreementAccepted,payload.electronicRecordsConsent,payload.recordsAccessConfirmed].every(value=>value===true))throw new Error('All commitments must be accepted.');
  const legacyAgreement=options.allowLegacyAgreement===true&&payload.agreementVersion==='1.0';
  if(payload.agreementVersion!==DISCIPLE_AGREEMENT_VERSION&&!legacyAgreement)throw new Error('Agreement version 2.2 is required.');
  if(!legacyAgreement&&payload.agreementHash!==agreementHash(DISCIPLE_AGREEMENT_TEXT))throw new Error('Agreement hash does not match version 2.2.');
  if(legacyAgreement&&!/^[a-f0-9]{64}$/i.test(String(payload.agreementHash||'')))throw new Error('Legacy agreement hash is invalid.');
  const profiles={instagram:social(payload.instagram,'instagram'),facebook:social(payload.facebook,'facebook'),tiktok:social(payload.tiktok,'tiktok'),youtube:social(payload.youtube,'youtube'),otherSocial:social(payload.otherSocial,'social')};
  if(!Object.values(profiles).some(Boolean))throw new Error('At least one social profile is required.');
  return {legalFirstName,legalLastName,preferredName:clean(payload.preferredName,'preferred name',{max:80}),email,mobile:phone(payload.mobile),address1:clean(payload.address1,'address',{max:180}),city:clean(payload.city,'city',{max:100}),state:clean(payload.state,'state',{max:80}).toUpperCase(),postalCode:clean(payload.postalCode,'postal code',{max:20}),country:clean(payload.country,'country',{max:80}),shirtSize:clean(payload.shirtSize,'shirt size',{max:8}).toUpperCase(),market:clean(payload.market,'market',{max:120}),affiliation:clean(payload.affiliation,'affiliation',{required:false,max:180}),...profiles,audienceSize:Math.max(0,Number(payload.audienceSize)||0),motivation:clean(payload.motivation,'motivation'),promotionPlan:clean(payload.promotionPlan,'promotion plan'),referralSource:clean(payload.referralSource,'referral source',{required:false,max:180}),additionalNotes:clean(payload.additionalNotes,'additional notes',{required:false}),weeklyPostCommitment:true,agreementAccepted:true,electronicRecordsConsent:true,recordsAccessConfirmed:true,typedLegalName,agreementVersion:legacyAgreement?'1.0':DISCIPLE_AGREEMENT_VERSION,agreementHash:payload.agreementHash,agreementAcceptedAt:clean(evidence.acceptedAt,'accepted timestamp',{max:40}),idempotencyKey:clean(evidence.idempotencyKey,'idempotency key',{max:120}),sourceSystem:clean(evidence.sourceSystem,'source system',{max:80}),submissionIp:clean(evidence.ip,'submission IP',{max:64}),userAgent:clean(evidence.userAgent,'user agent',{required:false,max:500})};
}
