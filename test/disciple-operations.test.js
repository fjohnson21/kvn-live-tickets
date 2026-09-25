import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approveDiscipleApplication,
  recordWelcomeAttempt,
  resendDiscipleWelcome,
  reviewDiscipleApplication,
  setDiscipleActiveStatus
} from '../lib/disciple-operations.js';

const makeStore = () => ({
  settings: { defaultDiscipleCommissionPercent: 10 },
  disciples: [],
  discipleApplications: [{
    id: 'dapp_1',
    applicationReference: 'KVN-D-20260907-D95ABD81',
    status: 'submitted',
    name: 'Briannah Cooper',
    preferredName: 'Briannah Cooper',
    email: 'briannah@example.com',
    agreementVersion: '2.2',
    agreementAcceptedAt: '2026-09-07T12:00:00.000Z',
    submittedAt: '2026-09-07T12:00:00.000Z'
  }],
  auditLogs: []
});

const ids = (() => {
  let value = 0;
  return prefix => `${prefix}_${++value}`;
})();

test('approval persists one active Disciple before a failed welcome attempt', async () => {
  const store = makeStore();
  const snapshots = [];
  const result = await approveDiscipleApplication(store, {
    applicationId: 'dapp_1',
    actor: { id: 'owner_1', name: 'Owner' }
  }, {
    id: ids,
    now: () => '2026-09-25T19:00:00.000Z',
    persist: value => snapshots.push(structuredClone(value)),
    sendWelcome: async () => ({ status: 'failed', provider: 'resend', error: 'provider timeout', failedAt: '2026-09-25T19:00:01.000Z' })
  });

  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[0].discipleApplications[0].status, 'approved');
  assert.equal(snapshots[0].disciples.length, 1);
  assert.equal(snapshots[0].disciples[0].welcomeEmail, undefined);
  assert.equal(store.disciples.length, 1);
  assert.equal(result.disciple.status, 'active');
  assert.equal(result.trackingUrl, 'https://disciple.kvnlive.com/briannahcooper');
  assert.equal(result.welcomeEmail.status, 'failed');
  assert.equal(result.disciple.welcomeEmailAttempts.length, 1);
  assert.equal(store.auditLogs[0].action, 'disciple.welcome_failed');
  assert.equal(store.auditLogs[1].action, 'disciple.approve');
});

test('repeated approval returns the existing Disciple without sending twice', async () => {
  const store = makeStore();
  let sends = 0;
  const deps = {
    id: ids,
    now: () => '2026-09-25T19:05:00.000Z',
    persist: () => {},
    sendWelcome: async () => {
      sends += 1;
      return { status: 'sent', provider: 'resend', messageId: `email_${sends}`, sentAt: '2026-09-25T19:05:01.000Z' };
    }
  };

  const first = await approveDiscipleApplication(store, { applicationId: 'dapp_1', actor: { id: 'owner_1', name: 'Owner' } }, deps);
  const second = await approveDiscipleApplication(store, { applicationId: 'dapp_1', actor: { id: 'owner_1', name: 'Owner' } }, deps);

  assert.equal(sends, 1);
  assert.equal(store.disciples.length, 1);
  assert.equal(second.disciple.id, first.disciple.id);
  assert.equal(second.created, false);
  assert.equal(second.welcomeEmail.messageId, 'email_1');
});

test('welcome retry records every attempt without changing identity', async () => {
  const store = makeStore();
  await approveDiscipleApplication(store, { applicationId: 'dapp_1', actor: { id: 'owner_1', name: 'Owner' } }, {
    id: ids,
    now: () => '2026-09-25T19:10:00.000Z',
    persist: () => {},
    sendWelcome: async () => ({ status: 'failed', provider: 'resend', error: 'timeout' })
  });
  const discipleId = store.disciples[0].id;

  const retried = await resendDiscipleWelcome(store, { discipleId, actor: { id: 'owner_1', name: 'Owner' } }, {
    id: ids,
    now: () => '2026-09-25T19:11:00.000Z',
    persist: () => {},
    sendWelcome: async () => ({ status: 'sent', provider: 'resend', messageId: 'email_retry', sentAt: '2026-09-25T19:11:01.000Z' })
  });

  assert.equal(store.disciples.length, 1);
  assert.equal(retried.disciple.id, discipleId);
  assert.equal(retried.welcomeEmail.status, 'sent');
  assert.equal(retried.disciple.welcomeEmailAttempts.length, 2);
  assert.equal(store.auditLogs[0].action, 'disciple.welcome_resent');
});

test('recordWelcomeAttempt keeps a safe timestamped history', () => {
  const disciple = { id: 'dsc_1' };
  const result = recordWelcomeAttempt(disciple, { status: 'not_configured', provider: 'resend', error: 'RESEND_API_KEY is not configured.' }, {
    id: ids,
    now: () => '2026-09-25T19:12:00.000Z'
  });
  assert.equal(result.status, 'not_configured');
  assert.equal(result.attemptedAt, '2026-09-25T19:12:00.000Z');
  assert.equal(disciple.welcomeEmailAttempts.length, 1);
});

test('owner can deactivate and reactivate a Disciple with audit history', () => {
  const store = makeStore();
  store.disciples.push({ id: 'dsc_1', status: 'active', handle: 'briannahcooper' });
  const deps = { id: ids, now: () => '2026-09-25T19:15:00.000Z', persist: () => {} };

  setDiscipleActiveStatus(store, { discipleId: 'dsc_1', active: false, actor: { id: 'owner_1', name: 'Owner' }, reason: 'Paused by owner' }, deps);
  assert.equal(store.disciples[0].status, 'inactive');
  assert.equal(store.auditLogs[0].action, 'disciple.deactivate');

  setDiscipleActiveStatus(store, { discipleId: 'dsc_1', active: true, actor: { id: 'owner_1', name: 'Owner' } }, deps);
  assert.equal(store.disciples[0].status, 'active');
  assert.equal(store.auditLogs[0].action, 'disciple.reactivate');
});

test('welcome finalization merges into the latest store without erasing concurrent records', async () => {
  const store = makeStore();
  let latest = store;
  const result = await approveDiscipleApplication(store, {
    applicationId: 'dapp_1',
    actor: { id: 'owner_1', name: 'Owner' }
  }, {
    id: ids,
    now: () => '2026-09-25T19:20:00.000Z',
    persist: value => { latest = structuredClone(value); },
    reload: () => latest,
    sendWelcome: async ({ idempotencyKey }) => {
      latest.orders = [{ id: 'ord_concurrent', status: 'paid' }];
      assert.match(idempotencyKey, /^disciple-welcome:/);
      return { status: 'sent', provider: 'resend', messageId: 'email_merge', sentAt: '2026-09-25T19:20:01.000Z' };
    }
  });

  assert.equal(latest.orders[0].id, 'ord_concurrent');
  assert.equal(latest.disciples[0].welcomeEmail.messageId, 'email_merge');
  assert.equal(result.disciple.welcomeEmail.messageId, 'email_merge');
});

test('Need Info records a reason, audit trail, and applicant notification', async () => {
  const store = makeStore();
  let latest = store;
  const result = await reviewDiscipleApplication(store, {
    applicationId: 'dapp_1', status: 'needs_info', reason: 'Please accept Agreement v2.2 at kvnlive.com/disciples.', actor: { id: 'owner_1', name: 'Owner' }
  }, {
    id: ids, now: () => '2026-09-25T19:25:00.000Z', persist: value => { latest = structuredClone(value); }, reload: () => latest,
    sendNotice: async ({ idempotencyKey }) => ({ status: 'sent', provider: 'resend', messageId: 'notice_1', idempotencyKey })
  });
  assert.equal(result.application.status, 'needs_info');
  assert.equal(result.notification.status, 'sent');
  assert.ok(latest.auditLogs.some(item => item.action === 'disciple.application_needs_info'));
  assert.ok(latest.auditLogs.some(item => item.action === 'disciple.application_notice_sent'));
  assert.equal(latest.discipleApplications[0].reviewNotices[0].messageId, 'notice_1');
});

test('Need Info and rejection require an administrator reason', async () => {
  const store = makeStore();
  await assert.rejects(() => reviewDiscipleApplication(store, { applicationId: 'dapp_1', status: 'rejected', reason: ' ', actor: { id: 'owner_1' } }, { id: ids }), /reason is required/i);
});

test('review cannot move an approved application back to a review status', async () => {
  const store = makeStore();
  store.discipleApplications[0].status = 'approved';
  await assert.rejects(() => reviewDiscipleApplication(store, { applicationId: 'dapp_1', status: 'rejected', reason: 'No longer eligible', actor: { id: 'owner_1' } }, { id: ids }), /not review-eligible/i);
});

test('retrying the same review decision reuses its notice identity without duplicate audit', async () => {
  const store = makeStore();
  let latest = store;
  const keys = [];
  const deps = {
    id: ids, now: () => '2026-09-25T19:27:00.000Z', persist: value => { latest = structuredClone(value); }, reload: () => latest,
    sendNotice: async ({ idempotencyKey }) => { keys.push(idempotencyKey); return { status: 'failed', provider: 'resend', error: 'timeout' }; }
  };
  const input = { applicationId: 'dapp_1', status: 'needs_info', reason: 'Please accept Agreement v2.2.', actor: { id: 'owner_1' } };
  await reviewDiscipleApplication(store, input, deps);
  await reviewDiscipleApplication(latest, input, deps);
  assert.equal(keys[0], keys[1]);
  assert.equal(latest.auditLogs.filter(item => item.action === 'disciple.application_needs_info').length, 1);
  assert.equal(latest.discipleApplications[0].reviewNotices.length, 2);
});
