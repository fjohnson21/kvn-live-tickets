import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Stripe from 'stripe';
import {createOwnerPasswordStore} from '../lib/owner-auth.js';

test('Briannah-style affiliate journey resolves, survives checkout, earns 10%, and appears in dashboard', async t => {
  const root=new URL('../',import.meta.url),dir=fs.mkdtempSync(path.join(os.tmpdir(),'kvn-affiliate-e2e-'));
  const storePath=path.join(dir,'store.json');
  fs.copyFileSync(new URL('../data/store.json',import.meta.url),storePath);
  const seed=JSON.parse(fs.readFileSync(storePath,'utf8'));
  seed.disciples ||= [];
  seed.discipleCommissions ||= [];
  seed.disciplePayouts ||= [];
  seed.discipleCommunityBonuses ||= [];
  seed.discipleTeams ||= [];
  seed.discipleBundleActions ||= [];
  seed.auditLogs ||= [];
  seed.disciples.push({
    id:'dsc_briannah_test',
    name:'Briannah Cooper',
    email:'briannah@example.com',
    code:'BRIANNAHCOOPER',
    handle:'briannahcooper',
    handleAliases:[],
    status:'active',
    organizationId:'org_kvn',
    defaultCommissionPercent:10,
    eventRates:[],
    payoutMethod:'manual',
    createdAt:'2026-10-03T00:00:00.000Z'
  });
  fs.writeFileSync(storePath,JSON.stringify(seed,null,2));
  createOwnerPasswordStore({dataDir:dir,bootstrapPassword:'test-only-password-123'});

  const sessionsUrl=new URL('../node_modules/stripe/esm/resources/Checkout/Sessions.js',import.meta.url).href;
  const preload=path.join(dir,'providers.mjs');
  fs.writeFileSync(preload,`import {Sessions} from ${JSON.stringify(sessionsUrl)};import fs from 'node:fs';
let count=0;Sessions.prototype.create=async function(config){const id='cs_aff_'+(++count);fs.appendFileSync(${JSON.stringify(path.join(dir,'stripe.jsonl'))},JSON.stringify({id,config})+'\\n');return {id,url:'https://checkout.example.test/'+id};};
const originalFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>{if(String(url)==='https://api.resend.com/emails'){fs.appendFileSync(${JSON.stringify(path.join(dir,'emails.jsonl'))},JSON.stringify(JSON.parse(options.body))+'\\n');return {ok:true,json:async()=>({id:'email_aff_test'})};}return originalFetch(url,options);};`);

  const port=41000+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['--import',preload,'server.js'],{
    cwd:root,
    env:{...process.env,PORT:String(port),BASE_URL:base,AFFILIATE_PUBLIC_BASE_URL:'https://kvnlive.com/affiliate',DATA_DIR:dir,OWNER_EMAIL:'owner@example.com',RESEND_API_KEY:'test_only',STRIPE_SECRET_KEY:'sk_test_local_only',STRIPE_WEBHOOK_SECRET:'whsec_test_only'},
    stdio:['ignore','pipe','pipe']
  });
  t.after(()=>{child.kill();fs.rmSync(dir,{recursive:true,force:true});});
  let stderr='';child.stderr.on('data',c=>stderr+=c);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(stderr||'startup timeout')),5000);child.stdout.on('data',c=>{if(String(c).includes('running at')){clearTimeout(timer);resolve();}});child.on('exit',()=>{clearTimeout(timer);reject(Error(stderr));});});

  const affiliate=await fetch(base+'/api/affiliates/briannahcooper');
  assert.equal(affiliate.status,200);
  const affiliateIdentity=await affiliate.json();
  assert.equal(affiliateIdentity.handle,'briannahcooper');
  assert.equal(affiliateIdentity.code,'BRIANNAHCOOPER');

  const legacyEntry=await fetch(base+'/affiliate/briannahcooper',{redirect:'manual'});
  assert.equal(legacyEntry.status,302);
  assert.equal(legacyEntry.headers.get('location'),'https://kvnlive.com/affiliate/briannahcooper');

  const event=(await (await fetch(base+'/api/events/kingdom-vibe-live-2026')).json()).event;
  const product=event.products.find(p=>p.type==='ticket'&&p.available>0);
  assert.ok(product,'Expected an available KVN ticket product');

  const customer={name:'Affiliate Test Buyer',email:'affiliate-buyer@example.com',cellPhone:'9195550100',billingAddress:{line1:'1 Test St',city:'Sanford',state:'NC',postalCode:'27330',country:'US'},mailingSameAsBilling:true,mailingAddress:{line1:'1 Test St',city:'Sanford',state:'NC',postalCode:'27330',country:'US'}};
  const checkout=await fetch(base+'/api/create-checkout-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId:event.id,discipleCode:affiliateIdentity.code,customer,cart:[{id:product.id,quantity:1,ticketSelections:[{apparelSelected:true,apparelSize:'M'}]}]})});
  assert.equal(checkout.status,200,await checkout.clone().text());
  const stripeSession=JSON.parse(fs.readFileSync(path.join(dir,'stripe.jsonl'),'utf8').trim().split('\n').at(-1));
  assert.equal(stripeSession.config.metadata.disciple_code,'BRIANNAHCOOPER');

  let store=JSON.parse(fs.readFileSync(storePath,'utf8'));
  const pending=store.orders.find(o=>o.stripeSessionId===stripeSession.id);
  assert.equal(pending.discipleId,'dsc_briannah_test');
  assert.equal(pending.discipleCode,'BRIANNAHCOOPER');

  const eventBody=JSON.stringify({id:'evt_affiliate_test',type:'checkout.session.completed',data:{object:{id:stripeSession.id,payment_status:'paid',payment_intent:'pi_affiliate_test',metadata:stripeSession.config.metadata,customer_details:{email:customer.email,name:customer.name}}}});
  const stripe=new Stripe('sk_test_local_only');
  const signature=stripe.webhooks.generateTestHeaderString({payload:eventBody,secret:'whsec_test_only'});
  const paid=await fetch(base+'/api/webhook',{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':signature},body:eventBody});
  assert.equal(paid.status,200,await paid.clone().text());

  store=JSON.parse(fs.readFileSync(storePath,'utf8'));
  const order=store.orders.find(o=>o.id===pending.id);
  const commission=store.discipleCommissions.find(c=>c.orderId===order.id);
  assert.equal(order.status,'paid');
  assert.ok(commission,'Expected a commission for the affiliate order');
  assert.equal(commission.discipleId,'dsc_briannah_test');
  assert.equal(commission.ratePercent,10);
  assert.equal(commission.eligibleBase,Math.max(0,order.amountSubtotal-order.discountAmount));
  assert.equal(commission.amount,Math.round(commission.eligibleBase*0.10));
  assert.equal(commission.status,'pending');

  const login=await fetch(base+'/api/auth/owner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.com',password:'test-only-password-123'})});
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const dashboard=await (await fetch(base+'/api/dashboard',{headers:{cookie}})).json();
  assert.ok(dashboard.disciples.some(d=>d.id==='dsc_briannah_test'&&d.handle==='briannahcooper'));
  assert.ok(dashboard.discipleCommissions.some(c=>c.id===commission.id&&c.amount===commission.amount&&c.status==='pending'));
});
