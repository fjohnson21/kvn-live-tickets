import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_APPAREL_SIZES,
  applyApparelConfig,
  normalizeApparelConfig,
  validateApparelConfig
} from '../lib/apparel.js';

test('legacy enabled apparel normalizes to included mode', () => {
  assert.deepEqual(normalizeApparelConfig({ enabled: true, sizes: ['M'], sizeInventory: { M: 4 } }), {
    mode: 'included', enabled: true, name: 'T-shirt', price: 0,
    sizes: ['M'], sizeInventory: { M: 4 }, quantityPerTicket: 1
  });
});

test('missing apparel normalizes to none with approved default sizes', () => {
  assert.deepEqual(normalizeApparelConfig(), {
    mode: 'none', enabled: false, name: 'T-shirt', price: 0,
    sizes: DEFAULT_APPAREL_SIZES, sizeInventory: {}, quantityPerTicket: 1
  });
});

test('optional mode keeps its independent price sizes and counts', () => {
  assert.deepEqual(normalizeApparelConfig({ mode: 'optional', name: 'KVN Tee', price: 1750, sizes: ['XL', 'XXXXL'], sizeInventory: { XL: 8, XXXXL: 2 } }), {
    mode: 'optional', enabled: true, name: 'KVN Tee', price: 1750,
    sizes: ['XL', 'XXXXL'], sizeInventory: { XL: 8, XXXXL: 2 }, quantityPerTicket: 1
  });
});

test('active apparel rejects empty sizes and invalid optional price', () => {
  assert.deepEqual(validateApparelConfig(normalizeApparelConfig({ mode: 'optional', price: -1, sizes: [] })), [
    'At least one apparel size is required.',
    'Optional apparel price must be zero or greater.'
  ]);
});

test('apply apparel configuration replaces settings without changing sold tickets', () => {
  const product = { id: 'ticket-1', sold: 7, includedApparel: { enabled: false } };
  const result = applyApparelConfig(product, {
    mode: 'included', name: 'Bundle Tee', sizes: ['S', 'M'], sizeInventory: { S: 3, M: 5 }
  });
  assert.equal(result, product);
  assert.equal(product.sold, 7);
  assert.deepEqual(product.includedApparel, {
    mode: 'included', enabled: true, name: 'Bundle Tee', price: 0,
    sizes: ['S', 'M'], sizeInventory: { S: 3, M: 5 }, quantityPerTicket: 1
  });
});

test('apply apparel configuration rejects invalid settings', () => {
  assert.throws(
    () => applyApparelConfig({ sold: 0 }, { mode: 'included', sizes: [] }),
    /At least one apparel size is required\./
  );
});
