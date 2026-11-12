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
    ['kv-kingdom-premier-2026', 'Kingdom Premier', 3999, 100],
    ['kv-general-admission-2026', 'General Admission', 1500, 100],
    ['kv-all-access-2026', 'Kingdom Pass', 3900, 100]
  ]);
  assert.match(event.products[0].description, /Rows 1–5/);
  assert.match(event.products[1].description, /Full-day admission/);
  assert.ok(event.products.every(product => product.type === 'ticket'));
  assert.equal(event.products[0].includedApparel.mode,'none');assert.equal(event.products[1].includedApparel.mode,'none');
  assert.ok(event.products.filter(p=>p.includedApparel.mode==='included').every(product => product.includedApparel.name.includes('Not Self Made')));
  assert.ok(event.products.filter(p=>p.includedApparel.mode==='included').every(product => product.includedApparel.sizes.includes('XXXXL')));
  assert.deepEqual(event.products.map(product => product.earlyRelease), [
    { enabled: false },
    { enabled: false },
    { enabled: true, discountAmount: 1000, unitLimit: 100 }
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
  assert.deepEqual(store.events[0].products.map(product => product.sold), [7, 4, 0]);
});

test('does nothing when the target event is absent', () => {
  assert.equal(synchronizeKvnLive2026Event({ events: [] }), false);
});

 test('removes Community Pass from new sales while preserving existing orders and tickets',()=>{
 const store=fixture();
 store.events[0].products.push({id:'kv-community-2026',type:'ticket',sold:3});
 store.orders=[{id:'existing',items:[{id:'kv-community-2026',quantity:1}],status:'paid'}];
 store.tickets=[{id:'existing-ticket',productId:'kv-community-2026'}];
 const records=JSON.stringify({orders:store.orders,tickets:store.tickets});
 synchronizeKvnLive2026Event(store);
 assert.equal(store.events[0].products.some(p=>p.id==='kv-community-2026'),false);
 assert.equal(JSON.stringify({orders:store.orders,tickets:store.tickets}),records);
 });

test('publishes the approved national launch program without expanding standard admission', () => {
  const store = fixture();
  synchronizeKvnLive2026Event(store);
  const event = store.events[0];
  const details = event.layout.find(block => block.id === 'kv-details').body;
  assert.match(event.description, /national launch/i);
  for (const phrase of ['2:30 PM', 'Kingdom Market Expo', 'Vendor Mall', 'Food Hall Experience', 'KV Trailblazer Awards', 'Kingdom Vibe Technology Release', '5:00 PM', 'Pre-Worship', '6:00 PM', 'KV Live Worship Experience', 'Ministry Partners']) {
    assert.ok(details.includes(phrase), phrase);
  }
  assert.doesNotMatch(JSON.stringify(event), /launch party|PreWorship|KB Live/i);
  const [vip, standard] = event.products;
  assert.match(vip.description, /2:30 PM.*Kingdom Market Expo/);
  assert.match(vip.description, /priority seating/);
  assert.match(standard.description, /Pre-Worship and seating at 5 PM/);
  assert.doesNotMatch(standard.description, /priority seating/);
  assert.match(event.layout.find(block => block.id === 'kv-tickets').body, /Kingdom Premier/);
});

test('approved descriptions flow into checkout while retaining commercial and attribution records', async () => {
  const { normalizeTicketCartItem } = await import('../lib/checkout.js');
  const store = fixture();
  synchronizeKvnLive2026Event(store);
  store.events[0].products[0].sold = 90;
  store.events[0].products[1].sold = 91;
  store.orders = [{ id: 'paid-order', discipleCode: 'KEEP', status: 'paid', amountTotal: 4900 }];
  store.tickets = [{ id: 'issued-ticket', orderId: 'paid-order' }];
  store.disciples = [{ id: 'disciple', code: 'KEEP', commissionPercent: 10 }];
  const records = structuredClone({ orders: store.orders, tickets: store.tickets, disciples: store.disciples });
  const commercial = products => products.map(({ description, ...settings }) => settings);
  const before = commercial(store.events[0].products);
  store.events[0].description = 'outdated';
  assert.equal(synchronizeKvnLive2026Event(store), true);
  assert.deepEqual(commercial(store.events[0].products), before);
  assert.deepEqual({ orders: store.orders, tickets: store.tickets, disciples: store.disciples }, records);
  for (const product of store.events[0].products.filter(p=>!p.salesClosed)) {
    const checkout = normalizeTicketCartItem(product, { quantity: 1, ticketSelections: [{ apparelSelected: product.includedApparel.mode==='included', apparelSize: product.includedApparel.mode==='included'?'M':null }] });
    assert.equal(checkout.ticketLineItem.description, product.description);
    assert.match(checkout.ticketLineItem.description, /Ministry Partners/);
    assert.doesNotMatch(checkout.ticketLineItem.description, /launch party/i);
  }
});
