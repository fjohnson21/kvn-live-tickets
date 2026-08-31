import test from 'node:test';
import assert from 'node:assert/strict';
import { InventoryError, ValidationError, normalizeTicketCartItem } from '../lib/checkout.js';

const ticket = (mode, overrides = {}) => ({
  id: 'ticket-1', type: 'ticket', name: 'Weekend Pass', description: '',
  price: 5000, inventory: 20, sold: 0, minPerOrder: 1, maxPerOrder: 10,
  quantityStep: 1, group: { enabled: false },
  includedApparel: {
    mode, enabled: mode !== 'none', name: 'KVN Tee', price: 1750,
    sizes: ['M', 'XL'], sizeInventory: { M: 4, XL: 2 }, quantityPerTicket: 1
  },
  ...overrides
});

const selection = (apparelSelected = false, apparelSize = null) => ({ apparelSelected, apparelSize });

test('included mode requires one valid size for each pass', () => {
  assert.throws(() => normalizeTicketCartItem(ticket('included'), {
    id: 'ticket-1', quantity: 2, ticketSelections: [selection(true, 'M')]
  }), ValidationError);
});

test('included bundle adds no separate apparel charge', () => {
  const result = normalizeTicketCartItem(ticket('included'), {
    id: 'ticket-1', quantity: 2,
    ticketSelections: [selection(true, 'M'), selection(true, 'XL')]
  });
  assert.equal(result.item.ticketSubtotal, 10000);
  assert.equal(result.apparelSubtotal, 0);
  assert.deepEqual(result.apparelLineItems, []);
});

test('optional mode charges only selected per-pass shirts', () => {
  const result = normalizeTicketCartItem(ticket('optional'), {
    id: 'ticket-1', quantity: 3,
    ticketSelections: [selection(true, 'M'), selection(), selection(true, 'XL')]
  });
  assert.equal(result.item.ticketSubtotal, 15000);
  assert.equal(result.apparelSubtotal, 3500);
  assert.deepEqual(result.apparelLineItems, [{ name: 'KVN Tee', unitAmount: 1750, quantity: 2 }]);
});

test('none mode rejects a selected apparel submission', () => {
  assert.throws(() => normalizeTicketCartItem(ticket('none'), {
    id: 'ticket-1', quantity: 1, ticketSelections: [selection(true, 'M')]
  }), ValidationError);
});

test('size demand is aggregated across one multi-ticket item', () => {
  assert.throws(() => normalizeTicketCartItem(ticket('optional'), {
    id: 'ticket-1', quantity: 3,
    ticketSelections: [selection(true, 'XL'), selection(true, 'XL'), selection(true, 'XL')]
  }), InventoryError);
});

test('ticket min max step and inventory remain enforced', () => {
  const limited = ticket('none', { minPerOrder: 2, maxPerOrder: 8, quantityStep: 2, inventory: 5, sold: 1 });
  assert.throws(() => normalizeTicketCartItem(limited, {
    id: 'ticket-1', quantity: 5, ticketSelections: Array.from({ length: 5 }, () => selection())
  }), ValidationError);
  assert.throws(() => normalizeTicketCartItem(limited, {
    id: 'ticket-1', quantity: 6, ticketSelections: Array.from({ length: 6 }, () => selection())
  }), InventoryError);
});

test('group discount changes ticket price but not optional apparel price', () => {
  const product = ticket('optional', { group: { enabled: true, minQty: 2, maxQty: 10, discountType: 'percent', discountValue: 10, tiers: [] } });
  const result = normalizeTicketCartItem(product, {
    id: 'ticket-1', quantity: 2, ticketSelections: [selection(true, 'M'), selection()]
  });
  assert.equal(result.item.unitAmount, 4500);
  assert.equal(result.item.ticketSubtotal, 9000);
  assert.equal(result.apparelSubtotal, 1750);
});
