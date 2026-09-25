import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemHealth } from '../lib/system-health.js';

const completeEnv = {
  STRIPE_SECRET_KEY: 'sk_live_secret_value',
  STRIPE_WEBHOOK_SECRET: 'whsec_secret_value',
  RESEND_API_KEY: 're_secret_value',
  DISCIPLE_FROM_EMAIL: 'Kingdom Vibe Network <info@kvnlive.com>',
  DISCIPLE_INTAKE_SECRET: 'intake_secret_value',
  DISCIPLE_SYNC_SECRET: 'sync_secret_value',
  OWNER_EMAIL: 'owner@example.com',
  BASE_URL: 'https://kvn-live-tickets.onrender.com',
  COMMUNITY_BONUS_LEGAL_APPROVED: 'true'
};

test('reports a ready system when every critical service is configured', () => {
  const result = buildSystemHealth(completeEnv, { ok: true, ownerAuthReady: true }, { disciples: [], auditLogs: [] }, { now: () => '2026-09-25T19:30:00.000Z' });
  assert.equal(result.status, 'ready');
  assert.equal(result.summary.criticalMissing, 0);
  assert.equal(result.checks.find(item => item.key === 'persistent_storage').status, 'ready');
  assert.equal(result.checks.find(item => item.key === 'resend_email').status, 'ready');
});

test('reports missing critical settings without exposing secret values', () => {
  const result = buildSystemHealth({ BASE_URL: 'https://example.com' }, { ok: true, ownerAuthReady: true }, { disciples: [], auditLogs: [] });
  assert.equal(result.status, 'attention');
  assert.ok(result.summary.criticalMissing >= 4);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /sk_live|whsec|re_secret|intake_secret|sync_secret/);
  assert.equal(result.checks.find(item => item.key === 'stripe_payments').status, 'missing');
  assert.equal(result.checks.find(item => item.key === 'disciple_intake').status, 'missing');
});

test('reports a failed storage probe as a critical failure', () => {
  const result = buildSystemHealth(completeEnv, { ok: false, error: 'read-only filesystem', ownerAuthReady: true }, { disciples: [], auditLogs: [] });
  const storage = result.checks.find(item => item.key === 'persistent_storage');
  assert.equal(result.status, 'attention');
  assert.equal(storage.status, 'failed');
  assert.equal(storage.detail, 'Persistent storage is not writable.');
  assert.doesNotMatch(JSON.stringify(result), /read-only filesystem/);
});

test('surfaces recent welcome failure as operational attention', () => {
  const store = {
    disciples: [{ id: 'dsc_1', welcomeEmail: { status: 'failed', attemptedAt: '2026-09-25T19:00:00.000Z', error: 'Provider timeout' } }],
    auditLogs: []
  };
  const result = buildSystemHealth(completeEnv, { ok: true, ownerAuthReady: true }, store);
  assert.equal(result.status, 'attention');
  assert.equal(result.summary.emailAttention, 1);
  assert.deepEqual(result.recentFailures[0], { type: 'welcome_email', entityId: 'dsc_1', occurredAt: '2026-09-25T19:00:00.000Z', message: 'Provider timeout' });
});

test('marks optional legal gate as attention instead of a critical outage', () => {
  const env = { ...completeEnv, COMMUNITY_BONUS_LEGAL_APPROVED: 'false' };
  const result = buildSystemHealth(env, { ok: true, ownerAuthReady: true }, { disciples: [], auditLogs: [] });
  const legal = result.checks.find(item => item.key === 'community_bonus_legal');
  assert.equal(legal.required, false);
  assert.equal(legal.status, 'attention');
  assert.equal(result.summary.criticalMissing, 0);
});

test('requires an explicitly configured persistent data directory', () => {
  const result = buildSystemHealth(completeEnv, { ok: true, ownerAuthReady: true, persistentConfigured: false }, { disciples: [], auditLogs: [] }, { now: () => '2026-09-25T19:30:00.000Z' });
  const storage = result.checks.find(item => item.key === 'persistent_storage');
  assert.equal(storage.status, 'failed');
  assert.equal(result.summary.criticalMissing, 1);
});
