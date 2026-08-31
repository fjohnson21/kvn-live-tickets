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
