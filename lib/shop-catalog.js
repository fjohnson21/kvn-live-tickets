export const DROP_001_PRODUCT = Object.freeze({
  id: 'drop-001-collector-black',
  slug: 'drop-001',
  name: 'Drop 001 — Not Self Made — Made By God',
  color: 'Black',
  edition: 'Numbered Collector’s Edition',
  totalInventory: 250,
  sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'],
  unitAmountBySize: { S:2999, M:2999, L:2999, XL:2999, '2XL':2999, '3XL':2999, '4XL':2999 },
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

export function shopUnitAmount(product,size) {
  return product.id === DROP_001_PRODUCT.id ? 2999 : Number(product.unitAmountBySize[size]);
}

export function publicShopCatalog(store, now = new Date()) {
  ensureShopCollections(store);
  const products = store.shopProducts.filter(product => product.active !== false).map(product => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    color: product.color,
    edition: product.edition,
    totalInventory: product.totalInventory,
    shipsBeginning: product.shipsBeginning,
    variants: product.sizes.map(size => {
      const held=store.shopReservations.filter(r=>r.status==='pending'&&new Date(r.expiresAt).getTime()>now.getTime()).flatMap(r=>r.lines).filter(l=>l.productId===product.id&&l.size===size).reduce((n,l)=>n+Number(l.quantity),0);
      const remaining=Math.max(0,Number(product.sizeInventory?.[size]||0)-held);
      return {size,unitAmount:shopUnitAmount(product,size),available:remaining>0,remaining};
    })
  }));
  return {
    products,
    shippingAmount: Number(store.shopProducts[0]?.shippingAmount ?? DROP_001_PRODUCT.shippingAmount),
    totalInventory: Number(store.shopProducts[0]?.totalInventory ?? DROP_001_PRODUCT.totalInventory),
    shipsBeginning: store.shopProducts[0]?.shipsBeginning ?? DROP_001_PRODUCT.shipsBeginning
  };
}
