export function availabilityLabel(product = {}) {
  const available = Math.max(0, Number(product.available) || 0);
  if (available === 0) return 'Sold out';
  if (available <= 10) return 'Early Release • Almost gone';
  return 'Early Release • Limited availability';
}

export function sizeOptionLabel(size) {
  return String(size || '');
}
