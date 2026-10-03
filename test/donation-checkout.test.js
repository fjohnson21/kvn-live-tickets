import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Stripe from 'stripe';

test('Acts 2:44 contribution checkout creates a non-ticket payment and records it paid', async t => {
  const root=new URL('../',import.meta.url),dir=fs.mkdtempSync(path.join(os.tmpdir(),'kvn-donation-'));
  fs.copyFileSync(new URL('../data/store.json',import.meta.url),path.join(dir,'store.json'));
  const sessionsUrl=new URL('../node_modules/stripe/esm/resources/Checkout/Sessions.js',import.meta.url).href;
  const preload=path.join(dir,'providers.mjs');
  fs.writeFileSync(preload,`import {Sessions} from ${JSON.stringify(sessionsUrl)};let count=0;Sessions.prototype.create=async function(config){const id='cs_don_'+(++count);globalThis.__donSession={id,config};return {id,url:'https://checkout.example.test/'+id};};Sessions.prototype.retrieve=async function(id){return {id,payment_status:'paid',amount_total:5000,payment_intent:'pi_don_test',metadata:{order_type:'donation',donation_id:JSON.parse(require('fs').readFileSync('x','utf8'))}};};`);
  const port=42000+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),BASE_URL:base,DATA_DIR:dir,STRIPE_SECRET_KEY:'sk_test_local_only',STRIPE_WEBHOOK_SECRET:'whsec_test_only'},stdio:['ignore','pipe','pipe']});
  t.after(()=>{child.kill();fs.rmSync(dir,{recursive:true,force:true});});
  let stderr='';child.stderr.on('data',c=>stderr+=c);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(stderr||'startup timeout')),5000);child.stdout.on('data',c=>{if(String(c).includes('running at')){clearTimeout(timer);resolve();}});child.on('exit',()=>{clearTimeout(timer);reject(Error(stderr));});});

  const checkout=await fetch(base+'/api/donations/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount:5000,name:'Test Donor',email:'donor@example.com'})});
  assert.equal(checkout.status,201,await checkout.clone().text());
  const body=await checkout.json();
  let store=JSON.parse(fs.readFileSync(path.join(dir,'store.json'),'utf8'));
  const donation=store.donations.find(d=>d.id===body.donationId);
  assert.ok(donation);
  assert.equal(donation.amount,5000);
  assert.equal(donation.status,'pending');

  const stripeEvent=JSON.stringify({id:'evt_don_test',type:'checkout.session.completed',data:{object:{id:donation.stripeSessionId,payment_status:'paid',amount_total:5000,payment_intent:'pi_don_test',metadata:{order_type:'donation',donation_id:donation.id,program:'acts-2-44'}}}});
  const stripe=new Stripe('sk_test_local_only'),signature=stripe.webhooks.generateTestHeaderString({payload:stripeEvent,secret:'whsec_test_only'});
  const webhook=await fetch(base+'/api/webhook',{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':signature},body:stripeEvent});
  assert.equal(webhook.status,200);
  store=JSON.parse(fs.readFileSync(path.join(dir,'store.json'),'utf8'));
  const paid=store.donations.find(d=>d.id===donation.id);
  assert.equal(paid.status,'paid');
  assert.equal(paid.amountTotal,5000);
  assert.equal(paid.stripePaymentIntentId,'pi_don_test');
  assert.equal(store.orders.length,0);
});
