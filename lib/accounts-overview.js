import crypto from 'node:crypto';
import {normalizeEmail,personalDashboard,personalIdentity} from './personal-account.js';
const contactId=email=>'contact_'+crypto.createHash('sha256').update('email:'+email).digest('hex');
export function accountsOverview(store,logins,selectedId=null){
 const people=new Map(),scopes=new Map(),loginIndex=new Map();
 function scope(input){const email=normalizeEmail(input);if(!scopes.has(email))scopes.set(email,{events:store.events||[],crmRecords:[],disciples:[],orders:[],shopOrders:[]});return scopes.get(email);}
 for(const r of store.crmRecords||[])scope(r.submittedContact?.email).crmRecords.push(r);
 for(const d of store.disciples||[])scope(d.email).disciples.push(d);
 for(const key of ['orders','shopOrders'])for(const o of store[key]||[]){const emails=new Set([normalizeEmail(o.buyerEmail),...(o.tickets||[]).map(t=>normalizeEmail(t.holderEmail))]);for(const email of emails)if(email)scope(email)[key].push(o);}
 for(const a of logins){const email=normalizeEmail(a.email);if(!loginIndex.has(email))loginIndex.set(email,[]);loginIndex.get(email).push(a);}
 function add(input,name,source){const email=normalizeEmail(input);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return;let p=people.get(email);if(!p){p={id:contactId(email),email,name:name||'',sources:[]};people.set(email,p);}if(!p.name&&name)p.name=name;if(!p.sources.includes(source))p.sources.push(source);}
 for(const r of store.crmRecords||[])add(r.submittedContact?.email,r.submittedContact?.name,r.sourceTable||'Lead submission');
 for(const d of store.disciples||[])add(d.email,d.name,'Disciple record');
 for(const key of ['orders','shopOrders'])for(const o of store[key]||[]){add(o.buyerEmail,o.buyerName,key==='orders'?'Event checkout':'Apparel checkout');for(const t of o.tickets||[])add(t.holderEmail,t.holderName,'Ticket holder');}
 for(const a of logins)add(a.email,'','Verified login');
 const accounts=[...people.values()].filter(p=>!selectedId||p.id===selectedId).map(p=>{
  const records=scope(p.email),matches=loginIndex.get(p.email)||[],login=matches.length===1?matches[0]:null,identity=personalIdentity(records,p.email);
  const review=matches.length>1||!identity;const d=identity?personalDashboard(records,p.email):null;
  return {...p,name:p.name||identity?.name||'Unnamed contact',status:review?'review':login?.disabledAt?'disabled':login?'active':'not_activated',login:login||null,
   counts:{tickets:d?.tickets.length||0,paidOrders:d?.orders.filter(o=>o.status==='paid').length||0,carts:d?.carts.length||0,partnerships:d?.partnerships.length||0,submissions:d?.activity.length||0}};
 }).sort((a,b)=>a.name.localeCompare(b.name)||a.email.localeCompare(b.email));
 return {accounts,summary:{total:accounts.length,active:accounts.filter(a=>a.status==='active').length,notActivated:accounts.filter(a=>a.status==='not_activated').length,disabled:accounts.filter(a=>a.status==='disabled').length,review:accounts.filter(a=>a.status==='review').length},generatedAt:new Date().toISOString()};
}
export function registerAccountsOverview(app,{auth,owner,readStore,writeStore,memberAuth,baseUrl,id}){
 const wrap=fn=>(req,res)=>{res.set('Cache-Control','no-store, private');try{fn(req,res)}catch(e){res.status(e.statusCode||500).json({error:e.statusCode?e.message:'Accounts unavailable. Please refresh and try again.'})}};
 const find=(store,key)=>accountsOverview(store,memberAuth.adminAccounts(),key).accounts[0];
 app.get('/api/crm/accounts',auth,owner,wrap((req,res)=>res.json(accountsOverview(readStore(),memberAuth.adminAccounts()))));
 app.get('/api/crm/accounts/:id',auth,owner,wrap((req,res)=>{
  const store=readStore(),account=find(store,req.params.id);if(!account)return res.status(404).json({error:'Account not found.'});
  const details=personalIdentity(store,account.email)?personalDashboard(store,account.email):null;
  res.json({account,details});
 }));
 app.post('/api/crm/accounts/:id/access',auth,owner,wrap((req,res)=>{
  if(req.headers['sec-fetch-site']==='cross-site'||![new URL(baseUrl).origin,'https://www.kvnlive.com'].includes(req.headers.origin))return res.status(403).json({error:'Use the signed-in Command Center.'});
  const store=readStore(),account=find(store,req.params.id);if(!account?.login)return res.status(409).json({error:'This contact does not have a single verified login to manage.'});
  const login=memberAuth.manageAccount(account.login.id,req.body.action,req.body.version,req.user.id);
  store.auditLogs??=[];store.auditLogs.push({id:id('audit'),userId:req.user.id,action:'account.'+req.body.action,entityType:'memberAccount',entityId:login.id,createdAt:new Date().toISOString()});writeStore(store);
  res.json({ok:true});
 }));
}
