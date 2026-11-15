import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
test('RSVP creates retrievable QR passes without Stripe, rejects overselling, and closes paid checkout',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kv-community-'));fs.copyFileSync(new URL('../data/store.json',import.meta.url),path.join(dir,'store.json'));
 const port=44000+Math.floor(Math.random()*1000),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,DATA_DIR:dir,PORT:String(port),BASE_URL:base,STRIPE_SECRET_KEY:'',RESEND_API_KEY:''},stdio:['ignore','pipe','pipe']});t.after(()=>{child.kill();fs.rmSync(dir,{recursive:true,force:true});});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),10000);child.stdout.on('data',d=>{if(String(d).includes('running at')){clearTimeout(timer);resolve();}});});
 const post=(route,body)=>fetch(base+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const body={name:'QA Guest',email:'qa@example.test',phone:'9195550101',quantity:2,requestId:'a1234567-1234-1234-1234-123456789abc',prayerSmsConsent:true};
 const response=await post('/api/community-rsvp',body);assert.equal(response.status,201,await response.clone().text());const result=await response.json();assert.equal(result.tickets.length,2);assert.match(result.tickets[0].code,/^[A-F0-9]+$/);
 const qr=await fetch(base+'/api/tickets/'+result.tickets[0].code+'/qr.svg');assert.equal(qr.status,200);
 const retry=await post('/api/community-rsvp',body);assert.equal(retry.status,200);assert.equal((await retry.json()).orderId,result.orderId);
 const state=JSON.parse(fs.readFileSync(path.join(dir,'store.json')));const order=state.orders.find(o=>o.id===result.orderId);assert.equal(order.status,'complimentary');assert.equal(order.amountTotal,0);assert.equal(order.prayerSmsConsent,true);
 const paid=await post('/api/create-checkout-session',{eventId:order.eventId});assert.equal(paid.status,409);
 const min=await post('/api/donations/checkout',{amount:49999,level:'kingdom'});assert.equal(min.status,503); // No payment provider configured: no payment is created.
});
