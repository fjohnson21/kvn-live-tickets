import {createHash} from 'node:crypto';
const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode});};
export function configureCheckout(config,{mode,returnUrl}){
 if(mode!=='embedded')return {...config};
 const {success_url,cancel_url,...rest}=config;
 return {...rest,ui_mode:'embedded',return_url:returnUrl,redirect_on_completion:'if_required'};
}
export function checkoutResponse(session){
 if(['embedded','embedded_page'].includes(session.ui_mode)){
  if(session.status!=='open'||!session.client_secret)fail('This payment session is no longer open.');
  return {mode:'embedded',sessionId:session.id,clientSecret:session.client_secret};
 }
 if(!session.url||!/^https:\/\//.test(session.url))fail('Secure checkout is unavailable.',503);
 return {mode:'hosted',url:session.url};
}
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
export function createCheckoutGuard({readStore,writeStore,isAmbiguous=()=>true}){
 const locks=new Map();
 return {async run({kind,requestId,body},execute,recover){
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId||''))fail('A valid checkout request ID is required.',400);
  const key=`${kind}:${requestId}`,fingerprint=createHash('sha256').update(JSON.stringify(stable(body))).digest('hex');
  const s=readStore(),old=s.customerCheckoutRequests?.find(x=>x.key===key);
  if(old&&old.fingerprint!==fingerprint)fail('Checkout details changed. Start a new request.');
  if(locks.has(key)){await locks.get(key);return recover?recover(requestId):readStore().customerCheckoutRequests.find(x=>x.key===key).result;}
  if(old)return recover?recover(requestId):old.result??fail('This request needs recovery before retrying.');
  s.customerCheckoutRequests??=[];s.customerCheckoutRequests.push({key,fingerprint,createdAt:new Date().toISOString()});writeStore(s);
  const operation=(async()=>{const result=await execute();const latest=readStore(),record=latest.customerCheckoutRequests.find(x=>x.key===key);record.result={...result};delete record.result.clientSecret;writeStore(latest);return result;})();
  locks.set(key,operation);
  try{return await operation;}catch(error){if(!isAmbiguous(requestId)){const latest=readStore();latest.customerCheckoutRequests=latest.customerCheckoutRequests.filter(x=>x.key!==key);writeStore(latest);}throw error;}finally{locks.delete(key);}
 }};
}
