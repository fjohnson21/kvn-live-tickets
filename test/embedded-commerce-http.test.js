import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createCustomerCheckout} from '../lib/customer-checkout-routes.js';
import {checkoutResponse} from '../lib/embedded-checkout.js';
import {reservesTicketInventory,pendingEarlyReleaseUnits} from '../lib/checkout.js';
import {recoverSponsoredCheckout} from '../lib/sponsored-checkout.js';
import {commerceClientIdentity} from '../lib/commerce-client-identity.js';
import {createHmac} from 'node:crypto';
for(const [kind,collection] of [['ticket','orders'],['apparel','shopOrders'],['donation','donations']]){
 test(`${kind}: HTTP duplicate and rollback retry reuse one original session`,async()=>{
  let store={orders:[],shopOrders:[],donations:[]},calls=0,storedConfig;
  const session={id:'cs_test_original',status:'open',ui_mode:'embedded',client_secret:'private'};
  const env={EMBEDDED_CHECKOUT_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_fake',STRIPE_PUBLISHABLE_KEY:'pk_test_fake'};
  const service=createCustomerCheckout({readStore:()=>structuredClone(store),writeStore:s=>store=s,env,stripe:{checkout:{sessions:{create:async(config)=>{calls++;storedConfig=config;return session;},retrieve:async()=>session}}}});
  const app=express();app.use(express.json());
  app.post('/checkout',service.middleware(kind),async(req,res)=>{const order={id:'o',status:'pending',createdAt:new Date().toISOString()};store[collection].push(order);try{const result=await service.createSession(req,order,{mode:'payment',line_items:[{quantity:2}],metadata:{order_id:'o'},shipping_options:[{shipping_rate:'test'}]},kind);store[collection][0].stripeSessionId=result.id;res.json(checkoutResponse(result));}catch(e){res.status(500).json({error:e.message});}});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const post=body=>fetch(`http://127.0.0.1:${server.address().port}/checkout`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  try{const body={checkoutMode:'embedded',checkoutRequestId:'12345678-1234-4123-8123-123456789012',cart:[1]};const a=await post(body);assert.equal(a.status,200);assert.equal((await a.json()).sessionId,session.id);env.EMBEDDED_CHECKOUT_ENABLED='false';const b=await post({...body,checkoutRecoveryOnly:true});assert.equal(b.status,200);assert.equal((await b.json()).sessionId,session.id);assert.equal(calls,1);assert.equal(store[collection].length,1);assert.deepEqual(storedConfig.shipping_options,[{shipping_rate:'test'}]);assert.equal(JSON.stringify(store).includes('private'),false);const c=await post({...body,checkoutRequestId:'22345678-1234-4123-8123-123456789012'});assert.equal(c.status,503);}finally{await new Promise(r=>server.close(r));}
 });
}
test('ambiguous ticket and early-release unit remain reserved until verified expiration',()=>{const o={checkoutMode:'embedded',status:'checkout_failed',eventId:'e',checkoutExpiresAt:'2020-01-01',items:[{productId:'p',quantity:1,earlyReleaseQuantity:1}]};assert.equal(reservesTicketInventory(o),true);assert.equal(pendingEarlyReleaseUnits([o],'e','p'),1);assert.equal(reservesTicketInventory({...o,status:'expired'}),false);});
test('sponsored embedded recovery returns same session without persisting its secret',async()=>{let s={sponsoredClaims:[{id:'c',accessToken:'token',claimedAt:'now'}],orders:[{id:'o',sponsoredClaimId:'c',orderType:'sponsored_upgrade',status:'pending',stripeSessionId:'cs_test_one'}]};const result=await recoverSponsoredCheckout({readStore:()=>structuredClone(s),writeStore:v=>s=v,stripe:{checkout:{sessions:{retrieve:async()=>({id:'cs_test_one',ui_mode:'embedded',status:'open',client_secret:'payment-secret'})}}}},'token');assert.equal(result.sessionId,'cs_test_one');assert.equal(JSON.stringify(s).includes('payment-secret'),false);});
test('only a fresh authenticated proxy identity overrides remote bucket',()=>{const secret='fixture-secret',time=String(Date.now()),client='a'.repeat(64),path='/api/sponsored/request';const signature=createHmac('sha256',secret).update(`${time}\n${client}\n${path}`).digest('hex');const req={ip:'remote',originalUrl:path,headers:{'x-kv-client':client,'x-kv-time':time,'x-kv-signature':signature}};assert.equal(commerceClientIdentity(req,secret),'bridge:'+client);assert.equal(commerceClientIdentity(req,'wrong'),'remote');assert.equal(commerceClientIdentity({...req,originalUrl:'/other'},secret),'remote');});
