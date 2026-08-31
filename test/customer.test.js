import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCustomer, validateCustomer } from '../lib/customer.js';

const billing = { line1: '10 Main St', line2: '', city: 'Atlanta', state: 'GA', postalCode: '30303', country: 'US' };

test('same as billing copies the normalized billing address', () => {
  const customer = normalizeCustomer({
    name: 'A Buyer', email: 'a@example.com', cellPhone: '404-555-1212',
    billingAddress: billing, mailingSameAsBilling: true
  });
  assert.deepEqual(customer.mailingAddress, billing);
  assert.notEqual(customer.mailingAddress, customer.billingAddress);
  assert.deepEqual(validateCustomer(customer), []);
});

test('independent mailing address is retained', () => {
  const mailingAddress = { ...billing, line1: '20 Ship St', postalCode: '30308' };
  assert.deepEqual(normalizeCustomer({
    name: 'A Buyer', email: 'a@example.com', cellPhone: '404-555-1212',
    billingAddress: billing, mailingSameAsBilling: false, mailingAddress
  }).mailingAddress, mailingAddress);
});

test('missing phone and required address fields are rejected', () => {
  const customer = normalizeCustomer({ name: 'A', email: 'bad', billingAddress: {}, mailingAddress: {} });
  assert.deepEqual(validateCustomer(customer), [
    'Enter a valid email address.', 'Cell phone number is required.',
    'Billing street address is required.', 'Billing city is required.',
    'Billing state is required.', 'Billing postal code is required.',
    'Billing country is required.', 'Mailing street address is required.',
    'Mailing city is required.', 'Mailing state is required.',
    'Mailing postal code is required.', 'Mailing country is required.'
  ]);
});

test('customer name is required', () => {
  const customer = normalizeCustomer({ email: 'a@example.com', cellPhone: '404-555-1212', billingAddress: billing, mailingSameAsBilling: true });
  assert.equal(validateCustomer(customer)[0], 'Customer name is required.');
});
