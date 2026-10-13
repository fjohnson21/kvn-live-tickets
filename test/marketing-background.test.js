import test from 'node:test';
import assert from 'node:assert/strict';
import { createCampaignRunner } from '../lib/marketing-runner.js';

test('marketing background runner is exported', () => { assert.equal(typeof createCampaignRunner, 'function'); });

test('an incomplete legacy campaign is never started by the background runner', async () => {
  const store = { marketing: { campaigns: [{ id: 'legacy', status: 'sending', recipients: [{ id: 'one', status: 'pending' }] }] } };
  let calls = 0;
  const runner = createCampaignRunner({
    read: () => structuredClone(store),
    write: () => { throw Error('No writes expected'); },
    send: async () => { calls++; },
    blocked: () => new Set(),
    baseUrl: 'https://tickets.invalid', delayMs: 0
  });
  runner.schedule();
  await new Promise(done => setTimeout(done, 10));
  assert.equal(calls, 0);
});
