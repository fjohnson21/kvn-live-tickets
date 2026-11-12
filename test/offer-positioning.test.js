import test from 'node:test';
import assert from 'node:assert/strict';
import {synchronizeKvnLive2026Event} from '../lib/kvn-live-2026.js';
import {allocateEarlyRelease} from '../lib/checkout.js';
test('current offers are Premier and GA without apparel, with original bundle sold out',()=>{
 const s={events:[{slug:'kingdom-vibe-live-2026',products:[]}]};synchronizeKvnLive2026Event(s);const e=s.events[0],active=e.products.filter(p=>!p.salesClosed&&!p.retired);
 assert.deepEqual(active.map(p=>[p.name,p.price,p.includedApparel.mode]),[['Kingdom Premier',3999,'none'],['General Admission',1500,'none']]);
 assert.equal(allocateEarlyRelease(active[0],2).subtotal,7998);assert.equal(allocateEarlyRelease(active[1],2).subtotal,3000);assert.match(e.layout.find(b=>b.id==='kv-wear').body,/sold out/);
});
