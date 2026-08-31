import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPassSelections, cartItemDisplay } from '../lib/browser-model.js';

test('increasing quantity creates independent optional pass selections', () => {
  assert.deepEqual(buildPassSelections(3, { mode: 'optional' }), [
    { apparelSelected: false, apparelSize: null },
    { apparelSelected: false, apparelSize: null },
    { apparelSelected: false, apparelSize: null }
  ]);
});

test('reducing quantity retains existing selections by pass index', () => {
  const prior = [
    { apparelSelected: true, apparelSize: 'M' },
    { apparelSelected: false, apparelSize: null },
    { apparelSelected: true, apparelSize: 'XL' }
  ];
  assert.deepEqual(buildPassSelections(2, { mode: 'optional' }, prior), prior.slice(0, 2));
});

test('included apparel selects every pass but does not guess a size', () => {
  assert.deepEqual(buildPassSelections(2, { mode: 'included' }), [
    { apparelSelected: true, apparelSize: null },
    { apparelSelected: true, apparelSize: null }
  ]);
});

test('none mode clears stray apparel data', () => {
  assert.deepEqual(buildPassSelections(1, { mode: 'none' }, [{ apparelSelected: true, apparelSize: 'XL' }]), [
    { apparelSelected: false, apparelSize: null }
  ]);
});

test('cart display totals optional selections and labels each pass', () => {
  const product = { name: 'Weekend Pass', price: 5000, includedApparel: { mode: 'optional', name: 'KVN Tee', price: 1750 } };
  assert.deepEqual(cartItemDisplay(product, {
    quantity: 2,
    ticketSelections: [
      { apparelSelected: true, apparelSize: 'M' },
      { apparelSelected: false, apparelSize: null }
    ]
  }), {
    lines: ['Pass 1: KVN Tee — M', 'Pass 2: No apparel'],
    total: 11750
  });
});

test('included cart display does not add apparel price', () => {
  const product = { name: 'VIP Bundle', price: 8000, includedApparel: { mode: 'included', name: 'Bundle Tee', price: 9999 } };
  assert.equal(cartItemDisplay(product, {
    quantity: 1, ticketSelections: [{ apparelSelected: true, apparelSize: 'XXL' }]
  }).total, 8000);
});
