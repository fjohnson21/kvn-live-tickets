import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {registerMemberRoutes} from '../lib/member-routes.js';
test('member HTTP authentication, CSRF, scope, reset delivery and logout',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kvn-member-route-'));const store={disciples:[{id:'a',email:'a@example.com',name:'Alice',handle:'alice',status:'active'},{id:'b',email:'b@example.com',name:'Bob',handle:'bob',status:'active'}],discipleCommissions:[{id:'private-b',discipleId:'b',amount:9999}]};let delivered;
 const app=express();app.use(express.json());registerMemberRoutes(app,{dataDir:dir,readStore:()=>store,baseUrl:'https://kvnlive.com',sendMail:async mail=>{delivered=mail;return {ok:true};},mailConfigured:true});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.close();fs.rmSync(dir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`;const headers={'content-type':'application/json',origin:'https://kvnlive.com','x-kvn-member':'1'};const post=(route,body,extra={})=>fetch(base+'/api/member/'+route,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)});
 assert.equal((await fetch(base+'/api/member/dashboard')).status,401);
 assert.equal((await post('login',{}, {origin:'https://evil.example'})).status,403);
 assert.equal((await post('login',{}, {'x-kvn-member':''})).status,403);
 let r=await post('request-reset',{email:'a@example.com'});assert.equal(r.status,202);const generic=await r.json();await new Promise(r=>setImmediate(r));assert.equal(delivered.email,'a@example.com');
 r=await post('request-reset',{email:'unknown@example.com'});assert.deepEqual(await r.json(),generic);
 const token=new URL(delivered.url).hash.slice('#token='.length);r=await post('complete-reset',{token,username:'alice',password:'a strong password 12345'});assert.equal(r.status,200);
 r=await post('login',{identifier:'alice',password:'a strong password 12345'});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie');assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);assert.ok(!JSON.stringify(await r.json()).includes('token'));
 r=await fetch(base+'/api/member/dashboard?discipleId=b',{headers:{cookie}});assert.equal(r.status,200);const data=await r.json();assert.equal(data.profile.id,'a');assert.equal(data.earnings.length,0);assert.match(r.headers.get('cache-control'),/no-store/);
 r=await post('logout',{}, {cookie});assert.equal(r.status,200);assert.equal((await fetch(base+'/api/member/dashboard',{headers:{cookie}})).status,401);
});
