export function selectionQuantityState(value, product = {}) {
  const raw = Number(value);
  const maximum = Math.max(0, Math.trunc(Number(product.maxPerOrder) || 20));
  const minimum = Math.max(1, Math.trunc(Number(product.minPerOrder) || 1));
  const step = Math.max(1, Math.trunc(Number(product.quantityStep) || 1));
  const finite = Number.isFinite(raw);
  const integer = finite && Number.isInteger(raw);
  const quantity = finite ? Math.max(0, Math.min(maximum, Math.trunc(raw))) : 0;
  const withinRange = integer && raw === quantity && quantity >= minimum && quantity <= maximum;
  const matchesStep = withinRange && (quantity - minimum) % step === 0;
  return { quantity, canSelect: Boolean(matchesStep) };
}
