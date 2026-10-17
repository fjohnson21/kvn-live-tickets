import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
for(const status of [410,404])test(`expired or replaced proof (${status}) offers fresh email recovery`,async()=>{
 const dom=new JSDOM(fs.readFileSync(new URL('../public/sponsored.html',import.meta.url),'utf8'),{url:'https://kvnlive.com/promo#verify='+ 'a'.repeat(64),runScripts:'outside-only'}),w=dom.window,calls=[];
 w.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return url.endsWith('/confirm')?{ok:false,status,json:async()=>({error:'Verification link expired.'})}:{ok:true,status:202,json:async()=>({message:'Check your inbox for the newest email.'})};};
 w.eval(fs.readFileSync(new URL('../public/sponsored.js',import.meta.url),'utf8'));await new Promise(r=>setTimeout(r,20));
 const recover=w.document.getElementById('recoverVerification');assert.ok(recover);assert.equal(recover.hidden,false);assert.equal(w.document.getElementById('confirm').hidden,true);
 recover.click();await new Promise(r=>setTimeout(r,20));assert.equal(calls[1].url,'/api/sponsored/verification/recover');assert.equal(calls[1].body.verificationToken,'a'.repeat(64));assert.match(w.document.getElementById('notice').textContent,/newest email/);assert.equal(recover.disabled,true);dom.window.close();
});
