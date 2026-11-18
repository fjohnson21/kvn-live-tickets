import express from 'express';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createStore} from './store.js';
import {categories,topics,validateText,screenContent} from './policy.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const exact=(body,allowed)=>{if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>!allowed.includes(k)))throw fail(400,'Unexpected fields.');};
const safeKey=(a,b)=>typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function createSocialApp({memberKey,ownerKey,production=process.env.NODE_ENV==='production',sessionMs=60*60*1000,now=Date.now}={}){
 if(production)throw Error('This demo refuses production mode.');
 if(!memberKey||!ownerKey||memberKey.length<32||ownerKey.length<32)throw Error('Separate demo keys of at least 32 characters required.');
 if(memberKey===ownerKey)throw Error('Demo keys must be distinct.');
 const app=express(),store=createStore(),limits=new Map();
 app.disable('x-powered-by');app.set('trust proxy',false);
 function rate(key,max,windowMs=60000){
  const t=now();for(const [k,v]of limits)if(v.until<=t)limits.delete(k);
  const v=limits.get(key)||{count:0,until:t+windowMs};
  if(limits.size>=2000&&!limits.has(key))throw fail(503,'Pilot is busy. Try again later.');
  if(++v.count>max)throw fail(429,'Please slow down and try again in a minute.');limits.set(key,v);
 }
 app.use((req,res,next)=>{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'Permissions-Policy':'camera=(), microphone=(), geolocation=()'});next();});
 // Loopback hosts only: prevents DNS rebinding even when running on a developer laptop.
 app.use((req,res,next)=>{if(!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(req.headers.host||''))return next(fail(403,'Local demo host required.'));next();});
 app.use('/api',(req,res,next)=>{try{rate('ip:'+req.ip,180);if(!['GET','HEAD'].includes(req.method)){
  if(req.get('origin')!==`http://${req.get('host')}`)throw fail(403,'Same-origin request required.');
  if(!req.is('application/json'))throw fail(415,'JSON required.');
 }next();}catch(e){next(e);}});
 app.use(express.json({limit:'12kb',strict:true}));
 app.post('/api/session',(req,res,next)=>{try{
  rate('login:'+req.ip,10);exact(req.body,['key']);
  const role=safeKey(req.body.key,ownerKey)?'owner':safeKey(req.body.key,memberKey)?'member':null;
  if(!role)throw fail(401,'Invalid demo access key.');
  for(const [k,s]of store.sessions)if(s.expires<=now())store.sessions.delete(k);
  if(store.sessions.size>=100)throw fail(503,'Session limit reached. Try later.');
  const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');
  store.sessions.set(token,{userId:role,role,csrf,expires:now()+sessionMs});
  res.cookie('kv_social_demo',token,{httpOnly:true,sameSite:'strict',path:'/',maxAge:sessionMs});
  res.json({csrf,user:store.users.get(role),role,demo:true});
 }catch(e){next(e);}});
 app.use('/api',(req,res,next)=>{try{
  const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('kv_social_demo='));
  const token=cookie?.slice('kv_social_demo='.length),session=store.sessions.get(token);
  if(!session||session.expires<=now()){store.sessions.delete(token);throw fail(401,'Sign in to the private pilot.');}
  req.session=session;req.token=token;req.user=store.users.get(session.userId);
  if(!['GET','HEAD'].includes(req.method)){if(!safeKey(req.get('x-csrf-token'),session.csrf))throw fail(403,'Session verification failed. Refresh and try again.');rate('write:'+session.userId,80);}
  next();
 }catch(e){next(e);}});
 const route=(method,path,fn)=>app[method]('/api'+path,(req,res,next)=>{try{fn(req,res)}catch(e){next(e)}});
 const owner=req=>{if(req.session.role!=='owner')throw fail(403,'Owner access required.');};
 const active=req=>{if(req.user.suspended)throw fail(403,'Posting is suspended. You may still appeal a decision.');};
 const post=id=>{const p=store.posts.get(id);if(!p)throw fail(404,'Post not found.');return p;};
 const visible=(p,userId)=>p.status==='published'&&!store.users.get(p.authorId)?.suspended&&!store.blocks.get(userId)?.has(p.authorId)&&(!p.parentId||(store.posts.get(p.parentId)?.status==='published'&&!store.users.get(store.posts.get(p.parentId)?.authorId)?.suspended&&!store.blocks.get(userId)?.has(store.posts.get(p.parentId)?.authorId)));
 const publicPost=(p,uid)=>({id:p.id,authorId:p.authorId,author:store.users.get(p.authorId),text:p.text,topic:p.topic,artist:p.artist||'',theme:p.theme||'none',title:p.title||'',eyebrow:p.eyebrow||'',sample:!!p.sample,parentId:p.parentId,createdAt:p.createdAt,reactions:p.reactions.size,liked:p.reactions.has(uid),saved:p.saves.has(uid),version:p.version});
 const privatePost=p=>({...publicPost(p,''),status:p.status,signals:p.signals,reason:p.reason||'',version:p.version});
 const audit=(req,action,id,reason)=>{if(store.audit.length>=3000)throw fail(503,'Pilot audit capacity reached; restart to reset synthetic data.');store.audit.push({id:randomUUID(),actor:req.user.id,action,targetId:id,reason,at:new Date(now()).toISOString()});};
 const space=(collection)=>{if(store.audit.length>=2990||(collection==='posts'&&store.posts.size>=500)||(collection==='reports'&&store.reports.length>=500)||(collection==='appeals'&&store.appeals.length>=500))throw fail(503,'Pilot capacity reached. Restart to reset synthetic data.');};
 route('get','/session',(req,res)=>res.json({csrf:req.session.csrf,user:req.user,role:req.session.role,demo:true}));
 route('post','/logout',(req,res)=>{store.sessions.delete(req.token);res.clearCookie('kv_social_demo',{path:'/'});res.json({ok:true});});
 route('get','/feed',(req,res)=>res.json({posts:[...store.posts.values()].filter(p=>visible(p,req.user.id)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(p=>publicPost(p,req.user.id)),users:[...store.users.values()],blocked:[...(store.blocks.get(req.user.id)||[])],topics}));
 route('get','/activity',(req,res)=>res.json({posts:[...store.posts.values()].filter(p=>p.authorId===req.user.id).map(privatePost),appeals:store.appeals.filter(a=>a.authorId===req.user.id)}));
 route('post','/posts',(req,res)=>{
  active(req);space('posts');exact(req.body,['text','topic','theme','parentId']);
  const text=validateText(req.body.text);if(!topics.includes(req.body.topic))throw fail(400,'Choose a topic.');
  if(req.body.theme&&!['none','sound','gather','live'].includes(req.body.theme))throw fail(400,'Choose a curated visual.');
  if(req.body.parentId){const parent=post(req.body.parentId);if(parent.parentId||!visible(parent,req.user.id))throw fail(404,'Conversation unavailable.');}
  if([...store.posts.values()].some(p=>p.authorId===req.user.id&&p.text===text&&p.parentId===(req.body.parentId||null)))throw fail(409,'This message was already submitted.');
  rate('post:'+req.user.id,5);const p={id:randomUUID(),authorId:req.user.id,text,topic:req.body.topic,theme:req.body.theme||'none',parentId:req.body.parentId||null,status:'pending',createdAt:new Date(now()).toISOString(),version:1,reactions:new Set(),saves:new Set(),signals:[]};
  try{p.signals=screenContent(text)}catch{p.signals=['screening-unavailable']}
  audit(req,'submit',p.id,'Awaiting human review');store.posts.set(p.id,p);res.status(201).json({post:privatePost(p)});
 });
 route('patch','/posts/:id',(req,res)=>{
  active(req);space();exact(req.body,['text']);const p=post(req.params.id);if(p.authorId!==req.user.id)throw fail(403,'Only the author may edit.');
  if(store.appeals.some(a=>a.postId===p.id&&a.status==='pending'))throw fail(409,'Wait for the open appeal before editing.');
  const text=validateText(req.body.text);rate('post:'+req.user.id,5);let signals;try{signals=screenContent(text)}catch{signals=['screening-unavailable']}
  audit(req,'edit',p.id,'Revision requires review');Object.assign(p,{text,signals,status:'pending',reason:'Revision awaiting review',version:p.version+1});res.json({post:privatePost(p)});
 });
 for(const action of ['react','save'])route('post',`/posts/:id/${action}`,(req,res)=>{
  active(req);exact(req.body,[]);const p=post(req.params.id);if(!visible(p,req.user.id))throw fail(404,'Post unavailable.');const set=action==='react'?p.reactions:p.saves;set.has(req.user.id)?set.delete(req.user.id):set.add(req.user.id);res.json({post:publicPost(p,req.user.id)});
 });
 route('post','/posts/:id/report',(req,res)=>{
  space('reports');exact(req.body,['category','reason']);const p=post(req.params.id);if(!visible(p,req.user.id))throw fail(404,'Post unavailable.');
  if(!categories.includes(req.body.category))throw fail(400,'Choose a report category.');const reason=validateText(req.body.reason,500);
  if(store.reports.some(r=>r.postId===p.id&&r.reporterId===req.user.id&&r.status==='open'))throw fail(409,'Your report is already awaiting review.');
  rate('report:'+req.user.id,5);const report={id:randomUUID(),postId:p.id,reporterId:req.user.id,category:req.body.category,reason,status:'open',at:new Date(now()).toISOString()};
  audit(req,'report',p.id,'Private report received');store.reports.push(report);res.status(201).json({ok:true});
 });
 route('post','/blocks',(req,res)=>{
  exact(req.body,['authorId','blocked']);if(typeof req.body.blocked!=='boolean'||!store.users.has(req.body.authorId)||req.body.authorId===req.user.id)throw fail(400,'Choose another account.');
  const set=store.blocks.get(req.user.id)||new Set();req.body.blocked?set.add(req.body.authorId):set.delete(req.body.authorId);store.blocks.set(req.user.id,set);res.json({ok:true});
 });
 route('get','/moderation',(req,res)=>{owner(req);res.json({posts:[...store.posts.values()].map(privatePost),reports:store.reports,appeals:store.appeals,audit:store.audit,users:[...store.users.values()]});});
 route('post','/posts/:id/review',(req,res)=>{
  owner(req);space();exact(req.body,['action','reason','version']);const reason=validateText(req.body.reason,500),p=post(req.params.id);
  if(p.version!==req.body.version)throw fail(409,'Content changed. Refresh before reviewing.');
  if(!['approve','hide','remove'].includes(req.body.action))throw fail(400,'Choose a review decision.');
  const status={approve:'published',hide:'hidden',remove:'removed'}[req.body.action];
  if(store.appeals.some(a=>a.postId===p.id&&a.status==='pending'))throw fail(409,'Resolve the open appeal first.');
  if(status==='published'&&(store.users.get(p.authorId).suspended||p.authorId===req.user.id))throw fail(409,'Cannot approve suspended or own-authored content.');
  if(status==='published'&&p.parentId&&!visible(post(p.parentId),req.user.id))throw fail(409,'Parent conversation must be available.');
  audit(req,req.body.action,p.id,reason);Object.assign(p,{status,reason,version:p.version+1});
  for(const report of store.reports)if(report.postId===p.id&&report.status==='open')Object.assign(report,{status:'resolved',resolution:reason,reviewerId:req.user.id});
  res.json({post:privatePost(p)});
 });
 route('post','/posts/:id/appeal',(req,res)=>{
  space('appeals');exact(req.body,['reason']);const p=post(req.params.id);if(p.authorId!==req.user.id)throw fail(403,'Only the author can appeal.');
  if(!['removed','hidden'].includes(p.status))throw fail(409,'This post has no removal decision to appeal.');
  if(store.appeals.some(a=>a.postId===p.id&&a.decisionVersion===p.version))throw fail(409,'This decision already has an appeal.');
  const reason=validateText(req.body.reason,1000);rate('appeal:'+req.user.id,3);const a={id:randomUUID(),postId:p.id,authorId:req.user.id,reason,decisionVersion:p.version,status:'pending',at:new Date(now()).toISOString()};
  audit(req,'appeal',p.id,'Author requested review');store.appeals.push(a);res.status(201).json({appeal:a});
 });
 route('post','/appeals/:id/resolve',(req,res)=>{
  owner(req);space();exact(req.body,['action','reason','version']);const a=store.appeals.find(a=>a.id===req.params.id);if(!a)throw fail(404,'Appeal not found.');
  const p=post(a.postId);if(a.status!=='pending'||p.version!==req.body.version||p.version!==a.decisionVersion)throw fail(409,'Appeal or post changed.');
  if(!['restore','uphold'].includes(req.body.action))throw fail(400,'Choose an appeal decision.');
  if(req.body.action==='restore'&&(store.users.get(p.authorId).suspended||p.authorId===req.user.id||(p.parentId&&!visible(post(p.parentId),req.user.id))))throw fail(409,'Resolve account or parent restrictions before restoring.');
  const reason=validateText(req.body.reason,500);audit(req,'appeal-'+req.body.action,p.id,reason);Object.assign(a,{status:'resolved',resolution:req.body.action,explanation:reason,reviewerId:req.user.id,resolvedAt:new Date(now()).toISOString()});
  // Uphold retains the decision version so repeated appeals cannot reopen the same decision.
  if(req.body.action==='restore'){p.status='published';p.version++;}p.reason=reason;res.json({appeal:a});
 });
 route('post','/users/:id/suspend',(req,res)=>{
  owner(req);space();exact(req.body,['suspended','reason']);const u=store.users.get(req.params.id);if(!u||u.id==='owner'||typeof req.body.suspended!=='boolean')throw fail(400,'Choose a member account and state.');
  const reason=validateText(req.body.reason,500);audit(req,req.body.suspended?'suspend':'reinstate',u.id,reason);u.suspended=req.body.suspended;res.json({ok:true});
 });
 app.use('/api',(req,res)=>res.status(404).json({error:'Unknown pilot endpoint.'}));
 app.use(express.static(fileURLToPath(new URL('./public/',import.meta.url)),{etag:false}));
 app.use((err,req,res,next)=>{if(res.headersSent)return next(err);let status=err.status||400;if(status>=500&&status!==503)status=500;res.status(status).json({error:status===413?'Request is too large.':status===500?'Pilot request failed.':err.type==='entity.parse.failed'?'Invalid JSON.':err.message});});
 return app;
}
