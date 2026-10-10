import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {registerMarketingRoutes} from '../lib/marketing-routes.js';
import {createEngagementStore} from '../lib/marketing-engagement.js';
import {ensureMarketing,upsertContact} from '../lib/marketing.js';
test('engagement report is owner-only, paginated and correlated even when event precedes saved message ID',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eng-routes-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const engagement=createEngagementStore({dataDir:dir});
 let disk=ensureMarketing({orders:[{id:'preserved'}]});disk.marketing.campaigns=[{id:'old',status:'complete',recipients:Array.from({length:55},(_,i)=>({id:'r'+i,email:`r${i}@example.com`,status:'accepted',messageId:'m'+i}))}];
 const before=JSON.stringify(disk);engagement.record('opened',{type:'email.opened',created_at:new Date().toISOString(),data:{email_id:'future'}});
 const app=express();app.use(express.json());const server=app.listen(0);t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}`;
 registerMarketingRoutes(app,{engagement,auth:(q,s,n)=>{if(!q.headers.authorization)return s.sendStatus(401);q.user={id:'owner',role:q.headers.authorization};n()},owner:(q,s,n)=>q.user.role==='owner'?n():s.sendStatus(403),readStore:()=>structuredClone(disk),writeStore:d=>disk=d,baseUrl:base,env:{}});
 const req=(suffix='',role='owner')=>fetch(base+'/api/marketing/campaigns/old/engagement'+suffix,{headers:role?{authorization:role}:{}});
 assert.equal((await req('',null)).status,401);assert.equal((await req('','staff')).status,403);
 let res=await req();assert.equal(res.status,200);let report=await res.json();assert.equal(report.recipients.length,50);assert.equal(report.total,55);assert.equal(report.summary.delivered,0);assert.equal(report.summary.openRateEstimate,null);assert.equal((await (await req('?page=2')).json()).recipients.length,5);assert.equal(JSON.stringify(disk),before);
 disk.marketing.campaigns[0].recipients[0].messageId='future';report=await (await req('?event=opened')).json();assert.equal(report.total,1);assert.equal(report.recipients[0].email,'r0@example.com');assert.equal(report.summary.delivered,0);assert.equal(report.summary.opened,1);
});
test('complaints exclude future audiences and skip pending sends without changing consent or orders',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eng-send-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const engagement=createEngagementStore({dataDir:dir});
 let disk=ensureMarketing({orders:[{id:'preserved'}]}),attempts=[];disk.marketing.settings.mailingAddress='123 Synthetic St';
 const a=upsertContact(disk,{email:'a@example.com',permission:'subscribed',evidence:'signup',listIds:['leads']}),b=upsertContact(disk,{email:'b@example.com',permission:'subscribed',evidence:'signup',listIds:['leads']});
 disk.marketing.campaigns=[{id:'old',status:'complete',recipients:[{id:a.id,email:a.email,status:'accepted',messageId:'prior-a'},{id:b.id,email:b.email,status:'accepted',messageId:'prior-b'}]}];
 const complaint=id=>engagement.record(id,{type:'email.complained',created_at:new Date().toISOString(),data:{email_id:id}});
 complaint('prior-a');const app=express();app.use(express.json());const server=app.listen(0);t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}`;
 registerMarketingRoutes(app,{engagement,auth:(q,s,n)=>{q.user={id:'owner'};n()},owner:(q,s,n)=>n(),readStore:()=>structuredClone(disk),writeStore:d=>disk=d,baseUrl:base,env:{RESEND_API_KEY:'fake'},delayMs:0,send:async p=>{attempts.push(p.to);return {status:'accepted',messageId:'sent'}}});
 const req=(url,body)=>fetch(base+url,{method:body?'POST':'GET',headers:{origin:base,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
 const c=await (await req('/api/marketing/campaigns',{subject:'Synthetic',body:'Synthetic',listIds:['leads']})).json(),url='/api/marketing/campaigns/'+c.id;
 const preview=await (await req(url+'/preview')).json();assert.equal(preview.count,1);
 // A fixed in-progress audience must also recheck a new complaint before each send.
 disk.marketing.campaigns[1].status='paused';disk.marketing.campaigns[1].settings=disk.marketing.settings;disk.marketing.campaigns[1].recipients=[{id:b.id,email:b.email,status:'pending'}];complaint('prior-b');
 assert.equal((await req(url+'/send',{})).status,200);assert.equal(attempts.length,0);assert.equal(disk.marketing.campaigns[1].recipients[0].status,'skipped');assert.equal(disk.marketing.contacts[0].permission,'subscribed');assert.equal(disk.marketing.contacts[0].evidence,'signup');assert.deepEqual(disk.orders,[{id:'preserved'}]);
});
