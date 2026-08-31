const ADDRESS_FIELDS = ['line1', 'line2', 'city', 'state', 'postalCode', 'country'];

function normalizeAddress(input) {
  const source = input && typeof input === 'object' ? input : {};
  return Object.fromEntries(ADDRESS_FIELDS.map(field => [field, String(source[field] || '').trim()]));
}

export function normalizeCustomer(input) {
  const source = input && typeof input === 'object' ? input : {};
  const billingAddress = normalizeAddress(source.billingAddress);
  const mailingSameAsBilling = source.mailingSameAsBilling === true;
  return {
    name: String(source.name || '').trim(),
    email: String(source.email || '').trim(),
    cellPhone: String(source.cellPhone || '').trim(),
    billingAddress,
    mailingSameAsBilling,
    mailingAddress: mailingSameAsBilling ? { ...billingAddress } : normalizeAddress(source.mailingAddress)
  };
}

function addressErrors(label, address) {
  const errors = [];
  if (!address.line1) errors.push(`${label} street address is required.`);
  if (!address.city) errors.push(`${label} city is required.`);
  if (!address.state) errors.push(`${label} state is required.`);
  if (!address.postalCode) errors.push(`${label} postal code is required.`);
  if (!address.country) errors.push(`${label} country is required.`);
  return errors;
}

export function validateCustomer(customer) {
  const errors = [];
  if (!customer.name) errors.push('Customer name is required.');
  if (!/^\S+@\S+\.\S+$/.test(customer.email)) errors.push('Enter a valid email address.');
  if (!customer.cellPhone) errors.push('Cell phone number is required.');
  errors.push(...addressErrors('Billing', customer.billingAddress));
  errors.push(...addressErrors('Mailing', customer.mailingAddress));
  return errors;
}
