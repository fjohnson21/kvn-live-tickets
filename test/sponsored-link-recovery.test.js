import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import * as passes from '../lib/sponsored-passes.js';
const guest={name:'Guest',email:'guest@example.test',phone:'9195550100',city:'Sanford',state:'NC',zip:'27330',interests:['attend'],quantity:2};
const seed=()=>({events:[{id:'ev',slug:'kingdom-vibe-live-2026',status:'published',organizationId:'org',products:[]}],orders:[],disciples:[]});
test('verification remains usable the next day and expires after 48 hours',()=>{
 const s=seed(),p=passes.beginClaim(s,guest,{now:()=>0});
 assert.equal(Date.parse(s.sponsoredClaims[0].expiresAt),48*3600000);
 passes.confirmClaim(s,p.verificationToken,{now:()=>24*3600000});assert.equal(s.orders.length,1);
 const expired=seed(),q=passes.beginClaim(expired,guest,{now:()=>0});assert.throws(()=>passes.confirmClaim(expired,q.verificationToken,{now:()=>48*3600000}),/expired/);
});
test('expired link recovery rotates proof, preserves claim and attribution, and limits retries',()=>{
 const s=seed(),p=passes.beginClaim(s,guest,{now:()=>0}),c=s.sponsoredClaims[0];c.discipleId='disciple-original';c.expiresAt=new Date(1000).toISOString();
 const recovered=passes.recoverVerification(s,p.verificationToken,{now:()=>3600000});
 assert.equal(recovered.claimId,c.id);assert.equal(c.discipleId,'disciple-original');assert.equal(c.quantity,2);assert.equal(s.orders.length,0);
 assert.throws(()=>passes.confirmClaim(s,p.verificationToken,{now:()=>3600000}),/not found/);
 assert.throws(()=>passes.recoverVerification(s,p.verificationToken,{now:()=>3600001}),/wait/i);
 const again=passes.recoverVerification(s,p.verificationToken,{now:()=>4200001});
 assert.throws(()=>passes.confirmClaim(s,recovered.verificationToken,{now:()=>4200001}),/not found/);
 passes.confirmClaim(s,again.verificationToken,{now:()=>4200001});assert.equal(s.orders.length,1);assert.equal(s.orders[0].discipleId,'disciple-original');
 assert.throws(()=>passes.recoverVerification(s,p.verificationToken,{now:()=>4800002}),/completed|claimed/i);
});
test('unknown and older than seven day links cannot recover or change a claim',()=>{
 const s=seed(),p=passes.beginClaim(s,guest,{now:()=>0}),before=JSON.stringify(s);
 assert.throws(()=>passes.recoverVerification(s,'x'.repeat(64),{now:()=>3600000}),/not found/);
 assert.throws(()=>passes.recoverVerification(s,p.verificationToken,{now:()=>10*86400000}),/event team/i);
 assert.equal(JSON.stringify(s),before);
});
test('public recovery sends only to the original email and never issues tickets',async t=>{
 const {registerSponsoredRoutes}=await import('../lib/sponsored-routes.js');let s=seed();const p=passes.beginClaim(s,guest);s.sponsoredClaims[0].expiresAt=new Date(Date.now()-1000).toISOString();
 const app=express();app.use(express.json());const mails=[];registerSponsoredRoutes(app,{auth:(q,r)=>r.sendStatus(401),owner:(q,r)=>r.sendStatus(403),readStore:()=>structuredClone(s),writeStore:d=>s=structuredClone(d),baseUrl:'https://kvnlive.com',claimPageUrl:'https://kvnlive.com/promo',sendMail:async m=>{mails.push(m);return {id:'provider-id'};}});
 const server=app.listen(0);t.after(()=>server.close());await new Promise(r=>server.once('listening',r));const endpoint='http://127.0.0.1:'+server.address().port+'/api/sponsored/verification/recover';
 const post=(body,origin='https://kvnlive.com')=>fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});
 assert.equal((await post({verificationToken:p.verificationToken},'https://foreign.test')).status,403);
 const result=await post({verificationToken:p.verificationToken,email:'attacker@example.test'});assert.equal(result.status,202);const body=await result.json();assert.equal(body.verificationToken,undefined);assert.equal(body.accessToken,undefined);
 assert.equal(mails[0].to,guest.email);assert.match(mails[0].text,/48 hours/);assert.equal(s.orders.length,0);
 assert.equal((await post({verificationToken:p.verificationToken})).status,429);assert.equal(mails.length,1);
});
