import {checkoutResponse,configureCheckout,createCheckoutGuard} from './embedded-checkout.js';
import {buildCustomerUrl} from './customer-urls.js';
const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode});};
const records=s=>[...(s.orders||[]).map(order=>({order,kind:'ticket'})),...(s.shopOrders||[]).map(order=>({order,kind:'apparel'})),...(s.donations||[]).map(order=>({order,kind:'donation'}))];
const privateHeaders={'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
export async function customerSessionStatus({readStore,stripe,finalizers={}},sessionId){
 if(!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId||''))fail('Invalid payment session.');
 if(!stripe)fail('Payment verification is unavailable.',503);
 const session=await stripe.checkout.sessions.retrieve(sessionId);
 const match=records(readStore()).find(x=>x.order.stripeSessionId===session.id);
 if(!match||(session.metadata?.order_id||session.metadata?.donation_id)!==match.order.id)fail('Payment session does not match an order.',404);
 let {order,kind}=match;
 if(session.payment_status==='paid'&&['pending','checkout_failed'].includes(order.status)&&!order.paymentAttention&&finalizers[kind]){await finalizers[kind](session);order=records(readStore()).find(x=>x.order.id===order.id)?.order||order;}
 const review=Boolean(order.paymentAttention)||['refunded','payment_review','disputed'].includes(order.status);
 const fulfilled=session.payment_status==='paid'&&order.status==='paid';
 const status=review?'review':fulfilled?'fulfilled':session.status==='expired'?'expired':session.status==='open'?'open':'processing';
 const result={status,kind,orderId:order.id,...(order.checkoutRequestId?{checkoutRequestId:order.checkoutRequestId}:{})};
 if(status==='fulfilled'){
  result.amountTotal=order.amountTotal||order.amount||0;
  if(kind==='ticket')result.tickets=(order.tickets||[]).map(t=>({code:t.code,ticketName:t.ticketName,checkedIn:Boolean(t.checkedIn),status:t.status||'active'}));
  if(kind==='apparel')result.receipt={items:order.items.map(i=>({name:i.name,size:i.size,quantity:i.quantity})),collectorNumbers:order.collectorNumbers||[]};
 }
 return result;
}
export function createCustomerCheckout({readStore,writeStore,stripe,env=process.env,finalizers={}}){
 const guard=createCheckoutGuard({readStore,writeStore,isAmbiguous:requestId=>records(readStore()).some(x=>x.order.checkoutRequestId===requestId)});
 const enabled=()=>env.EMBEDDED_CHECKOUT_ENABLED==='true'&&Boolean(stripe)&&/^pk_(test|live)_/.test(env.STRIPE_PUBLISHABLE_KEY||'')&&(!env.STRIPE_SECRET_KEY||env.STRIPE_SECRET_KEY.split('_')[1]===env.STRIPE_PUBLISHABLE_KEY.split('_')[1]);
 const origin=()=>env.CUSTOMER_PUBLIC_ORIGIN||'https://kvnlive.com';
 async function recoverOrder(requestId){
  const record=records(readStore()).find(x=>x.order.checkoutRequestId===requestId)?.order;
  if(!record)fail('This request could not start. Please review your details and start a new checkout.',409);
  let session;
  if(record.stripeSessionId)session=await stripe.checkout.sessions.retrieve(record.stripeSessionId);
  else if(record.checkoutSessionConfig&&Date.now()-Date.parse(record.createdAt)<23*3600000){
   session=await stripe.checkout.sessions.create(record.checkoutSessionConfig,{idempotencyKey:record.checkoutIdempotencyKey});
   const latest=readStore(),current=records(latest).find(x=>x.order.id===record.id)?.order;
   if(current){current.stripeSessionId=session.id;writeStore(latest);}
  }else fail('This checkout needs owner review before retrying.',409);
  if(session.status==='open'){const latest=readStore(),current=records(latest).find(x=>x.order.id===record.id)?.order;if(current&&current.status==='checkout_failed'){current.status='pending';writeStore(latest);}}
  if(session.status!=='open')return {mode:'embedded',sessionId:session.id,status:session.status};
  return checkoutResponse(session);
 }
 function middleware(kind){return async(req,res,next)=>{
  if(req.body?.checkoutMode!=='embedded')return next();
  res.set(privateHeaders);const send=res.json.bind(res);
  if((!enabled()||req.body.checkoutRecoveryOnly)&&!readStore().customerCheckoutRequests?.some(x=>x.key===`${kind}:${req.body.checkoutRequestId}`))return res.status(503).json({error:'On-site payments are not available yet.'});
  try{
   const body=Object.fromEntries(Object.entries(req.body).filter(([k])=>k!=='checkoutRecoveryOnly'));
   const result=await guard.run({kind,requestId:req.body.checkoutRequestId,body},()=>new Promise((resolve,reject)=>{
    res.json=body=>{const status=res.statusCode;if(status>=400)reject(Object.assign(new Error(body.error||'Unable to start payment.'),{statusCode:status}));else resolve(body);return res;};next();
   }),recoverOrder);
   res.json=send;return res.status(200).json(result);
  }catch(error){res.json=send;return res.status(error.statusCode||503).json({error:error.statusCode?error.message:'Unable to start payment. Please retry the same request.'});}
 };}
 async function createSession(req,record,config,kind,options={}){
  if(req.body.checkoutMode!=='embedded'){
   let hosted=config;
   if(['https://kvnlive.com','https://www.kvnlive.com'].includes(req.headers?.origin)){
    const path=kind==='apparel'?'/shop':kind==='donation'?'/give':'/passes';
    const query={checkout:'cancelled'};
    if(kind==='ticket'){
     if(req.body.promotion==='kap-vip-3999')query.promotion=req.body.promotion;
     const selected=req.body.cart?.[0]?.id;
     if(selected==='kv-kingdom-pass-2026')query.offer='kingdom-pass';
     else if(selected==='kv-all-access-2026')query.offer='full-access';
    }
    hosted={...config,cancel_url:buildCustomerUrl(path,query)};
   }
   return Object.keys(options).length?stripe.checkout.sessions.create(hosted,options):stripe.checkout.sessions.create(hosted);
  }
  if(!enabled())fail('On-site payments are not available yet.',503);
  const path=kind==='apparel'?'/shop/success':kind==='donation'?'/give/confirmation':'/passes/confirmation';
  const prepared=configureCheckout(config,{mode:'embedded',returnUrl:buildCustomerUrl(path,{session_id:'{CHECKOUT_SESSION_ID}',...(kind==='apparel'?{order_id:record.id}:{})},origin())});
  const key=options.idempotencyKey||`customer-checkout:${record.id}`;
  const s=readStore(),current=records(s).find(x=>x.order.id===record.id)?.order;if(!current)fail('Checkout record unavailable.',409);
  Object.assign(current,{checkoutMode:'embedded',checkoutRequestId:req.body.checkoutRequestId,checkoutSessionConfig:prepared,checkoutIdempotencyKey:key});writeStore(s);
  return stripe.checkout.sessions.create(prepared,{...options,idempotencyKey:key});
 }
 function register(app){
  app.get('/api/customer-checkout/config',(req,res)=>res.set(privateHeaders).json({enabled:enabled(),publishableKey:/^pk_(test|live)_/.test(env.STRIPE_PUBLISHABLE_KEY||'')?env.STRIPE_PUBLISHABLE_KEY:''}));
  const wrap=fn=>async(req,res)=>{res.set(privateHeaders);try{res.json(await fn(req));}catch(e){res.status(e.statusCode||503).json({error:e.statusCode?e.message:'Payment verification is temporarily unavailable.'});}};
  app.post('/api/customer-checkout/status',wrap(req=>customerSessionStatus({readStore,stripe,finalizers},req.body.sessionId)));
  app.post('/api/customer-checkout/recover',wrap(async req=>{const state=await customerSessionStatus({readStore,stripe,finalizers},req.body.sessionId);if(state.status!=='open')return state;return checkoutResponse(await stripe.checkout.sessions.retrieve(req.body.sessionId));}));
 }
 return {middleware,createSession,register};
}
