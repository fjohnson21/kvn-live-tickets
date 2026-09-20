import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPassSelections, cartItemDisplay } from '../lib/browser-model.js';
import * as catalogView from '../public/catalog-view.js';

const { availabilityLabel, sizeOptionLabel } = catalogView;

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

test('public availability copy creates scarcity without exposing quantity', () => {
  assert.equal(availabilityLabel({ available: 600 }), 'Early Release • Limited availability');
  assert.equal(availabilityLabel({ available: 9 }), 'Early Release • Almost gone');
  assert.equal(availabilityLabel({ available: 0 }), 'Sold out');
});

test('shirt sizes never expose inventory counts', () => {
  assert.equal(sizeOptionLabel('XL'), 'XL');
  assert.doesNotMatch(sizeOptionLabel('XL'), /\d|left|available/i);
});

test('storefront price summary shows automatic first-200 savings while available', () => {
  assert.equal(typeof catalogView.earlyReleasePriceSummary, 'function');
  assert.deepEqual(catalogView.earlyReleasePriceSummary({
    price: 5900,
    earlyRelease: { enabled: true, discountAmount: 1000, unitLimit: 200, remaining: 12 }
  }), {
    active: true,
    regularPrice: 5900,
    currentPrice: 4900,
    label: '$10 off the first 200 passes'
  });
});

test('storefront price summary returns regular pricing after the first 200', () => {
  assert.equal(typeof catalogView.earlyReleasePriceSummary, 'function');
  assert.deepEqual(catalogView.earlyReleasePriceSummary({
    price: 3900,
    earlyRelease: { enabled: true, discountAmount: 1000, unitLimit: 200, remaining: 0 }
  }), { active: false, regularPrice: 3900, currentPrice: 3900, label: '' });
});
