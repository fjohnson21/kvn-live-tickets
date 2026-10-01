import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Stripe from 'stripe';
import {createOwnerPasswordStore} from '../lib/owner-auth.js';

test('both tiers ignore retired partner tracking while payment and fulfillment remain idempotent',async t=>{
 const root=new URL('../',import.meta.url),dir=fs.mkdtempSync(path.join(os.tmpdir(),'kvn-links-'));
 fs.copyFileSync(new URL('../data/store.json',import.meta.url),path.join(dir,'store.json'));
 createOwnerPasswordStore({dataDir:dir,bootstrapPassword:'test-only-password-123'});
 // Replace the external Stripe and email boundaries only inside this test child process.
 const sessionsUrl=new URL('../node_modules/stripe/esm/resources/Checkout/Sessions.js',import.meta.url).href;
 const preload=path.join(dir,'providers.mjs');
 fs.writeFileSync(preload,`import {Sessions} from ${JSON.stringify(sessionsUrl)};import fs from 'node:fs';
 let count=0;Sessions.prototype.create=async function(config){const id='cs_test_'+(++count);fs.appendFileSync(${JSON.stringify(path.join(dir,'stripe.jsonl'))},JSON.stringify({id,config})+'\\n');return {id,url:'https://checkout.example.test/'+id};};
 const originalFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>{if(String(url)==='https://api.resend.com/emails'){fs.appendFileSync(${JSON.stringify(path.join(dir,'emails.jsonl'))},JSON.stringify(JSON.parse(options.body))+'\\n');return {ok:true,json:async()=>({id:'email_test'})};}return originalFetch(url,options);};`);
 const port=39000+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['--import',preload,'server.js'],{cwd:root,env:{...process.env,PORT:String(port),BASE_URL:base,DATA_DIR:dir,OWNER_EMAIL:'owner@example.com',RESEND_API_KEY:'test_only',STRIPE_SECRET_KEY:'sk_test_local_only',STRIPE_WEBHOOK_SECRET:'whsec_test_only'},stdio:['ignore','pipe','pipe']});
 t.after(()=>{child.kill();fs.rmSync(dir,{recursive:true,force:true});});
 let stderr='';child.stderr.on('data',c=>stderr+=c);
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(stderr||'startup timeout')),5000);child.stdout.on('data',c=>{if(String(c).includes('running at')){clearTimeout(timer);resolve();}});child.on('exit',()=>{clearTimeout(timer);reject(Error(stderr));});});
 const post=(route,body,cookie)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
 const login=await post('/api/auth/owner',{email:'owner@example.com',password:'test-only-password-123'});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const event=(await (await fetch(base+'/api/events/kingdom-vibe-live-2026')).json()).event;
 const customer={name:'Test Buyer',email:'buyer@example.com',cellPhone:'9195550100',billingAddress:{line1:'1 Billing St',city:'Sanford',state:'NC',postalCode:'27330',country:'US'},mailingSameAsBilling:false,mailingAddress:{line1:'2 Shipping St',city:'Sanford',state:'NC',postalCode:'27330',country:'US'}};
 for(const productId of ['kv-all-access-2026','kv-kingdom-pass-2026']){
  const checkout=await post('/api/create-checkout-session',{eventId:event.id,partnerCode:' chanel ',customer,cart:[{id:productId,quantity:2,ticketSelections:[{apparelSelected:true,apparelSize:'M'},{apparelSelected:true,apparelSize:'L'}]}]});assert.equal(checkout.status,200,JSON.stringify(await checkout.clone().json()));
  const session=JSON.parse(fs.readFileSync(path.join(dir,'stripe.jsonl'),'utf8').trim().split('\n').at(-1));assert.equal(session.config.metadata.partner_code,undefined);assert.equal(session.config.payment_intent_data.metadata.partner_code,undefined);assert.equal(session.config.metadata.disciple_code,'');assert.deepEqual(session.config.discounts,[]);
  let store=JSON.parse(fs.readFileSync(path.join(dir,'store.json'),'utf8'));const pending=store.orders.find(o=>o.stripeSessionId===session.id);assert.equal(pending.status,'pending');assert.equal(pending.tickets.length,0);assert.equal(pending.partnerCode,undefined);assert.equal(pending.tags,undefined);assert.equal(pending.amountSubtotal,productId.includes('all-access')?7800:5800);assert.equal(pending.customer.mailingAddress.line1,'2 Shipping St');
  const eventBody=JSON.stringify({id:'evt_'+session.id,type:'checkout.session.completed',data:{object:{id:session.id,payment_status:'paid',payment_intent:'pi_'+session.id,metadata:session.config.metadata}}});
  const stripe=new Stripe('sk_test_local_only'),signature=stripe.webhooks.generateTestHeaderString({payload:eventBody,secret:'whsec_test_only'});
  const notify=()=>fetch(base+'/api/webhook',{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':signature},body:eventBody});
  const deliveries=await Promise.all([notify(),notify()]);assert.ok(deliveries.every(r=>r.status===200));
  store=JSON.parse(fs.readFileSync(path.join(dir,'store.json'),'utf8'));const paid=store.orders.find(o=>o.id===pending.id);assert.equal(paid.status,'paid');assert.equal(paid.tickets.length,2);assert.equal(paid.confirmationEmail.status,'sent');assert.equal(paid.fulfillmentEmail.status,'sent');assert.equal(paid.discipleCode,'');
  const unauthorized=await post('/api/orders/'+paid.id+'/ship',{carrier:'UPS',trackingNumber:'TEST123'});assert.equal(unauthorized.status,401);
  const shipment=await post('/api/orders/'+paid.id+'/ship',{carrier:'UPS',trackingNumber:'TEST123'},cookie);assert.equal(shipment.status,200);assert.equal((await shipment.json()).shipmentEmail.status,'sent');
 }
 const dashboard=await (await fetch(base+'/api/dashboard',{headers:{cookie}})).json();const orders=dashboard.orders.filter(o=>o.buyerEmail===customer.email);assert.equal(orders.length,2);assert.ok(orders.every(o=>o.bundleFulfillment.complete));
 const report=await (await fetch(base+`/api/events/${event.id}/attendees.csv`,{headers:{cookie}})).text();assert.doesNotMatch(report,/Partner Code|CHANEL/);assert.match(report,/TEST123/);
 const referralReport=await fetch(base+'/api/partner-orders.csv?partner=CHANEL',{headers:{cookie}});assert.equal(referralReport.status,404);
 const emails=fs.readFileSync(path.join(dir,'emails.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.equal(emails.length,6);assert.ok(emails.filter(m=>m.subject.includes('Paid bundle')).every(m=>!m.text.includes('CHANEL')&&m.text.includes('Size M')&&m.text.includes('2 Shipping St')));
 const bad=await post('/api/create-checkout-session',{eventId:event.id,partnerCode:'INVALID'});assert.equal(bad.status,400);
});
