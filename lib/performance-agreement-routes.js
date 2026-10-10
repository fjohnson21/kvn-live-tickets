import crypto from 'node:crypto';
import {createDraft,reviseDraft,approve,issue,identify,createCode,accept,reconcile,latest,get,summary,stamp,fail,CONSENT} from './performance-agreements.js';
const root='/api/performance-agreements';
async function jsonFetch(url,options){const r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw fail('Remote service did not return a successful response.',502);const raw=await r.text();if(raw.length>5e6)throw fail('Remote response too large.',502);return JSON.parse(raw)}
export async function sendAgreementMail(payload,env=process.env,fetchImpl=fetch){
 if(!env.RESEND_API_KEY)return {status:'failed',error:'Email provider is not configured.'};
 try{const r=await fetchImpl('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':payload.key},body:JSON.stringify({from:env.PERFORMANCE_AGREEMENT_FROM||'KV Production Team <info@tickets.kvnlive.com>',to:[payload.to],subject:payload.subject,text:payload.text})});const data=await r.json().catch(()=>({}));if(r.ok&&data.id)return {status:'accepted',messageId:data.id};return {status:r.status>=500||r.status===408||r.status===429||r.ok?'unknown':'failed',error:`Provider response ${r.status}. Review before retrying.`}}catch{return {status:'unknown',error:'Provider result unknown. Check the email provider before taking further action.'}}
}
export function registerPerformanceAgreementRoutes(app,{store,auth,owner,baseUrl,env=process.env,send=p=>sendAgreementMail(p,env),sourceLookup,providerLookup}){
 const origin=new URL(baseUrl).origin;
 const sourceIds=()=>{try{const ids=JSON.parse(env.AGREEMENT_SOURCE_IDS||'[]');return Array.isArray(ids)&&ids.length===7&&new Set(ids).size===7&&ids.every(id=>typeof id==='string'&&id.length>0&&id.length<=100)?ids:[]}catch{return []}};
 const configured=()=>!!(env.AGREEMENT_SOURCE_URL&&env.AGREEMENT_SYNC_SECRET&&sourceIds().length===7);
 const enabled=()=>env.PERFORMANCE_AGREEMENTS_ENABLED==='true'&&!!env.RESEND_API_KEY;
 const fresh=d=>{if(!configured()||!d.sync?.at||d.sync.healthy!==true||d.sync.origin!==new URL(env.AGREEMENT_SOURCE_URL).origin||Date.now()-Date.parse(d.sync.at)>5*60000)throw fail('Refresh existing agreement status before issuing a new request.',409)};
 const safe=fn=>async(q,s)=>{s.set({'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});try{await fn(q,s)}catch(e){s.status(e.statusCode||500).json({error:e.statusCode?e.message:'Agreement operation failed. Reload status before retrying.'})}};
 const sameOrigin=(q,s,n)=>{if(q.headers.origin!==origin||q.headers['sec-fetch-site']==='cross-site')return s.status(403).json({error:'Open this page directly to continue.'});n()};
 const adminGet=(url,fn)=>app.get(root+url,auth,owner,safe(fn));
 const adminPost=(url,fn)=>app.post(root+url,auth,owner,sameOrigin,safe(fn));
 const limited=new Map();
 const limit=(q,s,n)=>{const now=Date.now();for(const [key,v]of limited)if(v.until<now)limited.delete(key);const key=q.ip||q.socket.remoteAddress;let v=limited.get(key);if(!v){if(limited.size>=10000)return s.sendStatus(429);v={count:0,until:now+60000};limited.set(key,v)}if(++v.count>60)return s.status(429).json({error:'Too many requests. Please wait a minute.'});n()};
 const publicPost=(url,fn)=>app.post(root+'/public/'+url,sameOrigin,limit,safe(fn));
 const publicRecord=a=>({name:a.name,email:a.email,eventKey:a.eventKey,text:latest(a).text,hash:latest(a).hash,version:latest(a).number,expiresAt:a.expiresAt,acceptance:a.acceptance,consent:CONSENT});
 adminGet('',(q,s)=>{const d=store.read();s.json({agreements:d.agreements.map(summary),sync:d.sync,sourceConfigured:configured(),issuanceEnabled:enabled()})});
 adminGet('/:id',(q,s)=>{const a=get(store.read(),q.params.id);s.json({...summary(a),versions:a.versions,approval:a.approval,acceptance:a.acceptance,verificationAttempts:a.verificationAttempts||[]})});
 adminGet('/:id/evidence',(q,s)=>{const a=get(store.read(),q.params.id);s.set('Content-Disposition',`attachment; filename="agreement-${a.id}.json"`).json({...summary(a),versions:a.versions,approval:a.approval,acceptance:a.acceptance,verificationAttempts:a.verificationAttempts||[],exportedAt:stamp()})});
 adminPost('',(q,s)=>s.status(201).json(store.mutate(d=>{fresh(d);return summary(createDraft(d,q.body,q.user.id))})));
 adminPost('/:id/revise',(q,s)=>s.json(store.mutate(d=>summary(reviseDraft(get(d,q.params.id),q.body.text,q.user.id)))));
 adminPost('/:id/approve',(q,s)=>{if(q.body.confirm!==true)throw fail('Confirm the exact content and recipient before approval.');s.json(store.mutate(d=>summary(approve(get(d,q.params.id),q.body.hash,q.user.id))))});
 adminPost('/:id/revoke',(q,s)=>{if(q.body.confirm!==true)throw fail('Confirmation required.');s.json(store.mutate(d=>{const a=get(d,q.params.id);if(a.source==='external'||a.acceptance)throw fail('External or accepted agreements cannot be revoked here.',409);a.revokedAt=stamp();a.revokedBy=q.user.id;delete a.code;return summary(a)}))});
 adminPost('/:id/send',async(q,s)=>{
  if(!enabled())throw fail('New agreement delivery is disabled or email is not configured.',503);
  if(q.body.confirm!==true)throw fail('Confirm this agreement before issuing.');
  const prepared=store.mutate(d=>{fresh(d);const a=get(d,q.params.id),prior=a.attempts.at(-1);if(d.agreements.some(other=>other.id!==a.id&&!other.revokedAt&&other.eventKey===a.eventKey&&other.email===a.email))throw fail('Duplicate agreement detected. Resolve it before issuance.',409);if(prior&&(prior.status!=='failed'||q.body.retry!==true))throw fail('A delivery attempt already exists. Review its status; no duplicate request was sent.',409);const token=issue(a,q.body.hash),attempt={id:crypto.randomUUID(),at:stamp(),status:'unknown',actor:q.user.id};a.attempts.push(attempt);return {to:a.email,name:a.name,attemptId:attempt.id,token}});
  let result;try{result=await send({to:prepared.to,subject:'KV Production Team — Review your performance agreement',text:`Hello ${prepared.name},\n\nReview your individual performance agreement and confirm your identity to accept:\n${origin}/performance-agreement.html#token=${prepared.token}\n\nThis private link expires in 30 days. Please do not forward it.\n\nKV Production Team`,key:`performance-agreement:${prepared.attemptId}`})}catch{result={status:'unknown'}}
  const record=store.mutate(d=>{const a=get(d,q.params.id),attempt=a.attempts.find(x=>x.id===prepared.attemptId);Object.assign(attempt,result);return summary(a)});s.status(result.status==='accepted'?200:502).json(record);
 });
 const loadSource=sourceLookup||(()=>{const url=new URL(env.AGREEMENT_SOURCE_URL);if(url.protocol!=='https:'||url.username||url.password)throw fail('Invalid agreement source configuration.',503);return jsonFetch(new URL('/api/command-center',url),{headers:{Authorization:`Bearer ${env.AGREEMENT_SYNC_SECRET}`}})});
 adminPost('/sync',async(q,s)=>{if(!configured())throw fail('Existing agreement connection is not configured.',503);try{const snapshot=await loadSource();if(!Array.isArray(snapshot?.contracts)||snapshot.contracts.length!==sourceIds().length||!sourceIds().every(id=>snapshot.contracts.some(c=>c.id===id)))throw fail('Incomplete existing agreement snapshot. All seven original records are required.',502);s.json(store.mutate(d=>reconcile(d,snapshot,new URL(env.AGREEMENT_SOURCE_URL).origin)))}catch(error){store.mutate(d=>{d.sync={...d.sync,healthy:false,errorAt:stamp(),error:'Existing agreement refresh failed. Issuance is blocked until a successful refresh.'}});throw error}});
 const lookup=providerLookup||(id=>jsonFetch(`https://api.resend.com/emails/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`}}));
 adminPost('/:id/refresh',async(q,s)=>{
  const a=get(store.read(),q.params.id);for(const attempt of a.attempts.filter(x=>x.messageId)){
   const value=await lookup(attempt.messageId);if(value.id!==attempt.messageId)throw fail('Email provider message mismatch.',502);
   if(value.to&&(!Array.isArray(value.to)||!value.to.some(v=>String(v).toLowerCase()===a.email)))throw fail('Email provider recipient mismatch.',502);
   const event=String(value.last_event||'').replace(/^email\./,'');if(!['sent','delivered','delivery_delayed','bounced','complained','opened','clicked','failed','suppressed','canceled','queued','scheduled'].includes(event))continue;
   store.mutate(d=>{const current=get(d,a.id).attempts.find(x=>x.id===attempt.id);current.providerEvents??={};current.providerEvents[event]??={observedAt:stamp(),source:'resend-last-event'};current.providerCheckedAt=stamp()});
  }s.json(summary(get(store.read(),a.id)));
 });
 publicPost('open',(q,s)=>s.json(store.mutate(d=>{const a=identify(d,q.body.token);a.views.count++;a.views.firstAt??=stamp();a.views.lastAt=stamp();return publicRecord(a)})));
 publicPost('code',async(q,s)=>{
  if(!env.RESEND_API_KEY)throw fail('Email verification is unavailable.',503);
  const prepared=store.mutate(d=>{const a=identify(d,q.body.token),code=createCode(a),id=crypto.randomUUID();a.verificationAttempts??=[];a.verificationAttempts.push({id,at:stamp(),status:'unknown'});return {agreementId:a.id,to:a.email,code,id}});
  let result;try{result=await send({to:prepared.to,subject:'KV Production Team — Verification code',text:`Your verification code is ${prepared.code}. It expires in 10 minutes. Do not share this code.`,key:`performance-code:${prepared.id}`})}catch{result={status:'unknown'}}
  store.mutate(d=>{const a=get(d,prepared.agreementId),attempt=a.verificationAttempts.find(x=>x.id===prepared.id);Object.assign(attempt,result)});
  s.status(result.status==='accepted'?200:502).json({status:result.status,message:result.status==='accepted'?'Verification email accepted by provider. Check your inbox.':'Verification email status uncertain or failed. Wait one minute before requesting another code.'});
 });
 publicPost('accept',(q,s)=>{
  // Commit failed-code counters too; never roll these back on validation errors.
  const result=store.mutate(d=>{const a=identify(d,q.body.token);try{return {acceptance:accept(a,q.body,q.headers['user-agent'])}}catch(e){return {error:e.message,status:e.statusCode||400}}});
  if(result.error)throw fail(result.error,result.status);s.json(result);
 });
}
