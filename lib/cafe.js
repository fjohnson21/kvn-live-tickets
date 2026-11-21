import {randomBytes, randomUUID} from 'node:crypto';
import {createPayPalClient} from './paypal-partnership.js';

export const menu = [
 ['one','1 meat dinner',1500], ['two','2 meat dinner',2000],
 ['pork','Pulled pork',700], ['baked','Baked chicken',700], ['bbq','BBQ chicken',700],
 ['beans','Green beans',400], ['rice','Yellow rice',400], ['soda','Soda',300],
 ['water','Bottled water',200], ['chips','Chips',200], ['candy','Candy',200],
];
function fail(message,status=400){throw Object.assign(new Error(message),{statusCode:status});}

export function registerCafe(app,{readStore,writeStore,auth,owner,client=createPayPalClient()}) {
 const orders = () => readStore().cafeOrders || [];
 const locks = new Map();
 async function locked(key,fn){
  while(locks.has(key)) await locks.get(key).catch(()=>{});
  const task=Promise.resolve().then(fn);
  locks.set(key,task);
  try{return await task;}finally{locks.delete(key);}
 }
 function update(id,changes){
  const s=readStore(),o=s.cafeOrders.find(o=>o.id===id);
  Object.assign(o,changes);writeStore(s);return o;
 }
 const wrap=fn=>async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{res.json(await fn(req.body));}
  catch(e){res.status(e.statusCode||503).json({error:e.statusCode?e.message:'PayPal is temporarily unavailable. Retry this checkout.'});}
 };
 app.get('/api/cafe/orders',auth,owner,(req,res)=>res.set('Cache-Control','no-store').json({orders:orders().filter(o=>o.status==='paid').map(({id,items,amount,phone,paidAt})=>({id,items,amount,phone,paidAt}))}));
 app.post('/api/cafe/checkout',wrap(async body=>{
  const {requestId,cart}=body;
  const phone=String(body.phone||'').replace(/[^0-9]/g,'').replace(/^1(?=\d{10}$)/,'');
  if(!/^\d{10}$/.test(phone))fail('Enter a 10-digit pickup phone number.');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))fail('Invalid checkout reference.');
  if(!cart||Array.isArray(cart)||typeof cart!=='object'||Object.keys(cart).some(key=>!menu.some(m=>m[0]===key)))fail('Invalid menu selection.');
  const items=menu.filter(([key])=>Object.hasOwn(cart,key)).map(([key,name,price])=>{
   const quantity=cart[key];if(!Number.isInteger(quantity)||quantity<1||quantity>30)fail('Choose 1 to 30 of each item.');
   return {name,price,quantity};
  });
  if(!items.length)fail('Select a menu item.');
  const amount=items.reduce((n,i)=>n+i.price*i.quantity,0);
  return locked(requestId,async()=>{
   const s=readStore();s.cafeOrders||=[];
   let o=s.cafeOrders.find(o=>o.requestId===requestId);
   if(o&&(o.phone!==phone||JSON.stringify(items)!==JSON.stringify(o.items)))fail('Order changed. Start a new checkout.',409);
   if(!o){o={id:'cafe_'+randomUUID(),orderType:'cafe',requestId,phone,items,amount,status:'pending',createdAt:Date.now(),paypalReturnKey:randomBytes(32).toString('hex')};s.cafeOrders.push(o);writeStore(s);}
   if(o.status!=='pending'||Date.now()-o.createdAt>3*3600000)fail('Start a new order.',409);
   if(!o.paypalOrderId){const result=await client.create(o);o=update(o.id,{paypalOrderId:result.id,url:result.url});}
   return {mode:'hosted',url:o.url};
  });
 }));
 async function complete(orderId,key,verified=false){
  return locked(orderId,async()=>{
   let o=orders().find(o=>o.paypalOrderId===orderId);
   if(!o||(!verified&&key!==o.paypalReturnKey))fail('Invalid payment reference.',404);
   if(o.status==='review')fail('Please see the cafe team about this payment.',409);
   if(o.status!=='paid'){
    let pp=await client.get(orderId);
    if(pp.status==='APPROVED')pp=await client.capture(orderId,o.id);
    const unit=pp.purchase_units?.[0],captures=unit?.payments?.captures,c=captures?.[0];
    if(pp.id!==orderId||pp.status!=='COMPLETED'||pp.purchase_units.length!==1||unit.custom_id!==o.id||captures?.length!==1||!c.id||c.status!=='COMPLETED'||c.amount?.currency_code!=='USD'||c.amount.value!==(o.amount/100).toFixed(2))fail('Payment is not confirmed. Check again before paying again.',409);
    o=update(o.id,{status:'paid',paypalCaptureId:c.id,paidAt:new Date().toISOString()});
   }
   return {status:'paid',amount:o.amount,reference:o.id.slice(-8).toUpperCase(),items:o.items,phoneEnding:o.phone.slice(-4)};
  });
 }
 app.post('/api/cafe/complete',wrap(b=>complete(b.orderId,b.key)));
 return async event=>{
  const r=event.resource||{},id=event.event_type==='CHECKOUT.ORDER.APPROVED'?r.id:r.supplementary_data?.related_ids?.order_id;
  const o=orders().find(o=>(id&&o.paypalOrderId===id)||(o.paypalCaptureId&&(r.id===o.paypalCaptureId||r.links?.some(l=>l.rel==='up'&&l.href?.endsWith('/'+o.paypalCaptureId)))));
  if(!o)return false;
  if(['CHECKOUT.ORDER.APPROVED','PAYMENT.CAPTURE.COMPLETED'].includes(event.event_type))await complete(o.paypalOrderId,null,true);
  if(['PAYMENT.CAPTURE.REFUNDED','PAYMENT.CAPTURE.REVERSED','PAYMENT.CAPTURE.DENIED'].includes(event.event_type))await locked(o.paypalOrderId,()=>update(o.id,{status:'review'}));
  return true;
 };
}
