export function buildPassSelections(quantity, apparelConfig = {}, priorSelections = []) {
  const count = Math.max(0, Math.trunc(Number(quantity) || 0));
  const mode = ['optional', 'included'].includes(apparelConfig.mode) ? apparelConfig.mode : 'none';
  return Array.from({ length: count }, (_, index) => {
    if (mode === 'none') return { apparelSelected: false, apparelSize: null };
    const prior = priorSelections[index];
    if (mode === 'included') {
      return { apparelSelected: true, apparelSize: prior?.apparelSize || null };
    }
    return {
      apparelSelected: prior?.apparelSelected === true,
      apparelSize: prior?.apparelSelected === true ? prior.apparelSize || null : null
    };
  });
}

export function cartItemDisplay(product, cartItem) {
  const config = product.includedApparel || {};
  const selections = buildPassSelections(cartItem.quantity, config, cartItem.ticketSelections);
  const lines = selections.map((selection, index) => selection.apparelSelected
    ? `Pass ${index + 1}: ${config.name || 'T-shirt'} — ${selection.apparelSize || 'Size required'}`
    : `Pass ${index + 1}: No apparel`);
  const apparelCount = config.mode === 'optional'
    ? selections.filter(selection => selection.apparelSelected).length
    : 0;
  return {
    lines,
    total: Number(product.price || 0) * selections.length + Number(config.price || 0) * apparelCount
  };
}
