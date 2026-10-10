import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { Webhook } from 'svix';
const module = await import('../lib/marketing-engagement.js').catch(()=>({}));
const secret = 'whsec_'+Buffer.from('synthetic-webhook-secret-32-bytes!').toString('base64');
const event=(type='delivered',messageId='m1',extra={})=>({type:'email.'+type,created_at:'2026-10-10T08:00:00Z',data:{email_id:messageId,...extra}});
function setup(t){assert.equal(typeof module.createEngagementStore,'function','durable engagement store exists');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kvn-engagement-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {dir,store:module.createEngagementStore({dataDir:dir})}}
const campaign={id:'campaign',recipients:[{id:'c1',email:'one@example.com',status:'accepted',messageId:'m1'},{id:'c2',email:'two@example.com',status:'accepted',messageId:'m2'},{id:'c3',email:'old@example.com',status:'accepted'}]};
test('durable deduplication, out-of-order events, unknown IDs, historical preservation and honest rates',t=>{
 const {dir,store}=setup(t),before=JSON.stringify(campaign);
 store.record('open1',event('opened'));store.record('click1',event('clicked','m1',{click:{link:'https://kvnlive.com/affiliate/secret?token=secret#secret',ipAddress:'private'}}));
 store.record('delivered1',event());assert.equal(store.record('delivered1',event()).duplicate,true);
 store.record('outside',event('delivered','not-a-campaign'));
 const report=store.report(campaign);assert.equal(report.summary.accepted,3);assert.equal(report.summary.delivered,1);assert.equal(report.summary.opened,1);assert.equal(report.summary.clicked,1);assert.equal(report.summary.withoutEvents,2);assert.equal(report.summary.openRateEstimate,100);assert.ok(Math.abs(report.summary.deliveryRate-100/3)<1e-10);assert.equal(report.recipients[0].engagement.events.length,3);assert.equal(report.recipients[1].engagement.delivery,'unconfirmed');assert.equal(JSON.stringify(campaign),before);
 const reopened=module.createEngagementStore({dataDir:dir});assert.deepEqual(reopened.report(campaign),report);assert.equal(reopened.record('open1',event('opened')).duplicate,true);
 assert.equal(JSON.stringify(report).includes('token=secret'),false);assert.equal(JSON.stringify(report).includes('ipAddress'),false);
 assert.equal(reopened.report({recipients:[{status:'accepted',messageId:'not-a-campaign'}]}).summary.delivered,1);
 assert.equal(store.report({recipients:[]}).summary.openRateEstimate,null);
});
test('bounces and complaints remain blocking despite later delivery; no contact permission rewrites',t=>{
 const {store}=setup(t);store.record('bounce',event('bounced'));store.record('late',event());store.record('complaint',event('complained','m2'));
 const data={marketing:{campaigns:[campaign],contacts:[{email:'one@example.com',permission:'unsubscribed',evidence:'original'}]},orders:[{id:'unchanged'}]};const before=JSON.stringify(data);
 assert.deepEqual([...store.blockedEmails(data)].sort(),['one@example.com','two@example.com']);assert.equal(store.report(campaign).recipients[0].engagement.delivery,'bounced');assert.equal(JSON.stringify(data),before);
});
test('journal recovers only incomplete tail and rejects corruption or persistence failure',t=>{
 const {dir,store}=setup(t);store.record('first',event());const file=path.join(dir,'marketing-engagement.ndjson');fs.appendFileSync(file,'{"incomplete":');const next=module.createEngagementStore({dataDir:dir});assert.equal(next.report(campaign).summary.delivered,1);next.record('next',event('opened'));assert.equal(module.createEngagementStore({dataDir:dir}).report(campaign).summary.opened,1);
 fs.appendFileSync(file,'broken\n');assert.throws(()=>module.createEngagementStore({dataDir:dir}));
});
test('raw signed webhook rejects forgery, stale replay, malformed events; retries and restarts are idempotent',async t=>{
 const {store}=setup(t);const app=express();module.registerEngagementWebhook(app,{store,env:{RESEND_MARKETING_WEBHOOK_SECRET:secret}});app.use(express.json());const server=app.listen(0);t.after(()=>server.close());const url=`http://127.0.0.1:${server.address().port}/api/webhooks/resend/marketing`;
 const send=async(payload,id='evt',date=new Date(),signature)=>{const body=typeof payload==='string'?payload:JSON.stringify(payload);return fetch(url,{method:'POST',headers:{'content-type':'application/json','svix-id':id,'svix-timestamp':String(Math.floor(date.getTime()/1000)),'svix-signature':signature||new Webhook(secret).sign(id,date,body)},body})};
 assert.equal((await send(event(),'bad',new Date(),'v1,forged')).status,400);assert.equal((await send(event(),'stale',new Date(Date.now()-600000))).status,400);
 assert.equal((await send(event(),'future',new Date(Date.now()+600000))).status,400);
 assert.equal((await send('{bad','malformed')).status,400);assert.equal((await send({type:'email.delivered',data:{email_id:'m1'}},'invalid')).status,400);
 assert.equal((await send(event())).status,200);assert.equal((await send(event())).status,200);assert.equal(store.report(campaign).summary.delivered,1);
 assert.equal((await send({...event(),type:'email.received'},'unsupported')).status,200);
 assert.equal((await send(event('opened'),'evt')).status,409);
 assert.equal((await send('x'.repeat(270000),'large')).status,413);
});
test('webhook returns unavailable without secret and failure when durable write fails',async t=>{
 setup(t);for(const env of [{},{RESEND_MARKETING_WEBHOOK_SECRET:secret}]){const app=express();module.registerEngagementWebhook(app,{store:{record(){throw Error('disk failure')}},env});const server=app.listen(0);t.after(()=>server.close());const body=JSON.stringify(event()),date=new Date();const res=await fetch(`http://127.0.0.1:${server.address().port}/api/webhooks/resend/marketing`,{method:'POST',headers:{'content-type':'application/json','svix-id':'evt','svix-timestamp':String(Math.floor(date.getTime()/1000)),'svix-signature':new Webhook(secret).sign('evt',date,body)},body});assert.equal(res.status,env.RESEND_MARKETING_WEBHOOK_SECRET?503:503)}
});
test('recovery suppression follows original recipient after the cart email changes',t=>{
 const {store}=setup(t);store.record('recovery-bounce',event('bounced','recovery-id'));
 const data={abandonedCarts:[{email:'edited@example.com',recoveryEmail:{to:'original@example.com',messageId:'recovery-id'}},{email:'unverified-legacy@example.com',recoveryEmail:{messageId:'recovery-id'}}]};
 assert.deepEqual([...store.blockedEmails(data)],['original@example.com']);
});
test('partial append and fsync failures do not advance indexes and allow a safe retry',t=>{
 const {dir,store}=setup(t),file=path.join(dir,'marketing-engagement.ndjson');store.record('first',event());const before=fs.readFileSync(file,'utf8');
 const write=fs.writeFileSync;
 const fakeWrite=t.mock.method(fs,'writeFileSync',(fd,data,...rest)=>{if(typeof fd==='number'){write(fd,String(data).slice(0,10),...rest);throw Error('partial disk write')}return write(fd,data,...rest)});
 assert.throws(()=>store.record('retry',event('opened')),/partial disk write/);fakeWrite.mock.restore();assert.equal(fs.readFileSync(file,'utf8'),before);assert.equal(store.report(campaign).summary.opened,0);
 let calls=0;const sync=fs.fsyncSync;const fakeSync=t.mock.method(fs,'fsyncSync',fd=>{if(calls++===0)throw Error('fsync failed');return sync(fd)});
 assert.throws(()=>store.record('retry',event('opened')),/fsync failed/);fakeSync.mock.restore();assert.equal(fs.readFileSync(file,'utf8'),before);assert.equal(store.report(campaign).summary.opened,0);
 store.record('retry',event('opened'));assert.equal(module.createEngagementStore({dataDir:dir}).report(campaign).summary.opened,1);
});
test('failed rollback makes subsequent sends and ingestion fail closed',t=>{
 const {store}=setup(t);const fakeSync=t.mock.method(fs,'fsyncSync',()=>{throw Error('disk unavailable')});
 assert.throws(()=>store.record('retry',event()));fakeSync.mock.restore();assert.throws(()=>store.record('next',event()),/unavailable/);assert.throws(()=>store.blockedEmails({}),/unavailable/);
});
