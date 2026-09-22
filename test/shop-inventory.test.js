import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureShopCollections, DROP_001_PRODUCT } from '../lib/shop-catalog.js';
import { commitShopReservation, releaseExpiredShopReservations, reserveShopInventory, restoreShopInventory } from '../lib/shop-inventory.js';

const PRODUCT = DROP_001_PRODUCT.id;
const fixedClock = () => new Date('2026-09-22T12:00:00.000Z');

function storeWithStock(stock) {
  const store = ensureShopCollections({});
  store.shopProducts[0].sizeInventory = Object.fromEntries(store.shopProducts[0].sizes.map(size => [size, stock[size] || 0]));
  return store;
}

const requestFor = (orderId,size,quantity) => ({orderId,lines:[{productId:PRODUCT,size,quantity}]});

test('accepts quantities above twenty when stock permits', () => {
  const result = reserveShopInventory(storeWithStock({L:30}), requestFor('shop-1','L',25), fixedClock);
  assert.equal(result.lines[0].quantity,25);
});

test('two reservations cannot claim the final unit', () => {
  const store = storeWithStock({XL:1});
  reserveShopInventory(store,requestFor('one','XL',1),fixedClock);
  assert.throws(() => reserveShopInventory(store,requestFor('two','XL',1),fixedClock),/remaining/i);
});

test('aggregates repeated size lines before checking stock', () => {
  const store = storeWithStock({M:2});
  assert.throws(() => reserveShopInventory(store,{orderId:'mixed',lines:[
    {productId:PRODUCT,size:'M',quantity:2},{productId:PRODUCT,size:'M',quantity:1}
  ]},fixedClock),/remaining/i);
  assert.equal(store.shopReservations.length,0);
});

test('expired reservations release availability', () => {
  const store = storeWithStock({S:1});
  const reservation = reserveShopInventory(store,requestFor('one','S',1),fixedClock);
  releaseExpiredShopReservations(store,()=>new Date(reservation.expiresAt));
  const next = reserveShopInventory(store,requestFor('two','S',1),()=>new Date('2026-09-22T13:00:00.000Z'));
  assert.equal(next.status,'pending');
});

test('paid multi-shirt order receives consecutive unique collector numbers idempotently', () => {
  const store = storeWithStock({M:3});
  const reservation = reserveShopInventory(store,requestFor('order-1','M',3),fixedClock);
  const first = commitShopReservation(store,reservation.id,'order-1',fixedClock);
  const second = commitShopReservation(store,reservation.id,'order-1',fixedClock);
  assert.deepEqual(first.map(x=>x.displayNumber),['001','002','003']);
  assert.deepEqual(second,first);
  assert.equal(store.shopProducts[0].sizeInventory.M,0);
});

test('refund restores size inventory without recycling collector numbers', () => {
  const store = storeWithStock({L:2});
  const reservation = reserveShopInventory(store,requestFor('order-2','L',2),fixedClock);
  const assignments = commitShopReservation(store,reservation.id,'order-2',fixedClock);
  restoreShopInventory(store,{id:'order-2',items:[{productId:PRODUCT,size:'L',quantity:2}]},fixedClock);
  assert.equal(store.shopProducts[0].sizeInventory.L,2);
  assert.ok(assignments.every(item=>item.status==='refunded'));
  const next = reserveShopInventory(store,requestFor('order-3','L',1),fixedClock);
  const nextAssignments = commitShopReservation(store,next.id,'order-3',fixedClock);
  assert.equal(nextAssignments[0].displayNumber,'003');
});
