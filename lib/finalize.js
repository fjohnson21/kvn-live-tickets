import { normalizeApparelConfig } from './apparel.js';

function selectionsFor(item, config) {
  if (Array.isArray(item.ticketSelections)) return item.ticketSelections;
  if (Array.isArray(item.apparelSizes)) {
    return item.apparelSizes.map(size => ({ apparelSelected: true, apparelSize: size }));
  }
  return Array.from({ length: item.quantity }, () => ({ apparelSelected: false, apparelSize: null }));
}

export function finalizeOrderItems(order, event, factories) {
  order.tickets ||= [];
  order.inventoryShortages ||= [];
  for (const item of order.items || []) {
    const product = event.products.find(candidate => candidate.id === item.productId);
    if (!product) continue;
    if (item.type !== 'ticket') {
      if (item.type === 'apparel') product.sold = Number(product.sold || 0) + Number(item.quantity || 0);
      continue;
    }

    const quantity = Number(item.quantity || 0);
    product.sold = Number(product.sold || 0) + quantity;
    const config = normalizeApparelConfig(product.includedApparel);
    const mode = item.apparelMode || config.mode;
    const apparelName = item.apparelName || config.name;
    const apparelUnitAmount = mode === 'optional' ? Number(item.apparelUnitAmount || 0) : 0;
    const selections = selectionsFor(item, config);
    const sizeDemand = {};
    for (const selection of selections) {
      if (selection.apparelSelected && selection.apparelSize) {
        sizeDemand[selection.apparelSize] = (sizeDemand[selection.apparelSize] || 0) + 1;
      }
    }
    for (const [size, requested] of Object.entries(sizeDemand)) {
      const available = Number(product.includedApparel?.sizeInventory?.[size] ?? requested);
      if (requested > available) {
        order.inventoryShortages.push({ productId: product.id, apparelName, size, requested, available });
      }
      if (product.includedApparel?.sizeInventory && product.includedApparel.sizeInventory[size] != null) {
        product.includedApparel.sizeInventory[size] = Math.max(0, available - requested);
      }
    }

    for (let index = 0; index < quantity; index++) {
      const selection = selections[index] || { apparelSelected: false, apparelSize: null };
      const apparel = selection.apparelSelected && selection.apparelSize ? {
        mode,
        name: apparelName,
        size: selection.apparelSize,
        unitAmount: apparelUnitAmount,
        fulfilled: false
      } : null;
      order.tickets.push({
        id: factories.id('tkt'),
        code: factories.ticketCode(),
        productId: item.productId,
        ticketName: item.name,
        holderName: order.buyerName,
        apparel,
        includedApparel: apparel && mode === 'included' ? { size: apparel.size, fulfilled: false } : null,
        checkedIn: false,
        checkedInAt: null
      });
    }
  }
  if (!order.inventoryShortages.length) delete order.inventoryShortages;
  return { tickets: order.tickets, inventoryShortages: order.inventoryShortages || [] };
}
