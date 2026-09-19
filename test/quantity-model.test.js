import test from 'node:test';
import assert from 'node:assert/strict';
import { selectionQuantityState } from '../public/quantity-model.js';

const pass = { minPerOrder: 1, maxPerOrder: 20, quantityStep: 1 };

test('an untouched or blank quantity represents zero selected passes', () => {
  assert.deepEqual(selectionQuantityState('', pass), { quantity: 0, canSelect: false });
  assert.deepEqual(selectionQuantityState(undefined, pass), { quantity: 0, canSelect: false });
  assert.deepEqual(selectionQuantityState(0, pass), { quantity: 0, canSelect: false });
});

test('a deliberate valid quantity can be selected', () => {
  assert.deepEqual(selectionQuantityState('3', pass), { quantity: 3, canSelect: true });
});

test('selection rejects quantities outside product rules instead of coercing them to one', () => {
  assert.deepEqual(selectionQuantityState('-1', pass), { quantity: 0, canSelect: false });
  assert.deepEqual(selectionQuantityState('21', pass), { quantity: 20, canSelect: false });
  assert.deepEqual(selectionQuantityState('1.5', pass), { quantity: 1, canSelect: false });
  assert.deepEqual(selectionQuantityState('abc', pass), { quantity: 0, canSelect: false });
});

test('minimums and increments are enforced only after the customer chooses a quantity', () => {
  const groupPass = { minPerOrder: 2, maxPerOrder: 10, quantityStep: 2 };
  assert.deepEqual(selectionQuantityState(0, groupPass), { quantity: 0, canSelect: false });
  assert.deepEqual(selectionQuantityState(1, groupPass), { quantity: 1, canSelect: false });
  assert.deepEqual(selectionQuantityState(2, groupPass), { quantity: 2, canSelect: true });
  assert.deepEqual(selectionQuantityState(3, groupPass), { quantity: 3, canSelect: false });
  assert.deepEqual(selectionQuantityState(4, groupPass), { quantity: 4, canSelect: true });
});
