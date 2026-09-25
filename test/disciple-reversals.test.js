import test from 'node:test';
import assert from 'node:assert/strict';
import { flagOrderCommissionsForReversal } from '../lib/disciple-reversals.js';

test('Stripe refund flags every order commission for reversal idempotently', () => {
  const store = { discipleCommissions: [
    { id: 'com_1', orderId: 'ord_1', status: 'pending' },
    { id: 'com_2', orderId: 'ord_1', status: 'paid', paidAt: '2026-09-15T12:00:00.000Z' },
  ], auditLogs: [] };
  const deps = { id: prefix => `${prefix}_1`, now: () => '2026-09-25T20:00:00.000Z' };
  const first = flagOrderCommissionsForReversal(store, { orderId: 'ord_1', reason: 'Stripe dispute opened', sourceEventId: 'evt_1' }, deps);
  const second = flagOrderCommissionsForReversal(store, { orderId: 'ord_1', reason: 'Stripe dispute opened', sourceEventId: 'evt_1' }, deps);
  assert.equal(first.length, 2);
  assert.equal(second.length, 0);
  assert.ok(store.discipleCommissions.every(item => item.status === 'reversal_required'));
  assert.equal(store.discipleCommissions[1].reversalPriorStatus, 'paid');
  assert.equal(store.auditLogs.length, 2);
});
