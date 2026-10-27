import test from 'node:test';
import assert from 'node:assert/strict';
import { loadResendSuppressions } from '../lib/provider-suppressions.js';

test('provider-wide suppression lookup merges all pages and normalizes addresses', async () => {
  const requested = [];
  const lookup = async url => {
    requested.push(url);
    return { ok: true, json: async () => requested.length === 1
      ? { data: [{ id: 'first', email: 'BLOCKED@Example.com' }], has_more: true }
      : { data: [{ id: 'second', email: 'other@example.com' }], has_more: false } };
  };
  const set = await loadResendSuppressions({ RESEND_API_KEY: 'provider-test-key' }, lookup);
  assert.deepEqual([...set].sort(), ['blocked@example.com', 'other@example.com']);
  assert.match(requested[1], /after=first/);
});

test('provider error and incomplete suppression pages fail closed', async () => {
  await assert.rejects(loadResendSuppressions({ RESEND_API_KEY: 'key' }, async () => ({ ok: false })), /Cannot verify/);
  await assert.rejects(loadResendSuppressions({ RESEND_API_KEY: 'key' }, async () =>
    ({ ok: true, json: async () => ({ data: [], has_more: true }) })), /Cannot verify/);
  await assert.rejects(loadResendSuppressions({ RESEND_API_KEY: 'key' }, async () =>
    ({ ok: true, json: async () => ({ data: [], has_more: 'false' }) })), /Cannot verify/);
  await assert.rejects(loadResendSuppressions({}, async () => { throw Error('Should not call'); }), /Cannot verify/);
});
