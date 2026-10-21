import test from 'node:test';
import assert from 'node:assert/strict';
import {closePublicCompOffer,GA_PRODUCT,CLAIM_DEADLINE,ticketCapacity} from '../lib/admission-transition.js';
import {beginClaim,confirmClaim} from '../lib/sponsored-passes.js';
import {synchronizeKvnLive2026Event} from '../lib/kvn-live-2026.js';
import {finalizeOrderItems} from '../lib/finalize.js';
const before=()=>Date.parse('2026-10-20T12:00:00Z');
const input={name:'Guest',email:'guest@example.test',phone:'9195550101',city:'Sanford',state:'NC',zip:'27330',interests:['attend'],discipleCode:'ABC'};
const fixture=()=>({events:[{id:'event',slug:'kingdom-vibe-live-2026',status:'published',products:[{id:'kv-kingdom-pass-2026',type:'ticket',price:3900,inventory:300,sold:2,includedApparel:{mode:'included',name:'Drop 001',sizes:['M']}}]}],disciples:[{id:'amb',code:'ABC',status:'active'}],orders:[]});
test('closing offer preserves expired pending links and original attribution through the event',()=>{
 const s=fixture(),p=beginClaim(s,input,{now:before});const hash=s.sponsoredClaims[0].verificationHash;
 closePublicCompOffer(s);assert.equal(s.sponsoredClaims[0].verificationHash,hash);assert.equal(s.sponsoredClaims[0].expiresAt,CLAIM_DEADLINE);
 assert.throws(()=>beginClaim(s,{...input,email:'new@example.test'}),/closed/i);
 const c=confirmClaim(s,p.verificationToken,{now:()=>Date.parse('2026-11-20T12:00:00Z')});assert.equal(c.discipleId,'amb');assert.equal(s.orders[0].discipleId,'amb');assert.equal(closePublicCompOffer(s),false);
});
test('catalog offers $15 GA without apparel and retains retired product for pending purchases',()=>{
 const s=fixture();synchronizeKvnLive2026Event(s);const e=s.events[0],ga=e.products.find(p=>p.id===GA_PRODUCT),old=e.products.find(p=>p.id==='kv-kingdom-pass-2026');
 assert.equal(ga.price,1500);assert.equal(ga.includedApparel.mode,'none');assert.equal(ga.earlyRelease.enabled,false);assert.equal(old.retired,true);assert.equal(old.sold,2);
 const order={buyerName:'Buyer',items:[{productId:old.id,type:'ticket',name:'Kingdom Pass Bundle',quantity:1,apparelMode:'included',ticketSelections:[{apparelSelected:true,apparelSize:'M'}]}]};
 finalizeOrderItems(order,e,{id:()=> 'ticket',ticketCode:()=> 'code'});assert.equal(order.tickets.length,1);assert.equal(order.tickets[0].includedApparel.size,'M');
 assert.equal(ticketCapacity(e,ga,[{eventId:e.id,status:'pending',checkoutExpiresAt:'2026-11-01T00:00:00Z',items:[{productId:old.id,quantity:4}]}],before()),293);
});

import vm from 'node:vm';
import fs from 'node:fs';
test('public comp landing redirects to GA with referral while excluding private tokens',()=>{
 let destination;vm.runInNewContext(fs.readFileSync(new URL('../public/sponsored.js',import.meta.url),'utf8'),{URL,URLSearchParams,window:{addEventListener(){}},document:{body:{dataset:{discipleRef:'COOKIE'}}},location:{hash:'#ref=AMB123',search:'',replace:u=>{destination=u}}});
 const url=new URL(destination);assert.equal(url.origin,'https://kvnlive.com');assert.equal(url.searchParams.get('offer'),'general-admission');assert.equal(url.searchParams.get('disciple'),'AMB123');assert.equal(url.hash,'');
});
