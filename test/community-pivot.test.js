import test from 'node:test';
import assert from 'node:assert/strict';
import {synchronizeKvnLive2026Event} from '../lib/kvn-live-2026.js';
test('community pivot closes paid sales without rewriting historical products',()=>{
 const store={events:[{id:'e',slug:'kingdom-vibe-live-2026',products:[{id:'kv-general-admission-2026',type:'ticket',price:1500,sold:4,inventory:104}]}],orders:[]};
 synchronizeKvnLive2026Event(store);const e=store.events[0];
 assert.equal(e.communityRsvp,true);
 assert.equal(e.products.find(p=>p.id==='kv-community-rsvp-2026').price,0);
 assert.equal(e.products.find(p=>p.id==='kv-general-admission-2026').price,1500);
 assert.equal(e.products.find(p=>p.id==='kv-general-admission-2026').salesClosed,true);
 assert.equal(e.date,'2026-11-21T17:00:00-05:00');
 assert.equal(synchronizeKvnLive2026Event(store),false);
});
