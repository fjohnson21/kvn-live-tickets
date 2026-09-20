import test from 'node:test';
import assert from 'node:assert/strict';
import * as checkout from '../lib/checkout.js';

const { InventoryError, ValidationError, normalizeTicketCartItem } = checkout;

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

test('allocates the first 200 paid pass units to automatic early-release pricing', () => {
  assert.equal(typeof checkout.allocateEarlyRelease, 'function');
  const product = ticket('none', {
    price: 5900,
    sold: 0,
    earlyRelease: { enabled: true, discountAmount: 1000, unitLimit: 200 }
  });

  assert.deepEqual(checkout.allocateEarlyRelease(product, 3, 0), {
    discountedQuantity: 3,
    regularQuantity: 0,
    discountedUnitAmount: 4900,
    regularUnitAmount: 5900,
    discountAmount: 3000,
    subtotal: 14700
  });
});

test('splits an order that crosses the 200-pass early-release limit', () => {
  assert.equal(typeof checkout.allocateEarlyRelease, 'function');
  const product = ticket('none', {
    price: 3900,
    sold: 198,
    earlyRelease: { enabled: true, discountAmount: 1000, unitLimit: 200 }
  });

  assert.deepEqual(checkout.allocateEarlyRelease(product, 4, 0), {
    discountedQuantity: 2,
    regularQuantity: 2,
    discountedUnitAmount: 2900,
    regularUnitAmount: 3900,
    discountAmount: 2000,
    subtotal: 13600
  });
});

test('pending checkout reservations reduce remaining early-release units', () => {
  assert.equal(typeof checkout.pendingEarlyReleaseUnits, 'function');
  const now = new Date('2026-09-20T16:00:00.000Z');
  const orders = [
    { eventId: 'event-1', status: 'pending', checkoutExpiresAt: '2026-09-20T16:10:00.000Z', items: [{ productId: 'ticket-1', earlyReleaseQuantity: 4 }] },
    { eventId: 'event-1', status: 'pending', checkoutExpiresAt: '2026-09-20T15:59:59.000Z', items: [{ productId: 'ticket-1', earlyReleaseQuantity: 9 }] },
    { eventId: 'event-1', status: 'paid', checkoutExpiresAt: '2026-09-20T16:10:00.000Z', items: [{ productId: 'ticket-1', earlyReleaseQuantity: 7 }] },
    { eventId: 'event-2', status: 'pending', checkoutExpiresAt: '2026-09-20T16:10:00.000Z', items: [{ productId: 'ticket-1', earlyReleaseQuantity: 6 }] }
  ];

  assert.equal(checkout.pendingEarlyReleaseUnits(orders, 'event-1', 'ticket-1', now), 4);
});

test('applies mixed early-release pricing without losing per-pass apparel selections', () => {
  assert.equal(typeof checkout.applyEarlyReleasePricing, 'function');
  const product = ticket('included', {
    price: 3900,
    inventory: 400,
    sold: 199,
    earlyRelease: { enabled: true, discountAmount: 1000, unitLimit: 200 }
  });
  const normalized = normalizeTicketCartItem(product, {
    id: 'ticket-1',
    quantity: 2,
    ticketSelections: [selection(true, 'M'), selection(true, 'XL')]
  });

  const priced = checkout.applyEarlyReleasePricing(normalized, product, 0);
  assert.equal(priced.item.ticketSubtotal, 6800);
  assert.equal(priced.item.earlyReleaseQuantity, 1);
  assert.equal(priced.item.earlyReleaseDiscountAmount, 1000);
  assert.deepEqual(priced.item.ticketSelections, [selection(true, 'M'), selection(true, 'XL')]);
  assert.deepEqual(priced.ticketLineItems, [
    { name: 'Weekend Pass — First 200', description: '', unitAmount: 2900, quantity: 1 },
    { name: 'Weekend Pass', description: '', unitAmount: 3900, quantity: 1 }
  ]);
});

test('fee calculations use the exact mixed-price ticket subtotal', () => {
  assert.equal(typeof checkout.orderItemSubtotal, 'function');
  assert.equal(checkout.orderItemSubtotal({ type: 'ticket', quantity: 2, unitAmount: 3900, ticketSubtotal: 6800 }), 6800);
  assert.equal(checkout.orderItemSubtotal({ type: 'apparel-addon', quantity: 2, unitAmount: 1750 }), 3500);
});

test('checkout reservations exceed Stripe minimum expiration while staying short-lived', () => {
  assert.equal(typeof checkout.checkoutExpiration, 'function');
  const expiration = checkout.checkoutExpiration(new Date('2026-09-20T16:00:00.500Z'));
  assert.equal(expiration.iso, '2026-09-20T16:31:00.500Z');
  assert.equal(expiration.unix, 1789921860);
});
