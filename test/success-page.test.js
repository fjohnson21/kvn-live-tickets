import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/success.html', import.meta.url), 'utf8');

test('order confirmation explains ticket delivery and Drop 001 shipping', () => {
  assert.match(html, /confirmation email includes your ticket QR codes/i);
  assert.match(html, /included Drop 001 shirt will ship on October 15, 2026/i);
  assert.match(html, /mailing address provided at checkout/i);
  assert.doesNotMatch(html, /Production version can email these automatically/i);
});
