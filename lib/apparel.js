export const DEFAULT_APPAREL_SIZES = Object.freeze(['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL']);

const VALID_MODES = new Set(['none', 'optional', 'included']);

function nonNegativeCount(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

export function normalizeApparelConfig(input) {
  const source = input && typeof input === 'object' ? input : {};
  const legacyMode = source.enabled ? 'included' : 'none';
  const mode = VALID_MODES.has(source.mode) ? source.mode : legacyMode;
  const rawSizes = Array.isArray(source.sizes)
    ? source.sizes
    : input == null ? DEFAULT_APPAREL_SIZES : [];
  const sizes = [...new Set(rawSizes.map(size => String(size).trim()).filter(Boolean))];
  const sizeInventory = {};
  for (const size of sizes) {
    if (source.sizeInventory?.[size] != null) {
      sizeInventory[size] = nonNegativeCount(source.sizeInventory[size]);
    }
  }
  return {
    mode,
    enabled: mode !== 'none',
    name: String(source.name || 'T-shirt').trim() || 'T-shirt',
    price: Number.isFinite(Number(source.price)) ? Math.trunc(Number(source.price)) : 0,
    sizes,
    sizeInventory,
    quantityPerTicket: 1
  };
}

export function validateApparelConfig(config) {
  const errors = [];
  if (config.mode !== 'none' && config.sizes.length === 0) {
    errors.push('At least one apparel size is required.');
  }
  if (config.mode === 'optional' && (!Number.isInteger(config.price) || config.price < 0)) {
    errors.push('Optional apparel price must be zero or greater.');
  }
  return errors;
}

export function applyApparelConfig(product, input) {
  const config = normalizeApparelConfig(input);
  const errors = validateApparelConfig(config);
  if (errors.length) throw new Error(errors.join(' '));
  product.includedApparel = config;
  return product;
}
