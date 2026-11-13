import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import express from 'express';
import {registerMemberRoutes} from '../lib/member-routes.js';
test('verified customer activation uses one login, scopes personal data and denies Disciple privileges',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kvn-personal-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const store={orders:[{id:'mine',buyerEmail:'buyer@example.com',status:'pending',stripeSessionId:'cs_live_mine',items:[{name:'General Admission',quantity:2}]}],disciples:[]};let retrieves=0;
 const app=express();app.use(express.json());const auth=registerMemberRoutes(app,{dataDir:dir,readStore:()=>store,baseUrl:'https://kvnlive.com',mailConfigured:true,sendMail:async()=>{},stripe:{checkout:{sessions:{retrieve:async()=>{retrieves++;return {metadata:{order_id:'mine'},status:'open',payment_status:'unpaid',url:'https://checkout.stripe.com/test'}}}}}});
 const server=app.listen(0);t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 assert.equal(auth.authenticate('not verified'),null);const reset=auth.issueReset('buyer@example.com');await auth.completeReset({token:reset.token,username:'buyer',password:'secure test passphrase 123'});const session=await auth.login('buyer','secure test passphrase 123');assert.equal(auth.authenticate(session.token).disciple,null);
 const headers={cookie:'__Host-kvn_member='+session.token,origin:'https://kvnlive.com','x-kvn-member':'1','content-type':'application/json'};
 const d=await (await fetch(base+'/api/member/personal',{headers})).json();assert.equal(d.carts.length,1);assert.equal(d.carts[0].items[0].quantity,2);assert.equal(d.profile.isDisciple,false);
 assert.equal((await fetch(base+'/api/member/dashboard',{headers})).status,403);assert.equal((await fetch(base+'/api/member/earnings.csv',{headers})).status,403);
 assert.equal((await fetch(base+'/api/member/resume',{method:'POST',headers,body:JSON.stringify({orderId:'notmine'})})).status,409);assert.equal(retrieves,0);
 assert.equal((await fetch(base+'/api/member/resume',{method:'POST',headers,body:JSON.stringify({orderId:'mine'})})).status,200);assert.equal(retrieves,1);
 const bad={...headers,origin:'https://evil.example'};assert.equal((await fetch(base+'/api/member/resume',{method:'POST',headers:bad,body:'{}'})).status,403);
 assert.equal((await fetch(base+'/api/member/personal')).status,401);assert.equal(store.orders.length,1);assert.equal(store.orders[0].status,'pending');
});
