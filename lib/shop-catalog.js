export const DROP_001_PRODUCT = Object.freeze({
  id: 'drop-001-collector-black',
  slug: 'drop-001',
  name: 'Drop 001 — Not Self Made — Made By God',
  color: 'Black',
  edition: 'Numbered Collector’s Edition',
  totalInventory: 250,
  sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'],
  unitAmountBySize: { S:3900, M:3900, L:3900, XL:3900, '2XL':4200, '3XL':4200, '4XL':4200 },
  shippingAmount: 500,
  shipsBeginning: '2026-10-15'
});

const initialSizeInventory = () => ({ S:36, M:36, L:36, XL:36, '2XL':36, '3XL':35, '4XL':35 });

function initialProduct() {
  return {
    ...DROP_001_PRODUCT,
    sizes: [...DROP_001_PRODUCT.sizes],
    unitAmountBySize: { ...DROP_001_PRODUCT.unitAmountBySize },
    sizeInventory: initialSizeInventory(),
    active: true
  };
}

export function ensureShopCollections(store) {
  store.shopProducts ||= [initialProduct()];
  store.shopOrders ||= [];
  store.shopReservations ||= [];
  store.collectorAssignments ||= [];
  store.shopAudit ||= [];
  return store;
}

export function publicShopCatalog(store, _now = new Date()) {
  ensureShopCollections(store);
  const products = store.shopProducts.filter(product => product.active !== false).map(product => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    color: product.color,
    edition: product.edition,
    totalInventory: product.totalInventory,
    shipsBeginning: product.shipsBeginning,
    variants: product.sizes.map(size => ({
      size,
      unitAmount: product.unitAmountBySize[size],
      available: Number(product.sizeInventory?.[size] || 0) > 0
    }))
  }));
  return {
    products,
    shippingAmount: Number(store.shopProducts[0]?.shippingAmount ?? DROP_001_PRODUCT.shippingAmount),
    totalInventory: Number(store.shopProducts[0]?.totalInventory ?? DROP_001_PRODUCT.totalInventory),
    shipsBeginning: store.shopProducts[0]?.shipsBeginning ?? DROP_001_PRODUCT.shipsBeginning
  };
}
