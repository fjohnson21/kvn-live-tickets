import { normalizeApparelConfig } from './apparel.js';

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

export class InventoryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InventoryError';
    this.statusCode = 409;
  }
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function groupDiscountFor(product, quantity) {
  const group = product.group || {};
  if (!group.enabled) return 0;
  const tiers = (group.tiers || [])
    .filter(tier => quantity >= Number(tier.minQty || 0))
    .sort((a, b) => Number(b.minQty) - Number(a.minQty));
  const rule = tiers[0] || (
    quantity >= Number(group.minQty || 1) && quantity <= Number(group.maxQty || 9999)
      ? group
      : null
  );
  if (!rule) return 0;
  const value = Number(rule.discountValue || 0);
  return rule.discountType === 'fixed'
    ? Math.min(product.price, Math.max(0, Math.round(value)))
    : Math.round(product.price * clampPercent(value) / 100);
}

export function allocateEarlyRelease(product, quantity, pendingReserved = 0) {
  const regularUnitAmount = Math.max(0, Math.round(Number(product?.price) || 0));
  const config = product?.earlyRelease || {};
  const enabled = config.enabled === true;
  const unitLimit = enabled ? Math.max(0, Math.trunc(Number(config.unitLimit) || 0)) : 0;
  const discountPerUnit = enabled
    ? Math.min(regularUnitAmount, Math.max(0, Math.round(Number(config.discountAmount) || 0)))
    : 0;
  const requested = Math.max(0, Math.trunc(Number(quantity) || 0));
  const sold = Math.max(0, Math.trunc(Number(product?.sold) || 0));
  const reserved = Math.max(0, Math.trunc(Number(pendingReserved) || 0));
  const remaining = Math.max(0, unitLimit - sold - reserved);
  const discountedQuantity = discountPerUnit > 0 ? Math.min(requested, remaining) : 0;
  const regularQuantity = requested - discountedQuantity;
  const discountedUnitAmount = regularUnitAmount - discountPerUnit;
  const discountAmount = discountedQuantity * discountPerUnit;
  return {
    discountedQuantity,
    regularQuantity,
    discountedUnitAmount,
    regularUnitAmount,
    discountAmount,
    subtotal: discountedQuantity * discountedUnitAmount + regularQuantity * regularUnitAmount
  };
}

export function pendingEarlyReleaseUnits(orders, eventId, productId, now = new Date()) {
  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return (Array.isArray(orders) ? orders : [])
    .filter(order => order.eventId === eventId && order.status === 'pending' && new Date(order.checkoutExpiresAt || 0).getTime() > currentTime)
    .flatMap(order => Array.isArray(order.items) ? order.items : [])
    .filter(item => item.productId === productId)
    .reduce((total, item) => total + Math.max(0, Math.trunc(Number(item.earlyReleaseQuantity) || 0)), 0);
}

export function applyEarlyReleasePricing(normalized, product, pendingReserved = 0) {
  const allocation = allocateEarlyRelease(product, normalized.item.quantity, pendingReserved);
  const description = normalized.ticketLineItem.description;
  const ticketLineItems = [];
  if (allocation.discountedQuantity > 0) {
    ticketLineItems.push({
      name: `${product.name} — First 200`,
      description,
      unitAmount: allocation.discountedUnitAmount,
      quantity: allocation.discountedQuantity
    });
  }
  if (allocation.regularQuantity > 0) {
    ticketLineItems.push({
      name: product.name,
      description,
      unitAmount: allocation.regularUnitAmount,
      quantity: allocation.regularQuantity
    });
  }
  return {
    ...normalized,
    item: {
      ...normalized.item,
      unitAmount: allocation.discountedQuantity === normalized.item.quantity
        ? allocation.discountedUnitAmount
        : allocation.regularUnitAmount,
      regularUnitAmount: allocation.regularUnitAmount,
      ticketSubtotal: allocation.subtotal,
      earlyReleaseQuantity: allocation.discountedQuantity,
      earlyReleaseDiscountAmount: allocation.discountAmount
    },
    ticketLineItems
  };
}

export function orderItemSubtotal(item = {}) {
  if (item.type === 'ticket' && Number.isFinite(Number(item.ticketSubtotal))) return Math.max(0, Number(item.ticketSubtotal));
  return Math.max(0, Number(item.unitAmount) || 0) * Math.max(0, Number(item.quantity) || 0);
}

export function checkoutExpiration(now = new Date()) {
  const date = new Date(now);
  const expires = new Date(date.getTime() + 31 * 60 * 1000);
  return { iso: expires.toISOString(), unix: Math.floor(expires.getTime() / 1000) };
}

function normalizedSelections(product, cartItem, quantity, config) {
  const submitted = Array.isArray(cartItem.ticketSelections) ? cartItem.ticketSelections : [];
  if (submitted.length !== quantity) {
    throw new ValidationError(`Configure apparel for each ${product.name} pass.`);
  }
  const counts = {};
  const selections = submitted.map((raw, index) => {
    const selected = raw?.apparelSelected === true;
    const size = selected ? String(raw?.apparelSize || '').trim() : null;
    if (config.mode === 'none' && (selected || size)) {
      throw new ValidationError(`${product.name} does not include an apparel selection.`);
    }
    if (config.mode === 'included' && !selected) {
      throw new ValidationError(`Choose one apparel size for pass ${index + 1} of ${product.name}.`);
    }
    if (selected && !config.sizes.includes(size)) {
      throw new ValidationError(`Choose a valid apparel size for pass ${index + 1} of ${product.name}.`);
    }
    if (selected) counts[size] = (counts[size] || 0) + 1;
    return { apparelSelected: selected, apparelSize: size };
  });
  for (const [size, requested] of Object.entries(counts)) {
    const configured = config.sizeInventory[size];
    if (configured != null && requested > configured) {
      throw new InventoryError(`Only ${configured} ${config.name} items remain in size ${size}.`);
    }
  }
  return selections;
}

export function normalizeTicketCartItem(product, cartItem) {
  if (!product || product.type !== 'ticket') throw new ValidationError('A valid ticket product is required.');
  const quantity = Number(cartItem?.quantity);
  const min = Math.max(1, Math.trunc(Number(product.minPerOrder) || 1));
  const max = Math.max(min, Math.trunc(Number(product.maxPerOrder) || 20));
  const step = Math.max(1, Math.trunc(Number(product.quantityStep) || 1));
  if (!Number.isInteger(quantity) || quantity < min || quantity > max || (quantity - min) % step !== 0) {
    throw new ValidationError(`${product.name} quantity must be ${min} to ${max} in increments of ${step}.`);
  }
  const available = Math.max(0, Number(product.inventory || 0) - Number(product.sold || 0));
  if (quantity > available) throw new InventoryError(`Only ${available} ${product.name} remaining.`);
  if (product.group?.enabled && (quantity < Number(product.group.minQty || 1) || quantity > Number(product.group.maxQty || 9999))) {
    throw new ValidationError(`${product.name} group quantity must be between ${product.group.minQty} and ${product.group.maxQty}.`);
  }

  const config = normalizeApparelConfig(product.includedApparel);
  const ticketSelections = normalizedSelections(product, cartItem, quantity, config);
  const groupDiscountPerUnit = groupDiscountFor(product, quantity);
  const unitAmount = Math.max(0, Math.round(product.price) - groupDiscountPerUnit);
  const selectedCount = ticketSelections.filter(item => item.apparelSelected).length;
  const apparelSubtotal = config.mode === 'optional' ? config.price * selectedCount : 0;
  const apparelLineItems = config.mode === 'optional' && selectedCount
    ? [{ name: config.name, unitAmount: config.price, quantity: selectedCount }]
    : [];

  return {
    item: {
      productId: product.id,
      name: product.name,
      type: 'ticket',
      quantity,
      unitAmount,
      regularUnitAmount: product.price,
      groupDiscountPerUnit,
      ticketSubtotal: unitAmount * quantity,
      apparelMode: config.mode,
      apparelName: config.name,
      apparelUnitAmount: config.mode === 'optional' ? config.price : 0,
      apparelSubtotal,
      ticketSelections
    },
    ticketLineItem: { name: product.name, description: product.description || '', unitAmount, quantity },
    apparelLineItems,
    apparelSubtotal
  };
}
