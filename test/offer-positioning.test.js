import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { synchronizeKvnLive2026Event } from '../lib/kvn-live-2026.js';

function offerEvent() {
  const store = { events: [{ id: 'evt_kv_live_2026', slug: 'kingdom-vibe-live-2026', products: [] }] };
  synchronizeKvnLive2026Event(store);
  return store.events[0];
}

test('positions the event offer as a shirt purchase with Kingdom Vibe Live access', () => {
  const event = offerEvent();
  const phrase = 'Your tee purchase grants you a complimentary Kingdom Vibe Live pass.';

  assert.match(event.description, /Get the official Drop 001/i);
  assert.match(event.description, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok(event.products.every(product => product.description.includes(phrase)));
  assert.match(event.layout.find(block => block.type === 'tickets').title, /Choose Your Shirt and Experience/i);
  assert.match(event.layout.find(block => block.id === 'kv-wear').body, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('uses limited early prices before the automatic tier increase', async () => {
  const event = offerEvent();
  const source = await readFile(new URL('../public/event.js', import.meta.url), 'utf8');

  assert.deepEqual(event.products.map(product => product.price), [4900, 3900]);
  assert.ok(event.products.every(product => product.earlyRelease.enabled === true && product.earlyRelease.discountAmount === 1000));
  assert.ok(event.products.every(product => product.earlyRelease.unitLimit === 200));
  assert.match(source, /Purchase Pass/);
  assert.match(source, /Comp Ticket included/);
  assert.doesNotMatch(source, /Claim My Comp Pass/);
  assert.match(source, /THE BUNDLE OFFER/);
  assert.match(source, /Applied automatically/);
  assert.doesNotMatch(source, />Get Tickets</);
  assert.doesNotMatch(source, />Select Pass</);
});

test('both tiers raise exactly $10 after 200 and preserve historical orders', async () => {
  const { allocateEarlyRelease } = await import('../lib/checkout.js');
  const event = offerEvent();
  for (const [index, p] of event.products.entries()) {
    const early = index === 0 ? 3900 : 2900;
    assert.equal(allocateEarlyRelease(p, 1).subtotal, early);
    assert.equal(allocateEarlyRelease({...p,sold:199}, 2).subtotal, early + early + 1000);
    assert.equal(allocateEarlyRelease({...p,sold:200}, 1).subtotal, early + 1000);
    assert.equal(allocateEarlyRelease({...p,sold:199}, 1, 1).subtotal, early + 1000);
  }
  const orders = [{id:'existing',amountTotal:1234,status:'paid',tickets:[{code:'KEEP'}]}];
  const store = {events:[event],orders}; const before = JSON.stringify(orders);
  synchronizeKvnLive2026Event(store);
  assert.equal(JSON.stringify(store.orders),before);
});
