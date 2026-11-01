import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/success.html', import.meta.url), 'utf8');

test('order confirmation explains ticket delivery and Drop 001 shipping', () => {
  assert.match(html, /confirmation email includes your ticket QR codes/i);
  assert.match(html, /available early at will call for pickup/i);
  assert.match(html, /confirmation for your order/i);
  assert.doesNotMatch(html, /Production version can email these automatically/i);
});
