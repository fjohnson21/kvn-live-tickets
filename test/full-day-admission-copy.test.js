import test from 'node:test';
import assert from 'node:assert/strict';
import {synchronizeKvnLive2026Event} from '../lib/kvn-live-2026.js';
import {GA_PRODUCT} from '../lib/admission-transition.js';

test('GA catalog describes full-day access without changing admission or apparel accounting', () => {
  const order = {id: 'historical', total: 3900, items: [{productId: 'kv-kingdom-pass-2026', unitPrice: 3900}]};
  const store = {events: [{id: 'event', slug: 'kingdom-vibe-live-2026', products: [
    {id: GA_PRODUCT, sold: 7},
    {id: 'kv-all-access-2026', sold: 9},
    {id: 'kv-kingdom-pass-2026', sold: 2, price: 3900}
  ]}], orders: [order]};
  const historical = JSON.stringify(store.orders);
  synchronizeKvnLive2026Event(store);
  const event = store.events[0], ga = event.products.find(p => p.id === GA_PRODUCT);
  assert.match(ga.description, /2:30 PM/);
  assert.match(ga.description, /Trailblazer Awards/);
  assert.match(ga.description, /6[: ]?00? PM|6 PM/);
  assert.equal(ga.price, 1500);
  assert.equal(ga.includedApparel.mode, 'none');
  assert.equal(ga.sold, 7);
  assert.equal(event.products.find(p => p.id === 'kv-all-access-2026').sold, 9);
  assert.equal(event.products.find(p => p.id === 'kv-kingdom-pass-2026').retired, true);
  assert.equal(JSON.stringify(store.orders), historical);
  assert.match(event.layout.find(b => b.id === 'kv-tickets').body, /Every ticket level includes the entire day/);
  assert.equal(synchronizeKvnLive2026Event(store), false);
});
