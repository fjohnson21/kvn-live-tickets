import {randomUUID,randomBytes} from 'node:crypto';
export const UPGRADE_LIMIT=100, UPGRADE_PRICE=2500;
const seating='Reserved seating · First five center rows';
const fail=(message,statusCode=400)=>{throw Object.assign(Error(message),{statusCode});};
const active=o=>o.orderType==='reserved_upgrade'&&(['paid','payment_review','capturing'].includes(o.status)||(o.status==='pending'&&Date.parse(o.checkoutExpiresAt)>Date.now()));
export const upgradeAvailable=store=>Math.max(0,UPGRADE_LIMIT-(store.orders||[]).filter(active).reduce((n,o)=>n+o.quantity,0));
export function createReservedUpgrades({readStore,writeStore,paypal,stripe,sendConfirmation}){
 let queue=Promise.resolve();
 const locked=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
 const byId=(s,id)=>s.orders.find(o=>o.orderType==='reserved_upgrade'&&o.id===id);
 function parent(s,input){const o=s.orders.find(o=>o.id===input.orderId&&o.orderType==='community_rsvp'&&o.status==='complimentary'&&!o.paymentAttention);if(!o||!o.tickets.some(t=>t.code===input.passCode))fail('Open your confirmed free passes to upgrade.',403);return o;}
 const eligible=(s,o)=>o.tickets.filter(t=>!t.checkedIn&&t.status!=='replaced'&&!t.reservedUpgradeId&&!String(t.seating||'').startsWith('Reserved')&&!s.orders.some(u=>active(u)&&u.ticketCodes?.includes(t.code)));
 const view=o=>({orderId:o.id,tickets:o.tickets.map(t=>({code:t.code,ticketName:t.ticketName,seating:t.seating})),emailStatus:o.confirmationEmail?.status||'pending'});
 function info(input){const s=readStore(),o=parent(s,input);const pending=s.orders.find(u=>u.parentOrderId===o.id&&u.status==='pending'&&active(u)&&u.checkoutUrl);return {pendingUrl:pending?.checkoutUrl||'',available:upgradeAvailable(s),eligible:eligible(s,o).length,price:UPGRADE_PRICE,provider:s.settings.reservedUpgradeProvider||'paypal',registration:view(o)};}
 async function checkout(input){return locked(async()=>{
  let s=readStore(),p=parent(s,input);const quantity=Number(input.quantity),requestId=String(input.requestId||'');
  if(!/^[a-f0-9-]{36}$/i.test(requestId)||!Number.isInteger(quantity)||quantity<1||quantity>20)fail('Choose a valid number of seats.');
  let o=s.orders.find(o=>o.orderType==='reserved_upgrade'&&o.checkoutRequestId===requestId);
  if(o&&(o.parentOrderId!==p.id||o.quantity!==quantity))fail('Checkout details changed. Please start a new checkout.',409);
  if(!o){
   if(Date.now()>=Date.parse('2026-11-21T18:00:00-05:00'))fail('Reserved-seat upgrades are closed.',409);
   const tickets=eligible(s,p);if(quantity>tickets.length||quantity>upgradeAvailable(s))fail('Not enough reserved seats remain for this request.',409);
   const provider=s.settings.reservedUpgradeProvider||'paypal';if(provider==='stripe'&&!stripe)fail('Stripe is unavailable.',503);
   o={id:'upg_'+randomUUID(),orderType:'reserved_upgrade',paymentProvider:provider,parentOrderId:p.id,eventId:p.eventId,organizationId:p.organizationId,buyerName:p.buyerName,buyerEmail:p.buyerEmail,customer:p.customer,quantity,ticketCodes:tickets.slice(0,quantity).map(t=>t.code),checkoutRequestId:requestId,amount:quantity*UPGRADE_PRICE,amountSubtotal:quantity*UPGRADE_PRICE,amountTotal:quantity*UPGRADE_PRICE,status:'pending',createdAt:new Date().toISOString(),checkoutExpiresAt:new Date(Date.now()+31*60000).toISOString(),paypalReturnKey:randomBytes(32).toString('hex'),tickets:[],items:[{type:'seat-upgrade',name:'Reserved Seating · First five center rows',quantity,unitAmount:UPGRADE_PRICE}]};s.orders.push(o);writeStore(s);
  }
  if(o.status==='paid')fail('These seats are already upgraded. Refresh your passes.',409);
  if(o.status!=='pending'||Date.parse(o.checkoutExpiresAt)<=Date.now())fail('This checkout has expired. Refresh your passes and start again.',409);
  if(!o.checkoutUrl){
   let result;
   if(o.paymentProvider==='paypal')result=await paypal.create(o);
   else {const session=await stripe.checkout.sessions.create({mode:'payment',payment_method_types:['card'],customer_email:o.buyerEmail,expires_at:Math.floor(Date.parse(o.checkoutExpiresAt)/1000),line_items:[{quantity:o.quantity,price_data:{currency:'usd',unit_amount:UPGRADE_PRICE,product_data:{name:'Reserved Seating Upgrade — First five center rows'}}}],metadata:{order_id:o.id,order_type:'reserved_upgrade'},payment_intent_data:{metadata:{order_id:o.id,order_type:'reserved_upgrade'}},success_url:'https://kvnlive.com/passes/upgrade#session={CHECKOUT_SESSION_ID}&key='+o.paypalReturnKey,cancel_url:'https://kvnlive.com/passes?upgrade=cancelled'},{idempotencyKey:o.id});result={id:session.id,url:session.url};}
   s=readStore();o=byId(s,o.id);o.checkoutUrl=result.url;if(o.paymentProvider==='paypal')o.paypalOrderId=result.id;else o.stripeSessionId=result.id;writeStore(s);
  }
  return {mode:'hosted',url:o.checkoutUrl};
 });}
 async function complete(input,{verified=false}={}){return locked(async()=>{
  let s=readStore(),o=s.orders.find(o=>o.orderType==='reserved_upgrade'&&((input.orderId&&o.paypalOrderId===input.orderId)||(input.sessionId&&o.stripeSessionId===input.sessionId)));
  if(!o||(!verified&&input.key!==o.paypalReturnKey))fail('Invalid payment reference.',404);
  if(o.paymentAttention)fail('This upgrade payment needs review. Your free admission remains valid.',409);
  if(o.status!=='paid'){
   let paid=false,captureId,paymentIntent;
   if(o.paymentProvider==='paypal'){
    let result=await paypal.get(o.paypalOrderId);
    if(result.status==='APPROVED'){
     // Recheck capacity before capturing an approval returned after its hold expired.
     if(!active(o)&&upgradeAvailable(s)<o.quantity)fail('This seat hold expired. Payment was not captured; please contact the team.',409);
     if(!canApply(s,o))fail('These passes cannot be upgraded. Payment was not captured.',409);
     o.status='capturing';writeStore(s);result=await paypal.capture(o.paypalOrderId,o.id);
    }
    const unit=result.purchase_units?.[0],cap=unit?.payments?.captures?.[0];
    paid=result.id===o.paypalOrderId&&result.status==='COMPLETED'&&result.purchase_units?.length===1&&unit?.custom_id===o.id&&unit?.payments?.captures?.length===1&&cap?.status==='COMPLETED'&&cap.amount?.currency_code==='USD'&&cap.amount?.value===(o.amount/100).toFixed(2)&&!!cap.id;captureId=cap?.id;
   }else {const result=await stripe.checkout.sessions.retrieve(o.stripeSessionId);paid=result.id===o.stripeSessionId&&result.metadata?.order_id===o.id&&result.metadata?.order_type==='reserved_upgrade'&&result.payment_status==='paid'&&result.currency==='usd'&&result.amount_total===o.amount;paymentIntent=typeof result.payment_intent==='string'?result.payment_intent:result.payment_intent?.id;}
   if(!paid)fail('Payment has not been verified. If you paid, do not pay again; check again shortly.',409);
   s=readStore();o=byId(s,o.id);
   if((!active(o)&&upgradeAvailable(s)<o.quantity)||!canApply(s,o)){o.status='payment_review';o.paymentAttention={reason:'Reserved seating could not be fulfilled. Review and refund this upgrade.'};writeStore(s);fail('Payment received but your upgrade needs review. Contact the team; do not pay again.',409);}
   Object.assign(o,{status:'paid',paidAt:new Date().toISOString(),paypalCaptureId:captureId,stripePaymentIntentId:paymentIntent});
   const p=s.orders.find(p=>p.id===o.parentOrderId);for(const t of p.tickets.filter(t=>o.ticketCodes.includes(t.code))){t.originalTicketName=t.ticketName;t.ticketName='Reserved Seating — First five center rows';t.seating=seating;t.reservedUpgradeId=o.id;}
   writeStore(s);
  }
  s=readStore();o=byId(s,o.id);const p=s.orders.find(p=>p.id===o.parentOrderId);
  if(o.confirmationEmail?.status!=='sent'&&sendConfirmation){const receipt={...o,tickets:p.tickets.filter(t=>o.ticketCodes.includes(t.code))};await sendConfirmation(receipt,s.events.find(e=>e.id===o.eventId),{force:true});const latest=readStore();byId(latest,o.id).confirmationEmail=receipt.confirmationEmail;writeStore(latest);}
  return {status:'paid',amountTotal:o.amountTotal,registration:view(p)};
 });}
 function canApply(s,o){const p=s.orders.find(p=>p.id===o.parentOrderId&&p.status==='complimentary'&&!p.paymentAttention);return p&&o.ticketCodes.every(code=>p.tickets.some(t=>t.code===code&&!t.checkedIn&&t.status!=='replaced'&&!t.reservedUpgradeId&&!String(t.seating||'').startsWith('Reserved')));}
 function reversal(o,event){const s=readStore(),current=byId(s,o.id);current.status='payment_review';current.paymentAttention={type:event.type||event.event_type,eventId:event.id};const p=s.orders.find(p=>p.id===o.parentOrderId);for(const t of p?.tickets||[])if(t.reservedUpgradeId===o.id){t.ticketName=t.originalTicketName||'Free Community Pass';t.seating='Open seating outside the reserved center section';delete t.reservedUpgradeId;}writeStore(s);}
 async function paypalWebhook(event){const orderId=event.event_type==='CHECKOUT.ORDER.APPROVED'?event.resource?.id:event.resource?.supplementary_data?.related_ids?.order_id;const captureId=event.resource?.links?.find(l=>l.rel==='up')?.href?.split('/').pop()||event.resource?.id;const o=readStore().orders.find(o=>o.orderType==='reserved_upgrade'&&o.paymentProvider==='paypal'&&((orderId&&o.paypalOrderId===orderId)||(o.paypalCaptureId&&o.paypalCaptureId===captureId)));if(!o)return false;if(['CHECKOUT.ORDER.APPROVED','PAYMENT.CAPTURE.COMPLETED'].includes(event.event_type))await complete({orderId:o.paypalOrderId},{verified:true});if(['PAYMENT.CAPTURE.REFUNDED','PAYMENT.CAPTURE.REVERSED','PAYMENT.CAPTURE.DENIED'].includes(event.event_type))await locked(()=>reversal(o,event));return true;}
 async function stripeWebhook(event){const obj=event.data.object,o=readStore().orders.find(o=>o.orderType==='reserved_upgrade'&&o.paymentProvider==='stripe'&&((obj.id&&o.stripeSessionId===obj.id)||(obj.payment_intent&&o.stripePaymentIntentId===obj.payment_intent)));if(!o)return false;if(event.type==='checkout.session.completed'&&obj.payment_status==='paid')await complete({sessionId:o.stripeSessionId},{verified:true});if(event.type==='charge.refunded'||event.type==='charge.dispute.created')await locked(()=>reversal(o,event));return true;}
 return {info,checkout,complete,paypalWebhook,stripeWebhook};
}
export function registerReservedRoutes(app,{service,readStore,writeStore,auth,owner,env=process.env,stripe}){
 const limits=new Map();
 app.use('/api/reserved-upgrades',(req,res,next)=>{if(req.method==='POST'&&req.headers.origin&&!['https://kvnlive.com','https://www.kvnlive.com',env.BASE_URL].includes(req.headers.origin))return res.status(403).json({error:'Use the KV Live website.'});if(req.path!=='/settings'){const now=Date.now(),key=req.ip;for(const [k,v]of limits)if(v.until<now)limits.delete(k);const v=limits.get(key)||{count:0,until:now+60000};v.count++;limits.set(key,v);if(v.count>300)return res.status(429).json({error:'Please wait a moment and try again.'});}next();});
 const headers={'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer'};
 const wrap=fn=>async(req,res)=>{res.set(headers);try{res.json(await fn(req));}catch(e){res.status(e.statusCode||503).json({error:e.statusCode?e.message:'Checkout is temporarily unavailable. Please retry the same request.'});}};
 for(const action of ['info','checkout','complete'])app.post('/api/reserved-upgrades/'+action,wrap(req=>service[action](req.body)));
 const ready={paypal:!!(env.PAYPAL_CLIENT_ID&&env.PAYPAL_CLIENT_SECRET&&env.PAYPAL_WEBHOOK_ID),stripe:!!stripe};
 app.get('/api/reserved-upgrades/settings',auth,owner,wrap(()=>({provider:readStore().settings.reservedUpgradeProvider||'paypal',ready,limit:UPGRADE_LIMIT,available:upgradeAvailable(readStore())})));
 app.post('/api/reserved-upgrades/settings',auth,owner,wrap(req=>{const provider=req.body.provider;if(!['paypal','stripe'].includes(provider)||!ready[provider])fail('This payment provider is not configured.',409);const s=readStore(),previous=s.settings.reservedUpgradeProvider||'paypal';s.settings.reservedUpgradeProvider=provider;s.auditLogs||=[];s.auditLogs.push({id:randomUUID(),action:'reserved_upgrade.provider_changed',userId:req.user.id,previous,provider,createdAt:new Date().toISOString()});writeStore(s);return {provider};}));
}
