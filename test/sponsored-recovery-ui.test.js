import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
test('owner can resend pending verification and issue a manual pass with a retained pass link',async()=>{
 const html=fs.readFileSync(new URL('../public/sponsored-admin.html',import.meta.url),'utf8');const script=fs.readFileSync(new URL('../public/sponsored-admin.js',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:'https://example.test/sponsored-admin.html',runScripts:'outside-only'}),w=dom.window;const requests=[];
 const report={publicRemaining:498,allocated:2,invitationsSent:0,claimed:2,guestClaims:1,unclaimedAllocated:0,paidUpgrades:0,disciples:[],byDisciple:[],invitations:[],claims:[],pendingVerifications:[{id:'pending',name:'Guest <unsafe>',email:'guest@example.test',phone:'9195550100',quantity:2,expiresAt:'2026-10-13T00:00:00Z',expired:true,verificationEmail:{status:'failed'}}]};
 w.confirm=()=>true;w.fetch=async(url,options)=>{requests.push({url,body:options?.body&&JSON.parse(options.body)});return {ok:true,json:async()=>options?.method?url.endsWith('/issue')?{emailStatus:'failed',passUrl:'https://kvnlive.com/promo#pass=secret',tickets:[{code:'QR'}]}:{emailStatus:'accepted'}:report};};w.eval(script);await new Promise(r=>setTimeout(r,10));
 const button=w.document.querySelector('#pendingVerifications button');assert.ok(button);button.click();await new Promise(r=>setTimeout(r,10));assert.equal(requests.find(r=>r.url.endsWith('/verification/resend')).body.claimId,'pending');assert.equal(w.document.querySelector('#pendingVerifications unsafe'),null);
 const form=w.document.querySelector('#manualIssue');assert.ok(form);for(const [name,value]of Object.entries({name:'Guest',email:'guest@example.test',phone:'9195550100',quantity:'2'}))form.elements.namedItem(name).value=value;
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,10));assert.equal(requests.find(r=>r.url.endsWith('/issue')).body.quantity,'2');assert.equal(w.document.querySelector('#manualResult a').href,'https://kvnlive.com/promo#pass=secret');assert.match(w.document.querySelector('#manualResult').textContent,/failed/i);dom.window.close();
});
