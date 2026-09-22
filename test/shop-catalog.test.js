import test from 'node:test';
import assert from 'node:assert/strict';
import { DROP_001_PRODUCT, ensureShopCollections, publicShopCatalog } from '../lib/shop-catalog.js';

test('publishes approved Drop 001 prices and sizes', () => {
  const catalog = publicShopCatalog(ensureShopCollections({}), new Date('2026-09-22T12:00:00Z'));
  assert.equal(catalog.products[0].id, DROP_001_PRODUCT.id);
  assert.deepEqual(catalog.products[0].variants.map(variant => [variant.size, variant.unitAmount]), [
    ['S',3900],['M',3900],['L',3900],['XL',3900],['2XL',4200],['3XL',4200],['4XL',4200]
  ]);
  assert.equal(catalog.shippingAmount, 500);
  assert.equal(catalog.totalInventory, 250);
  assert.equal(catalog.shipsBeginning, '2026-10-15');
});

test('normalization preserves existing production records', () => {
  const store = { events:[{id:'evt-prod'}], orders:[{id:'ord-prod'}], users:[{id:'usr-owner'}] };
  const before = structuredClone(store);
  const normalized = ensureShopCollections(store);
  assert.equal(normalized, store);
  assert.deepEqual({events:store.events, orders:store.orders, users:store.users}, before);
});

test('normalization is idempotent and preserves existing shop records', () => {
  const order = {id:'shop-existing'};
  const store = ensureShopCollections({shopOrders:[order]});
  ensureShopCollections(store);
  assert.equal(store.shopOrders.length, 1);
  assert.equal(store.shopOrders[0], order);
  assert.equal(store.shopProducts[0].totalInventory, 250);
});
