import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
export const digest=value=>crypto.createHash('sha256').update(value,'utf8').digest('hex');
export const stamp=(now=Date.now())=>new Date(now).toISOString();
export const fail=(message,statusCode=400)=>Object.assign(new Error(message),{statusCode});
const equal=(a,b)=>crypto.timingSafeEqual(Buffer.from(digest(String(a))),Buffer.from(digest(String(b))));
const cleanName=value=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase();
const legacyName=value=>cleanName(String(value||'').replace(/\./g,''));
const evidenceKey=e=>JSON.stringify(Object.keys(e).sort().map(k=>[k,e[k]]));
const email=value=>String(value||'').trim().toLowerCase();
const bounded=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw fail(`Invalid ${label}.`);return value};
export function createAgreementStore(dir){
 fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'performance-agreements.json');
 const read=()=>{try{const d=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(d.agreements))throw Error('Invalid agreement store');return d}catch(e){if(e.code==='ENOENT')return {agreements:[],sync:null};throw e}};
 return {read,mutate(fn){const d=read(),result=fn(d);if(result?.then)throw Error('Agreement transaction must be synchronous');const tmp=`${file}.${crypto.randomUUID()}.tmp`;try{fs.writeFileSync(tmp,JSON.stringify(d),{mode:0o600,flag:'wx'});fs.renameSync(tmp,file)}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}return result}};
}
export function latest(a){return a.versions.at(-1)}
export function get(d,id){const a=d.agreements.find(a=>a.id===id);if(!a)throw fail('Agreement not found.',404);return a}
function nativeUnsigned(a){if(a.source==='external')throw fail('External agreement: use its existing signing site.',409);if(a.acceptance)throw fail('An accepted agreement is immutable.',409)}
function version(a,text,actor){return {number:a.versions.length+1,text:bounded(text,50000,'agreement text'),hash:digest(text),createdAt:stamp(),createdBy:actor}}
export function createDraft(d,p,actor){
 const name=bounded(p.name,150,'recipient name').trim(),recipient=email(bounded(p.email,254,'recipient email')),eventKey=bounded(p.eventKey,100,'event reference').trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))throw fail('Invalid recipient email.');
 if(d.agreements.some(a=>a.email===recipient&&a.eventKey===eventKey&&!a.revokedAt))throw fail('An existing agreement already covers this recipient and event.',409);
 const a={id:crypto.randomUUID(),source:'native',eventKey,name,email:recipient,createdAt:stamp(),createdBy:actor,versions:[],approval:null,attempts:[],views:{count:0,firstAt:null,lastAt:null},acceptance:null};a.versions.push(version(a,p.text,actor));d.agreements.push(a);return a;
}
export function reviseDraft(a,text,actor){nativeUnsigned(a);if(a.revokedAt)throw fail('Agreement revoked.',409);if(a.attempts.length)throw fail('Issued agreements cannot be edited. Revoke and create a replacement for review.',409);a.versions.push(version(a,text,actor));a.approval=null;return a}
export function approve(a,hash,actor){nativeUnsigned(a);if(a.revokedAt)throw fail('Agreement revoked.',409);if(hash!==latest(a).hash)throw fail('Agreement changed; review the current version.',409);a.approval={hash,recipientDigest:digest(a.name+'\n'+a.email+'\n'+a.eventKey),approvedAt:stamp(),approvedBy:actor};return a}
export function issue(a,hash,now=Date.now()){
 nativeUnsigned(a);if(a.revokedAt)throw fail('Agreement revoked.',409);
 if(!a.approval||a.approval.hash!==hash||latest(a).hash!==hash||a.approval.recipientDigest!==digest(a.name+'\n'+a.email+'\n'+a.eventKey))throw fail('Approval of the exact content and recipient is required.',409);
 const token=crypto.randomBytes(32).toString('base64url');a.tokenHash=digest(token);a.expiresAt=stamp(now+30*86400000);delete a.code;return token;
}
export function identify(d,token,now=Date.now()){
 if(typeof token!=='string'||!/^[\w-]{43}$/.test(token))throw fail('Invalid or expired agreement link.',404);
 const hash=digest(token),a=d.agreements.find(a=>a.source==='native'&&a.tokenHash&&equal(a.tokenHash,hash));
 if(!a||a.revokedAt||Date.parse(a.expiresAt)<=now)throw fail('Invalid or expired agreement link.',404);return a;
}
export function createCode(a,now=Date.now()){
 if(a.acceptance)throw fail('Agreement already accepted.',409);
 if(a.code&&now-Date.parse(a.code.createdAt)<60000)throw fail('Please wait one minute before requesting another code.',429);
 const today=stamp(now).slice(0,10);a.codeRequests??={day:today,count:0};if(a.codeRequests.day!==today)a.codeRequests={day:today,count:0};
 if(a.codeRequests.count>=10)throw fail('Daily verification limit reached. Contact KV Production Team.',429);a.codeRequests.count++;
 const code=String(crypto.randomInt(1000000)).padStart(6,'0');a.code={hash:digest(a.tokenHash+':'+code),createdAt:stamp(now),expiresAt:stamp(now+10*60000),attempts:0};return code;
}
export const CONSENT='I have read and agree to this agreement, consent to electronic records and signatures, and intend my typed name to serve as my electronic signature.';
export function accept(a,p,userAgent,now=Date.now()){
 if(a.acceptance)return a.acceptance;
 if(a.revokedAt||Date.parse(a.expiresAt)<=now)throw fail('Invalid or expired agreement link.',404);
 const v=latest(a);if(p.hash!==v.hash)throw fail('Agreement changed. Reload and review before accepting.',409);
 if(p.agreed!==true||cleanName(p.fullName)!==cleanName(a.name)||email(p.email)!==a.email)throw fail('Confirm the recipient identity and electronic consent.');
 if(!a.code||a.code.attempts>=5||Date.parse(a.code.expiresAt)<=now)throw fail('Verification code expired or locked. Request a new code.');
 a.code.attempts++;if(typeof p.code!=='string'||!/^\d{6}$/.test(p.code)||!equal(a.code.hash,digest(a.tokenHash+':'+p.code)))throw fail('Incorrect verification code.');
 a.acceptance={fullName:String(p.fullName).trim(),email:a.email,acceptedAt:stamp(now),version:v.number,text:v.text,hash:v.hash,userAgent:String(userAgent||'').slice(0,512),consent:CONSENT,identityMethod:'email_code_and_typed_name',verifiedAt:stamp(now)};delete a.code;return a.acceptance;
}
export function summary(a){return {id:a.id,source:a.source,externalId:a.externalId,eventKey:a.eventKey,name:a.name,email:a.email,version:latest(a).number,hash:latest(a).hash,approved:!!a.approval,revokedAt:a.revokedAt,expiresAt:a.expiresAt,acceptedAt:a.acceptance?.acceptedAt||null,views:a.views,attempts:a.attempts.map(({id,at,status,messageId,providerEvents,error})=>({id,at,status,messageId,providerEvents,error})),syncedAt:a.syncedAt}}
export function reconcile(d,payload,origin){
 if(!Array.isArray(payload?.contracts)||payload.contracts.length===0||payload.contracts.length>500)throw fail('Invalid external agreement snapshot.',502);
 const ids=new Set();const incoming=payload.contracts.map(c=>{
  bounded(c.id,100,'external ID');if(ids.has(c.id))throw fail('Duplicate external IDs.',502);ids.add(c.id);
  bounded(c.name,150,'name');bounded(c.email,254,'email');bounded(c.eventKey,100,'event reference');bounded(c.text,50000,'text');
  if(c.hash!==digest(c.text))throw fail('External document hash mismatch.',502);
  if(c.acceptance){const e=c.acceptance;if(e.identityMethod!=='private_link_and_typed_name')throw fail('Invalid legacy identity evidence.',502);if(e.hash!==digest(e.text)||e.hash!==c.hash||email(e.email)!==email(c.email)||legacyName(e.fullName)!==legacyName(c.name)||!Number.isFinite(Date.parse(e.acceptedAt)))throw fail('External acceptance evidence is invalid.',502)}
  if(c.views!==null&&(!Number.isSafeInteger(c.views?.count)||c.views.count<0||!c.views.trackingSince))throw fail('Invalid view evidence.',502);
  if(c.delivery&&(!/^[a-f0-9-]{36}$/i.test(c.delivery.messageId)||!Number.isFinite(Date.parse(c.delivery.at))))throw fail('Invalid delivery reference.',502);
  return {...c,email:email(c.email)};
 });
 for(const old of d.agreements.filter(a=>a.source==='external'&&a.origin===origin)){
  const c=incoming.find(c=>c.id===old.externalId);
  if(!c)throw fail('External agreement missing from snapshot; retained records unchanged.',502);
  if(old.acceptance&&(!c.acceptance||c.acceptance.hash!==old.acceptance.hash||c.acceptance.acceptedAt!==old.acceptance.acceptedAt||c.acceptance.fullName!==old.acceptance.fullName||c.acceptance.email!==old.acceptance.email||evidenceKey(c.acceptance)!==evidenceKey(old.acceptance)))throw fail('External acceptance evidence changed; retained records unchanged.',409);
 }
 for(const c of incoming)if(d.agreements.some(a=>a.source==='native'&&!a.revokedAt&&a.eventKey===c.eventKey&&a.email===c.email))throw fail('Existing signing-site record conflicts with a native agreement. Resolve the duplicate before issuance.',409);
 for(const c of incoming){let a=d.agreements.find(a=>a.source==='external'&&a.origin===origin&&a.externalId===c.id);if(!a){a={id:crypto.randomUUID(),source:'external',origin,externalId:c.id,versions:[],attempts:[],approval:null};d.agreements.push(a)}
  if(!a.versions.length||latest(a).hash!==c.hash)a.versions.push({number:c.version||a.versions.length+1,text:c.text,hash:c.hash,createdAt:stamp(),createdBy:'external-sync'});
  if(c.delivery&&!a.attempts.some(x=>x.messageId===c.delivery.messageId))a.attempts.push({id:crypto.randomUUID(),at:c.delivery.at,messageId:c.delivery.messageId,status:'accepted',source:'legacy-invitation'});
  Object.assign(a,{name:c.name,email:c.email,eventKey:c.eventKey,views:c.views,acceptance:a.acceptance||c.acceptance||null,syncedAt:stamp()});
 }
 d.sync={at:stamp(),origin,healthy:true,count:incoming.length};return d.sync;
}
