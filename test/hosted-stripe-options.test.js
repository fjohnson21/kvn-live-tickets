import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import {createCustomerCheckout} from '../lib/customer-checkout-routes.js';
for(const kind of ['ticket','apparel','donation']){
 test(`${kind}: hosted checkout passes real Stripe SDK argument validation`,async()=>{
  const stripe=new Stripe('sk_test_synthetic');let captured;
  // Keep the actual SDK argument parser; replace only the transport. No network or payment.
  stripe._requestSender._request=(method,host,path,data,auth,options,usage,callback)=>{captured={method,path,data,options};callback(null,{id:'cs_test_synthetic',url:'https://checkout.stripe.com/test'});};
  const service=createCustomerCheckout({readStore:()=>({}),writeStore:()=>assert.fail('Hosted wrapper must not write'),stripe});
  const config={mode:'payment',line_items:[{price:'price_test',quantity:1}],success_url:'https://existing.test/success',cancel_url:'https://existing.test/cancel'};
  const session=await service.createSession({body:{}},{id:'test'},config,kind,{});
  assert.equal(session.id,'cs_test_synthetic');assert.deepEqual(captured.data,config);
  await service.createSession({body:{}},{id:'test'},config,kind,{idempotencyKey:'sponsored-upgrade:test'});
  assert.equal(captured.options.headers['Idempotency-Key'],'sponsored-upgrade:test');
 });
}
