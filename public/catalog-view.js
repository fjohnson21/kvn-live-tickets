export function availabilityLabel(product = {}) {
  const available = Math.max(0, Number(product.available) || 0);
  if (available === 0) return 'Sold out';
  if (available <= 10) return 'Early Release • Almost gone';
  return 'Early Release • Limited availability';
}

export function sizeOptionLabel(size) {
  return String(size || '');
}

export function earlyReleasePriceSummary(product = {}) {
  const regularPrice = Math.max(0, Math.round(Number(product.price) || 0));
  const config = product.earlyRelease || {};
  const active = config.enabled === true && Number(config.remaining) > 0 && Number(config.discountAmount) > 0;
  const discountAmount = active ? Math.min(regularPrice, Math.max(0, Math.round(Number(config.discountAmount) || 0))) : 0;
  return {
    active,
    regularPrice,
    currentPrice: regularPrice - discountAmount,
    label: active ? `$${(discountAmount / 100).toFixed(0)} off the first ${Math.max(0, Math.trunc(Number(config.unitLimit) || 0))} passes` : ''
  };
}
