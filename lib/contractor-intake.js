import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {get, fail, digest} from './performance-agreements.js';

const api='/api/contractor-intake';
const origin='https://kvn-live-tickets.onrender.com';
const allowed=new Set([origin,'https://kvnlive.com','https://www.kvnlive.com']);
export const authorization='I authorize Kingdom Vibe, Inc. to credit the account provided for payments due under this agreement. I confirm I am authorized to use this account.';
const time=()=>new Date().toISOString();
const keyName='KV_CONTRACTOR_VAULT_KEY_V1';
function key(env){const k=Buffer.from(env[keyName]||'','base64');if(k.length!==32)throw fail('Encrypted intake is unavailable.',503);return k}
export function seal(value,k,id){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',k,iv);cipher.setAAD(Buffer.from(id));const bytes=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return {version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:bytes.toString('base64')}}
export function unseal(v,k,id){const cipher=crypto.createDecipheriv('aes-256-gcm',k,Buffer.from(v.iv,'base64'));cipher.setAAD(Buffer.from(id));cipher.setAuthTag(Buffer.from(v.tag,'base64'));return JSON.parse(Buffer.concat([cipher.update(Buffer.from(v.data,'base64')),cipher.final()]).toString())}
function payees(d){return [...d.agreements,...(d.financeVendors||[])]}
function getPayee(d,id){return d.financeVendors?.find(v=>v.id===id)||get(d,id)}
function basis(a){return a.vendorApproval?.hash||a.acceptance?.hash}
function signed(a){if(a.vendorApproval?.actor && !a.revokedAt && a.vendorApproval.email===a.email)return a;
if(!a.acceptance||a.revokedAt||!a.email||a.acceptance.email.toLowerCase()!==a.email.toLowerCase())throw fail('A signed agreement with a matching payee email is required.',409);return a}
function findPayee(d,t){if(typeof t!=='string'||!/^[a-f0-9]{64}$/.test(t))throw fail('Invalid or expired setup link.',403);const a=payees(d).find(a=>a.intake?.tokenHash===digest(t));if(!a||a.intake.expires<=Date.now()||a.intake.hash!==basis(a))throw fail('Invalid or expired setup link.',403);return signed(a)}
export function validate(p){
 const routing=String(p.routing||''),acct=String(p.account||'');
 if(!/^\d{9}$/.test(routing)||/^0+$/.test(routing)||[...routing].reduce((n,v,i)=>n+Number(v)*[3,7,1][i%3],0)%10!==0)throw fail('Check the nine-digit ABA routing number.');
 if(!/^\d{4,17}$/.test(acct)||acct!==p.confirmAccount||!['Checking','Savings'].includes(p.type))throw fail('Check account type and enter matching account numbers.');
 for(const field of ['holder','signature'])if(typeof p[field]!=='string'||!p[field].trim()||p[field].length>150)throw fail('Enter the account holder and your full name.');
 if(p.usPerson!==true||p.consent!==true||p.completedW9!==true)throw fail('Confirm the W-9 and direct deposit authorization.');
 if(typeof p.pdf!=='string'||p.pdf.length>1750000||!/^[A-Za-z0-9+/]+=*$/.test(p.pdf))throw fail('Upload a completed W-9 PDF up to 1.25 MiB.');
 const pdf=Buffer.from(p.pdf,'base64');if(pdf.length>1310720||pdf.subarray(0,5).toString()!=='%PDF-'||!pdf.subarray(-1024).includes(Buffer.from('%%EOF')))throw fail('Upload a complete W-9 PDF.');
 return {routing,account:acct,type:p.type,holder:p.holder.trim(),signature:p.signature.trim(),pdf:p.pdf,authorization,submittedAt:time(),form:'Payee-supplied signed W-9'};
}
export function registerContractorIntake(app,{auth,owner,store,dir,env=process.env,send}){
 const vault=path.join(dir,'contractor-vault-v1');
 app.get(api+'/ready',(q,s)=>{s.set('Cache-Control','no-store');try{key(env);if(!env.OWNER_EMAIL||!env.RESEND_API_KEY)throw Error();s.json({ready:true})}catch{s.status(503).json({ready:false})}});
 const challenges=new Map(),sessions=new Map();
 function prune(map){for(const [k,v] of map)if(v.expires<=Date.now())map.delete(k)}
 function route(url,admin,fn){app.post((admin?'/api/performance-agreements/finance':api)+url,...(admin?[auth,owner]:[]),async(q,s)=>{s.set({'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});try{
 if(!allowed.has(q.headers.origin)||q.headers['sec-fetch-site']==='cross-site'||!q.is('application/json'))throw fail('Open the portal directly.',403);
 key(env);await fn(q,s);
 }catch(e){s.status(e.statusCode||500).json({error:e.statusCode?e.message:'Operation unavailable. Please try again.'})}})}
 async function mailCode(id,to,subject){prune(challenges);const prior=challenges.get(id);if(prior&&Date.now()-prior.sent<60000)throw fail('Please wait one minute before requesting another code.',429);
 const code=String(crypto.randomInt(10000000,100000000));const c={hash:digest(code),sent:Date.now(),expires:Date.now()+600000,tries:0};challenges.set(id,c);
 const result=await send({to,subject,text:'Your one-time KV Live verification code is '+code+'. It expires in ten minutes.',key:crypto.randomUUID()});if(result.status!=='accepted')throw fail('Verification email could not be confirmed.',503)}
 function verify(id,code){prune(challenges);const c=challenges.get(id);if(!c||++c.tries>5||!crypto.timingSafeEqual(Buffer.from(c.hash),Buffer.from(digest(String(code)))))throw fail('Invalid or expired verification code.',403);challenges.delete(id)}
 const finance=q=>'finance:'+digest(q.sessionToken)+':'+q.body.id;
 const state=a=>a.intake?.submittedAt?'Received for finance review':a.intake?.review?'Tax review requested':a.intake?.expires>Date.now()?'Setup link active':'Awaiting setup';
 const vendorSummary=({id,name,email,eventKey,amount})=>({id,name,email,eventKey,amount});
 route('/report-settings',true,(q,s)=>{
  s.json({enabled:store.read().depositReportsEnabled===true});
 });
 route('/set-report-enabled',true,(q,s)=>{
  const {enabled}=q.body;
  if(typeof enabled!=='boolean')throw fail('Choose a report setting.');
  store.mutate(d=>{d.depositReportsEnabled=enabled});
  s.json({enabled});
 });
 route('/deposit-report',true,(q,s)=>{
  const d=store.read();
  if(!d.depositReportsEnabled)throw fail('Activate deposit reports first.',409);
  const rows=payees(d).filter(a=>a.intake?.submittedAt).map(a=>({
   ...vendorSummary(a),source:a.vendorApproval?'Vendor':'Agreement',
   submittedAt:a.intake.submittedAt,available:!!a.intake.record&&!a.revokedAt
  })).sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt));
  s.json({rows,generatedAt:time()});
 });
 route('/vendors',true,(q,s)=>s.json((store.read().financeVendors||[]).map(vendorSummary)));
 route('/approve-vendor',true,(q,s)=>{
  const field=(key,max)=>{const v=q.body[key];if(typeof v!=='string'||!v.trim()||v.length>max)throw fail('Invalid vendor '+key);return v.trim()};
  const name=field('name',150),email=field('email',254).toLowerCase(),eventKey=field('eventKey',100),amount=field('amount',12),reason=field('reason',500);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^\d+(?:\.\d{1,2})?$/.test(amount)||Number(amount)<=0)throw fail('Check the vendor email and honorarium.');
  const record=store.mutate(d=>{
   if(payees(d).some(a=>a.email?.toLowerCase()===email&&a.eventKey===eventKey&&!a.revokedAt))throw fail('A payee already exists for this email and event.',409);
   const id=crypto.randomUUID(),at=time(),actor=q.user.id;
   const v={id,name,email,eventKey,amount,vendorApproval:{email,actor,at,reason,hash:digest(JSON.stringify([id,name,email,eventKey,amount,reason,actor,at]))}};
   (d.financeVendors??=[]).push(v);return vendorSummary(v);
  });s.json(record);
 });
 route('/status',true,(q,s)=>{const a=signed(getPayee(store.read(),q.body.id));s.json({status:state(a),received:!!a.intake?.submittedAt,at:a.intake?.submittedAt})});
 route('/invite',true,(q,s)=>{if(!env.RESEND_API_KEY||!env.OWNER_EMAIL)throw fail('Finance email verification is not configured.',503);const token=crypto.randomBytes(32).toString('hex');store.mutate(d=>{const a=signed(getPayee(d,q.body.id));if(a.intake?.submittedAt)throw fail('Instructions already received.',409);a.intake={tokenHash:digest(token),hash:basis(a),expires:Date.now()+7*86400000,issuedBy:q.user.id,issuedAt:time()}});s.json({url:origin+'/contractor-payment.html#'+token})});
 route('/code',false,async(q,s)=>{const a=findPayee(store.read(),q.body.token);await mailCode(a.intake.tokenHash,a.email,'KV Live contractor payment setup code');s.json({ok:true})});
 route('/verify',false,(q,s)=>{const a=findPayee(store.read(),q.body.token);verify(a.intake.tokenHash,q.body.code);prune(sessions);const token=crypto.randomBytes(32).toString('hex');sessions.set(digest(token),{id:a.id,invite:a.intake.tokenHash,expires:Date.now()+20*60000});s.json({session:token,name:a.name,event:a.eventKey,authorization})});
 function session(q,d){prune(sessions);const v=sessions.get(digest(String(q.body.session)));if(!v)throw fail('Verify your email again.',403);const a=signed(getPayee(d,v.id));if(a.intake?.tokenHash!==v.invite||a.intake.expires<=Date.now()||a.intake.hash!==basis(a))throw fail('Request a fresh setup link.',403);return a}
 route('/review',false,(q,s)=>{store.mutate(d=>{const a=session(q,d);a.intake.review=time();delete a.intake.tokenHash});s.json({ok:true})});
 route('/submit',false,(q,s)=>{const a=session(q,store.read()),data=validate(q.body);const record=crypto.randomUUID();const file=path.join(vault,record+'.json');
 fs.mkdirSync(vault,{recursive:true,mode:0o700});fs.writeFileSync(file,JSON.stringify(seal({...data,id:a.id,agreementHash:basis(a),email:a.email},key(env),a.id)),{flag:'wx',mode:0o600});
 try{store.mutate(d=>{const a=session(q,d);Object.assign(a.intake,{record,submittedAt:data.submittedAt});delete a.intake.tokenHash})}catch(e){fs.unlinkSync(file);throw e}
 sessions.delete(digest(String(q.body.session)));s.json({ok:true})});
 route('/finance-code',true,async(q,s)=>{const a=signed(getPayee(store.read(),q.body.id));if(!a.intake?.record)throw fail('No submission available.',404);if(!env.OWNER_EMAIL)throw fail('Finance verification email is not configured.',503);await mailCode(finance(q),env.OWNER_EMAIL,'KV Live finance access code');s.json({ok:true})});
 route('/read',true,(q,s)=>{const a=signed(getPayee(store.read(),q.body.id));verify(finance(q),q.body.code);if(!a.intake?.record)throw fail('No submission available.',404);const value=unseal(JSON.parse(fs.readFileSync(path.join(vault,a.intake.record+'.json'),'utf8')),key(env),a.id);store.mutate(d=>{const x=getPayee(d,a.id);x.intake.accessHistory??=[];x.intake.accessHistory.push({at:time(),actor:q.user.id})});s.json(value)});
}
