import {createHmac,timingSafeEqual} from 'node:crypto';
export function authenticate(body,timestamp,signature,secret,now=Date.now()){
 if(!secret||secret.length<32||!/^\d+$/.test(timestamp||'')||Math.abs(now-Number(timestamp)*1000)>300000||! /^[a-f0-9]{64}$/.test(signature||''))return false;
 const expected=createHmac('sha256',secret).update(timestamp+'.'+body).digest();return timingSafeEqual(expected,Buffer.from(signature,'hex'));
}
export function validateCheckout(id,p,origins){
 if(!/^[a-f0-9-]{36}$/.test(id)||p.client_reference_id!==id||p.metadata?.luxride_order!==id||p.mode!=='payment'||!Array.isArray(p.line_items)||p.line_items.length<1||p.line_items.length>2)throw Error('Invalid ride checkout');
 const allowed=new Set(origins.split(',').map(x=>x.trim()).filter(Boolean));
 for(const [key,path] of [['success_url','/payment'],['cancel_url','/payment']]){const u=new URL(p[key]);if(u.protocol!=='https:'||u.username||u.password||!allowed.has(u.origin)||u.pathname!==path)throw Error('Return domain not allowed');}
 let total=0;for(const item of p.line_items){const price=item.price_data;if(item.quantity!==1||price?.currency!=='usd'||!Number.isSafeInteger(price.unit_amount)||price.unit_amount<5000||price.unit_amount>100000)throw Error('Invalid ride amount');total+=price.unit_amount;}
 return {mode:'payment',client_reference_id:id,customer_email:p.customer_email,expires_at:p.expires_at,metadata:{luxride_order:id,product:'luxride'},payment_intent_data:{metadata:{luxride_order:id,product:'luxride'}},line_items:p.line_items.map(x=>({quantity:1,price_data:{currency:'usd',unit_amount:x.price_data.unit_amount,product_data:{name:String(x.price_data.product_data.name).slice(0,150),description:String(x.price_data.product_data.description||'').slice(0,300)}}})),success_url:p.success_url,cancel_url:p.cancel_url};
}
export function registerLuxrideBridge(app,{express,stripe,env=process.env}){
 app.post('/api/luxride/payments',express.raw({type:'application/json',limit:'20kb'}),async(req,res)=>{
  if(!stripe)return res.status(503).json({error:'LuxRide payments unavailable'});
  const body=req.body.toString('utf8');if(!authenticate(body,req.headers['x-luxride-timestamp'],req.headers['x-luxride-signature'],env.LUXRIDE_BRIDGE_SECRET))return res.status(401).json({error:'Unauthorized'});
  try{const b=JSON.parse(body);let session;
   if(b.action==='inspect'){const account=await stripe.accounts.retrieve(),balance=await stripe.balance.retrieve();return res.json({account:account.id,chargesEnabled:account.charges_enabled,livemode:balance.livemode,bridgeEnabled:env.LUXRIDE_BRIDGE_ENABLED==='true'});}
   if(env.LUXRIDE_BRIDGE_ENABLED!=='true')return res.status(503).json({error:'LuxRide payments unavailable'});
   const account=await stripe.accounts.retrieve();if(account.id!==env.LUXRIDE_STRIPE_ACCOUNT_ID)throw Error('Merchant mismatch');
   if(b.action==='create'){const config=validateCheckout(b.id,b.params,env.LUXRIDE_RETURN_ORIGINS||'');session=await stripe.checkout.sessions.create(config,{idempotencyKey:'luxride-'+b.id});}
   else if(b.action==='retrieve'){if(!/^cs_(test|live)_[A-Za-z0-9]+$/.test(b.session))throw Error('Invalid session');session=await stripe.checkout.sessions.retrieve(b.session);if(session.metadata?.product!=='luxride'||session.metadata?.luxride_order!==b.id)throw Error('Not a LuxRide session');}
   else throw Error('Invalid action');
   res.set('Cache-Control','no-store').json({session:{id:session.id,url:session.url,status:session.status,payment_status:session.payment_status,amount_total:session.amount_total,currency:session.currency,livemode:session.livemode,client_reference_id:session.client_reference_id,metadata:session.metadata}});
  }catch{res.status(400).json({error:'Unable to process LuxRide payment. Review server configuration.'})}
 });
}
export async function forwardLuxrideEvent(event,env=process.env){
 if(event.data.object.metadata?.product!=='luxride')return false;
 if(!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'].includes(event.type))return true;
 if(!env.LUXRIDE_CALLBACK_ORIGIN||!env.LUXRIDE_BRIDGE_SECRET)throw Error('LuxRide callback missing');
 const origin=new URL(env.LUXRIDE_CALLBACK_ORIGIN);if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.username||origin.password)throw Error('Invalid callback origin');
 const body=JSON.stringify({type:event.type,session:event.data.object}),timestamp=String(Math.floor(Date.now()/1000));const signature=createHmac('sha256',env.LUXRIDE_BRIDGE_SECRET).update(timestamp+'.'+body).digest('hex');
 const response=await fetch(origin.origin+'/api/kvn/webhook',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','x-luxride-timestamp':timestamp,'x-luxride-signature':signature},body,signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('LuxRide callback failed');return true;
}
