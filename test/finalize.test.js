import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeOrderItems } from '../lib/finalize.js';

const factories = (() => { let next = 0; return { id: () => `ticket-${++next}`, ticketCode: () => `CODE-${next}` }; })();
const product = (mode, inventory = { M: 3, XL: 2 }) => ({
  id: 'ticket-1', type: 'ticket', name: 'Weekend Pass', sold: 0,
  includedApparel: { mode, enabled: mode !== 'none', name: 'KVN Tee', price: 1750, sizes: ['M', 'XL'], sizeInventory: { ...inventory } }
});

test('included passes generate individual tickets and decrement their sizes', () => {
  const event = { products: [product('included')] };
  const order = { buyerName: 'Buyer', items: [{ productId: 'ticket-1', type: 'ticket', name: 'Weekend Pass', quantity: 2, apparelMode: 'included', apparelName: 'KVN Tee', apparelUnitAmount: 0, ticketSelections: [{ apparelSelected: true, apparelSize: 'M' }, { apparelSelected: true, apparelSize: 'XL' }] }], tickets: [] };
  finalizeOrderItems(order, event, factories);
  assert.deepEqual(order.tickets.map(ticket => ticket.apparel), [
    { mode: 'included', name: 'KVN Tee', size: 'M', unitAmount: 0, fulfilled: false },
    { mode: 'included', name: 'KVN Tee', size: 'XL', unitAmount: 0, fulfilled: false }
  ]);
  assert.deepEqual(event.products[0].includedApparel.sizeInventory, { M: 2, XL: 1 });
  assert.equal(event.products[0].sold, 2);
});

test('optional passes decrement only selected apparel', () => {
  const event = { products: [product('optional')] };
  const order = { buyerName: 'Buyer', items: [{ productId: 'ticket-1', type: 'ticket', name: 'Weekend Pass', quantity: 3, apparelMode: 'optional', apparelName: 'KVN Tee', apparelUnitAmount: 1750, ticketSelections: [{ apparelSelected: true, apparelSize: 'M' }, { apparelSelected: false, apparelSize: null }, { apparelSelected: true, apparelSize: 'XL' }] }], tickets: [] };
  finalizeOrderItems(order, event, factories);
  assert.deepEqual(order.tickets.map(ticket => ticket.apparel?.size || null), ['M', null, 'XL']);
  assert.deepEqual(event.products[0].includedApparel.sizeInventory, { M: 2, XL: 1 });
});

test('none mode generates tickets without apparel', () => {
  const event = { products: [product('none')] };
  const order = { buyerName: 'Buyer', items: [{ productId: 'ticket-1', type: 'ticket', name: 'Weekend Pass', quantity: 1, apparelMode: 'none', ticketSelections: [{ apparelSelected: false, apparelSize: null }] }], tickets: [] };
  finalizeOrderItems(order, event, factories);
  assert.equal(order.tickets[0].apparel, null);
  assert.equal(order.tickets[0].includedApparel, null);
});

test('legacy apparel sizes remain compatible', () => {
  const event = { products: [product('included')] };
  const order = { buyerName: 'Buyer', items: [{ productId: 'ticket-1', type: 'ticket', name: 'Weekend Pass', quantity: 1, apparelSizes: ['M'] }], tickets: [] };
  finalizeOrderItems(order, event, factories);
  assert.deepEqual(order.tickets[0].includedApparel, { size: 'M', fulfilled: false });
});

test('inventory shortages are recorded without negative counts', () => {
  const event = { products: [product('included', { M: 0, XL: 1 })] };
  const order = { buyerName: 'Buyer', items: [{ productId: 'ticket-1', type: 'ticket', name: 'Weekend Pass', quantity: 1, apparelMode: 'included', apparelName: 'KVN Tee', apparelUnitAmount: 0, ticketSelections: [{ apparelSelected: true, apparelSize: 'M' }] }], tickets: [] };
  finalizeOrderItems(order, event, factories);
  assert.equal(event.products[0].includedApparel.sizeInventory.M, 0);
  assert.deepEqual(order.inventoryShortages, [{ productId: 'ticket-1', apparelName: 'KVN Tee', size: 'M', requested: 1, available: 0 }]);
});
