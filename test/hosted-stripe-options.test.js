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
for(const [kind,path] of [['ticket','/passes'],['apparel','/shop'],['donation','/give']]){
 test(`${kind}: website cancellation stays branded and preserves existing success flow`,async()=>{
  let captured;const stripe={checkout:{sessions:{create:async config=>{captured=config;return {url:'https://checkout.stripe.com/test'};}}}};
  const service=createCustomerCheckout({readStore:()=>({}),writeStore:()=>assert.fail('No store changes'),stripe});
  const original={mode:'payment',success_url:'https://existing.test/success',cancel_url:'https://existing.test/cancel',line_items:[{price:'price_test',quantity:1}]};
  await service.createSession({headers:{origin:'https://kvnlive.com'},body:{promotion:'kap-vip-3999',cart:[{id:'kv-kingdom-pass-2026'}]}},{id:'test'},original,kind);
  const url=new URL(captured.cancel_url);assert.equal(url.origin,'https://kvnlive.com');assert.equal(url.pathname,path);assert.equal(url.searchParams.get('checkout'),'cancelled');
  if(kind==='ticket'){assert.equal(url.searchParams.get('promotion'),'kap-vip-3999');assert.equal(url.searchParams.get('offer'),'kingdom-pass');}
  assert.equal(captured.success_url,original.success_url);assert.deepEqual(captured.line_items,original.line_items);assert.equal(original.cancel_url,'https://existing.test/cancel');
  await service.createSession({headers:{origin:'https://untrusted.test'},body:{}},{id:'test'},original,kind);assert.equal(captured.cancel_url,original.cancel_url);
 });
}
