import test from 'node:test';
import assert from 'node:assert/strict';
import { synchronizeKvnLive2026Event } from '../lib/kvn-live-2026.js';

function fixture() {
  return {
    events: [{
      id: 'evt_kv_live_2026',
      slug: 'kingdom-vibe-live-2026',
      title: 'Old title',
      products: [
        { id: 'ga', type: 'ticket', name: 'General Admission', price: 4900, inventory: 900, sold: 12 },
        { id: 'drop001-black', type: 'apparel', name: 'Old shirt', price: 3800, inventory: 500, sold: 3 }
      ],
      layout: [{ id: 'old', type: 'apparel', title: 'Old apparel block', body: '' }]
    }]
  };
}

test('synchronizes the KVN Live event to the approved two-pass catalog', () => {
  const store = fixture();
  assert.equal(synchronizeKvnLive2026Event(store), true);
  const event = store.events[0];

  assert.equal(event.date, '2026-11-21T14:30:00-05:00');
  assert.deepEqual(event.products.map(product => [product.id, product.name, product.price, product.inventory]), [
    ['kv-all-access-2026', 'Kingdom All-Access Pass', 5900, 600],
    ['kv-kingdom-pass-2026', 'Kingdom Pass', 3900, 400]
  ]);
  assert.match(event.products[0].description, /ROWS 1–18/);
  assert.match(event.products[1].description, /ROWS 19–35/);
  assert.ok(event.products.every(product => product.type === 'ticket'));
  assert.ok(event.products.every(product => product.includedApparel.mode === 'included'));
  assert.ok(event.products.every(product => product.includedApparel.name.includes('Not Self Made')));
  assert.ok(event.products.every(product => product.includedApparel.sizes.includes('XXXXL')));
  assert.deepEqual(event.products.map(product => product.earlyRelease), [
    { enabled: true, discountAmount: 1000, unitLimit: 200 },
    { enabled: true, discountAmount: 1000, unitLimit: 200 }
  ]);
  assert.ok(event.layout.every(block => block.type !== 'apparel'));
  assert.match(event.layout.map(block => block.body).join(' '), /Acts 2:44/);
  assert.match(event.layout.map(block => block.body).join(' '), /event is canceled/i);
});

test('synchronization is idempotent and preserves sales for stable pass IDs', () => {
  const store = fixture();
  synchronizeKvnLive2026Event(store);
  store.events[0].products[0].sold = 7;
  store.events[0].products[1].sold = 4;

  assert.equal(synchronizeKvnLive2026Event(store), false);
  assert.deepEqual(store.events[0].products.map(product => product.sold), [7, 4]);
});

test('does nothing when the target event is absent', () => {
  assert.equal(synchronizeKvnLive2026Event({ events: [] }), false);
});
