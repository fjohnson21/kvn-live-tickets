import {randomUUID,randomBytes,createHash} from 'node:crypto';
const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode});};
const fingerprint=body=>createHash('sha256').update(JSON.stringify(body)).digest('hex');
const privateHeaders={'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer'};
export function safePublicUrl(value){
 try{const u=new URL(String(value||''));return u.protocol==='https:'&&!u.username&&!u.password&&u.href.length<=500?u.href:'';}catch{return '';}
}
export function publicFoundingMembers(store){
 return (store.donations||[]).filter(d=>d.status==='paid'&&!d.paymentAttention&&d.partnershipLevel==='founding'&&d.websiteRecognition===true&&!d.anonymous).map(d=>({name:d.recognitionName||d.name,logoUrl:safePublicUrl(d.logoUrl),websiteUrl:safePublicUrl(d.websiteUrl)}));
}
export function normalizePartnership(body){
 const amount=Number(body.amount),level=body.level||'custom';
 if(!Number.isInteger(amount)||amount<200||amount>1000000)fail('Enter a contribution amount between $2 and $10,000.');
 if(!['community','outreach','kingdom','founding','custom'].includes(level))fail('Select a partnership level.');
 if(level==='founding'&&amount<100000)fail('Founding Partner has a $1,000 minimum.');
 if(level==='kingdom'&&amount<50000)fail('Kingdom Partner has a $500 minimum.');
 if(level==='community'&&amount!==10000||level==='outreach'&&amount!==25000)fail('Please select the correct partnership amount.');
 const name=String(body.name||'').trim().slice(0,120),email=String(body.email||'').trim().toLowerCase();
 if(!name||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)fail('Enter your name and a valid email address.');
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.checkoutRequestId||''))fail('A valid checkout request ID is required.');
 const founder=amount>=100000;
 const shirtSize=String(body.shirtSize||'');
 if(founder&&!['S','M','L','XL','2XL','3XL','4XL'].includes(shirtSize))fail('Select your Founder Edition T-shirt size.');
 const websiteUrl=safePublicUrl(body.websiteUrl);
 if(body.websiteUrl&&!websiteUrl)fail('Enter a valid https website link.');
 return {...(founder?{shirtSize,shirtEdition:'Not Self Made. Made By God. — Founder Edition',shirtBack:'FOUNDING MEMBER',shirtFulfillment:'on-site-pickup',websiteUrl,websiteRecognition:body.websiteRecognition===true&&body.anonymous!==true}:{}),amount,name,email,level,checkoutRequestId:body.checkoutRequestId,recognitionName:String(body.recognitionName||name).slice(0,160),anonymous:body.anonymous===true,logoUrl:safePublicUrl(body.logoUrl),supporterType:['individual','ministry','business'].includes(body.supporterType)?body.supporterType:'individual'};
}
export function createPayPalPartnership({readStore,writeStore,client,sendReceipt}){
 const locks=new Map();
 async function locked(key,fn){while(locks.has(key))await locks.get(key).catch(()=>{});const task=fn();locks.set(key,task);try{return await task;}finally{locks.delete(key);}}
 const find=orderId=>readStore().donations.find(d=>d.paymentProvider==='paypal'&&d.paypalOrderId===orderId);
 async function checkout(body){
  const details=normalizePartnership(body),hash=fingerprint(details);
  return locked('create:'+details.checkoutRequestId,async()=>{
   let store=readStore(),donation=store.donations.find(d=>d.paymentProvider==='paypal'&&d.checkoutRequestId===details.checkoutRequestId);
   if(donation&&donation.checkoutFingerprint!==hash)fail('Checkout details changed. Start a new request.',409);
   if(donation?.status==='paid')fail('This contribution has already been paid. Please check your receipt.',409);
   if(!donation){donation={...details,id:'don_'+randomUUID(),paymentProvider:'paypal',program:'kingdom-outreach',campaign:'kingdom-outreach',designation:'Kingdom Vibe Outreach Ministry: free community gatherings and Acts 2:44 holiday groceries for families',partnershipLevel:details.amount>=100000?'founding':details.amount>=50000?'kingdom':details.amount>=25000?'outreach':details.amount>=10000?'community':'custom',status:'pending',checkoutFingerprint:hash,paypalReturnKey:randomBytes(32).toString('hex'),createdAt:new Date().toISOString()};store.donations.push(donation);writeStore(store);}
   if(!donation.paypalOrderId){
    // PayPal retains idempotency keys for a limited window; never recreate an uncertain old request.
    if(Date.now()-Date.parse(donation.createdAt)>5*3600000)fail('This checkout needs owner review before retrying.',409);
    const order=await client.create(donation);store=readStore();donation=store.donations.find(d=>d.id===donation.id);Object.assign(donation,{paypalOrderId:order.id,paypalApprovalUrl:order.url});writeStore(store);
   }
   if(Date.now()-Date.parse(donation.createdAt)>5*3600000)fail('This checkout has expired. Please contact the KV Live team.',409);
   return {mode:'hosted',url:donation.paypalApprovalUrl,donationId:donation.id};
  });
 }
 async function complete(orderId,key,{verifiedWebhook=false}={}){
  const initial=find(orderId);if(!initial||(!verifiedWebhook&&key!==initial.paypalReturnKey))fail('Invalid payment reference.',404);
  return locked('capture:'+orderId,async()=>{
   let donation=find(orderId);
   if(donation.status!=='paid'){
    if(donation.paymentAttention)fail('This payment needs owner review.',409);
    let order=await client.get(orderId);
    if(order.status==='APPROVED')order=await client.capture(orderId,donation.id);
    if(order.id!==orderId)fail('Payment verification failed.',409);
    const units=order.purchase_units||[],unit=units[0],captures=unit?.payments?.captures||[],capture=captures[0];
    if(order.status!=='COMPLETED'||capture?.status!=='COMPLETED')fail('Payment is not completed yet. Please check again shortly.',409);
    if(units.length!==1||captures.length!==1||unit.custom_id!==donation.id||capture.amount?.currency_code!=='USD'||capture.amount?.value!==(donation.amount/100).toFixed(2)||!capture.id)fail('Payment verification failed. Please contact the KV Live team.',409);
    const store=readStore();if(store.donations.some(d=>d.id!==donation.id&&d.paypalCaptureId===capture.id))fail('Payment reference already recorded.',409);
    donation=store.donations.find(d=>d.id===donation.id);Object.assign(donation,{status:'paid',amountTotal:donation.amount,paypalCaptureId:capture.id,paidAt:new Date().toISOString(),updatedAt:new Date().toISOString()});writeStore(store);
   }
   if(!donation.paymentAttention&&donation.receiptEmail?.status!=='sent'&&sendReceipt){
    const receipt=await sendReceipt(donation);const store=readStore(),current=store.donations.find(d=>d.id===donation.id);current.receiptEmail=receipt;writeStore(store);
   }
   return {status:donation.status,amountTotal:donation.amount,donationId:donation.id};
  });
 }
 return {checkout,complete};
}
export function createPayPalClient({env=process.env,fetchImpl=fetch}={}){
 const base=()=>env.PAYPAL_ENVIRONMENT==='live'?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com';
 let cached;
 async function token(){
  if(cached&&cached.until>Date.now())return cached.token;
  if(!env.PAYPAL_CLIENT_ID||!env.PAYPAL_CLIENT_SECRET)fail('PayPal is not configured.',503);
  const r=await fetchImpl(base()+'/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(env.PAYPAL_CLIENT_ID+':'+env.PAYPAL_CLIENT_SECRET).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(10000)});
  if(!r.ok)fail('PayPal connection is unavailable.',503);const b=await r.json();if(!b.access_token)fail('PayPal connection is unavailable.',503);cached={token:b.access_token,until:Date.now()+(Math.max(0,Number(b.expires_in)||0)-60)*1000};return cached.token;
 }
 async function request(path,{method='GET',body,requestId}={}){
  const r=await fetchImpl(base()+path,{method,headers:{Authorization:'Bearer '+await token(),'Content-Type':'application/json',Prefer:'return=representation',...(requestId?{'PayPal-Request-Id':requestId}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
  if(!r.ok)fail('Unable to confirm PayPal payment. Please retry the same checkout.',503);return r.status===204?{}:r.json();
 }
 return {
  async ensureWebhook(){
   const url='https://kvn-live-tickets.onrender.com/api/donations/paypal/webhook';
   const event_types=['CHECKOUT.ORDER.APPROVED','PAYMENT.CAPTURE.COMPLETED','PAYMENT.CAPTURE.REFUNDED','PAYMENT.CAPTURE.REVERSED','PAYMENT.CAPTURE.DENIED'].map(name=>({name}));
   const listed=await request('/v1/notifications/webhooks'),existing=listed.webhooks?.find(w=>w.url===url);
   if(existing){if(!event_types.every(t=>existing.event_types?.some(e=>e.name===t.name||e.name==='*')))await request('/v1/notifications/webhooks/'+encodeURIComponent(existing.id),{method:'PATCH',body:[{op:'replace',path:'/event_types',value:event_types}]});return existing.id;}
   const created=await request('/v1/notifications/webhooks',{method:'POST',body:{url,event_types}});if(!created.id)fail('Payment notifications could not be configured.',503);return created.id;
  },
  async create(d){
   const origin=env.CUSTOMER_PUBLIC_ORIGIN||'https://kvnlive.com';
   if(!['https://kvnlive.com','https://www.kvnlive.com'].includes(origin))fail('PayPal return address is not configured.',503);
   const order=await request('/v2/checkout/orders',{method:'POST',requestId:d.id,body:{intent:'CAPTURE',purchase_units:[{custom_id:d.id,description:'Kingdom Vibe Outreach Ministry Partnership',amount:{currency_code:'USD',value:(d.amount/100).toFixed(2)}}],payment_source:{paypal:{experience_context:{brand_name:'Kingdom Vibe Live',shipping_preference:'NO_SHIPPING',user_action:'PAY_NOW',return_url:origin+'/give/paypal#key='+d.paypalReturnKey,cancel_url:origin+'/give?checkout=cancelled'}}}}});
   const url=order.links?.find(l=>['payer-action','approve'].includes(l.rel))?.href;
   let parsed;try{parsed=new URL(url);}catch{fail('PayPal checkout is unavailable.',503);}
   const host=env.PAYPAL_ENVIRONMENT==='live'?'www.paypal.com':'www.sandbox.paypal.com';
   if(!order.id||parsed.protocol!=='https:'||parsed.hostname!==host||parsed.pathname!=='/checkoutnow')fail('PayPal checkout is unavailable.',503);
   return {id:order.id,url};
  },
  get:orderId=>request('/v2/checkout/orders/'+encodeURIComponent(orderId)),
  capture:(orderId,donationId)=>request('/v2/checkout/orders/'+encodeURIComponent(orderId)+'/capture',{method:'POST',body:{},requestId:'cap-'+donationId}),
  verifyWebhook:async(headers,event)=>{if(!env.PAYPAL_WEBHOOK_ID)return false;const result=await request('/v1/notifications/verify-webhook-signature',{method:'POST',body:{auth_algo:headers['paypal-auth-algo'],cert_url:headers['paypal-cert-url'],transmission_id:headers['paypal-transmission-id'],transmission_sig:headers['paypal-transmission-sig'],transmission_time:headers['paypal-transmission-time'],webhook_id:env.PAYPAL_WEBHOOK_ID,webhook_event:event}});return result.verification_status==='SUCCESS';}
 };
}
export function registerPayPalPartnership(app,{readStore,writeStore,sendReceipt,env=process.env,client=createPayPalClient({env})}){
 app.get('/api/donations/founding-members',(req,res)=>res.set(privateHeaders).json({members:publicFoundingMembers(readStore())}));
 const service=createPayPalPartnership({readStore,writeStore,client,sendReceipt});
 const wrap=fn=>async(req,res)=>{res.set(privateHeaders);try{res.json(await fn(req));}catch(e){res.status(e.statusCode||503).json({error:e.statusCode?e.message:'PayPal is temporarily unavailable. Please retry the same checkout.'});}};
 app.post('/api/donations/checkout',(req,res,next)=>{
  if(env.PARTNERSHIP_PAYMENT_PROVIDER!=='paypal')return next();
  if(!env.PAYPAL_CLIENT_ID||!env.PAYPAL_CLIENT_SECRET||!env.PAYPAL_WEBHOOK_ID||!['live','sandbox'].includes(env.PAYPAL_ENVIRONMENT))return res.status(503).json({error:'Partnership checkout is temporarily unavailable.'});
  return wrap(req=>service.checkout(req.body))(req,res);
 });
 app.post('/api/donations/paypal/complete',wrap(req=>service.complete(String(req.body.orderId||''),String(req.body.key||''))));
 app.post('/api/donations/paypal/webhook',wrap(async req=>{
  if(!await client.verifyWebhook(req.headers,req.body))fail('Invalid webhook signature.',400);
  const event=req.body,orderId=event.event_type==='CHECKOUT.ORDER.APPROVED'?event.resource?.id:event.resource?.supplementary_data?.related_ids?.order_id;
  const captureLink=event.resource?.links?.find(link=>link.rel==='up'&&/^https:\/\/(api|api-m)(\.sandbox)?\.paypal\.com\/v2\/payments\/captures\/[A-Za-z0-9]+$/.test(link.href||''))?.href;
  const captureId=captureLink?.split('/').pop()||event.resource?.id;
  const store=readStore(),donation=store.donations.find(d=>d.paymentProvider==='paypal'&&((orderId&&d.paypalOrderId===orderId)||(d.paypalCaptureId&&d.paypalCaptureId===captureId)));
  if(!donation)return {received:true};
  if(['CHECKOUT.ORDER.APPROVED','PAYMENT.CAPTURE.COMPLETED'].includes(event.event_type))await service.complete(donation.paypalOrderId,null,{verifiedWebhook:true});
  if(['PAYMENT.CAPTURE.REFUNDED','PAYMENT.CAPTURE.REVERSED','PAYMENT.CAPTURE.DENIED'].includes(event.event_type)){
   const latest=readStore(),current=latest.donations.find(d=>d.id===donation.id);current.paymentAttention={type:event.event_type,eventId:event.id,recordedAt:new Date().toISOString()};current.status='payment_review';writeStore(latest);
  }
  return {received:true};
 }));
 return service;
}
