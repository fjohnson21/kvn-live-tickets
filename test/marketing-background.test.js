import test from 'node:test';
import assert from 'node:assert/strict';
import { createCampaignRunner } from '../lib/marketing-runner.js';
import { ensureMarketing, upsertContact } from '../lib/marketing.js';

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

test('background runner respects a new opt-out and preserves a concurrent order write', async () => {
  let data = ensureMarketing({ orders: [] });
  data.marketing.settings = { senderName: 'KVN', mailingAddress: '123 Main Street' };
  const contacts = ['one@sample.invalid', 'two@sample.invalid'].map(email =>
    upsertContact(data, { email, listIds: ['ticket-buyers'], permission: 'subscribed', evidence: 'Test opt-in' }));
  data.marketing.campaigns = [{
    id: 'test-campaign', subject: 'Test', body: 'Body', listIds: ['ticket-buyers'],
    settings: data.marketing.settings, engineVersion: 2, autoRun: true, status: 'sending',
    recipients: contacts.map(c => ({ id: c.id, email: c.email, status: 'pending' }))
  }];
  const read = () => structuredClone(data), write = next => { data = structuredClone(next); };
  const called = [];
  const runner = createCampaignRunner({
    read, write, blocked: () => new Set(), delayMs: 0, baseUrl: 'https://tickets.invalid',
    send: async call => {
      called.push(call.to);
      const updated = read();
      updated.marketing.contacts[1].permission = 'unsubscribed';
      updated.orders.push({ id: 'order-created-during-send' });
      write(updated);
      return { status: 'accepted', messageId: 'synthetic-provider-id' };
    }
  });
  runner.schedule();
  for (let n = 0; n < 100 && data.marketing.campaigns[0].status !== 'complete'; n++)
    await new Promise(done => setTimeout(done, 10));
  assert.deepEqual(called, ['one@sample.invalid']);
  assert.deepEqual(data.marketing.campaigns[0].recipients.map(r => r.status), ['accepted', 'skipped']);
  assert.equal(data.orders.length, 1);
});
