import test from 'node:test';
import assert from 'node:assert/strict';
import {
  creditDiscipleSale,
  markDiscipleCommissionPaid,
  reverseDiscipleCommission,
} from '../lib/disciple-financial-operations.js';
import {
  discipleApplicationsCsv,
  disciplesCsv,
  discipleCommissionsCsv,
  disciplePayoutsCsv,
} from '../lib/disciple-exports.js';

const now = () => '2026-09-25T13:00:00.000Z';
const id = prefix => `${prefix}_generated`;

function store(status = 'pending') {
  return {
    settings: { defaultDiscipleCommissionPercent: 10 },
    disciples: [{ id: 'dsc_1', name: 'Disciple One', status: 'active', defaultCommissionPercent: 10 }],
    discipleCommissions: [{ id: 'com_1', discipleId: 'dsc_1', amount: 490, eligibleBase: 4900, status }],
    disciplePayouts: [],
    discipleCommunityBonuses: [],
    auditLogs: [],
  };
}

test('pending commission can be recorded paid once with a payment reference', () => {
  const data = store();
  const result = markDiscipleCommissionPaid(data, { commissionId: 'com_1', paymentReference: 'ACH-100', actorId: 'owner_1' }, { now, id });
  assert.equal(result.commission.status, 'paid');
  assert.equal(result.commission.paymentReference, 'ACH-100');
  assert.equal(result.payout.amount, 490);
  assert.equal(data.disciplePayouts.length, 1);
});

test('already-paid commission cannot create a duplicate payout', () => {
  const data = store('paid');
  assert.throws(() => markDiscipleCommissionPaid(data, { commissionId: 'com_1', paymentReference: 'ACH-101', actorId: 'owner_1' }, { now, id }), /already paid/i);
  assert.equal(data.disciplePayouts.length, 0);
});

test('reversed commission cannot be marked paid', () => {
  const data = store('reversed');
  assert.throws(() => markDiscipleCommissionPaid(data, { commissionId: 'com_1', paymentReference: 'ACH-102', actorId: 'owner_1' }, { now, id }), /reversed/i);
});

test('pending commission can be reversed with an auditable reason', () => {
  const data = store();
  const result = reverseDiscipleCommission(data, { commissionId: 'com_1', reason: 'Refunded order', actorId: 'owner_1' }, { now, reverseCommunityBonus: () => null });
  assert.equal(result.commission.status, 'reversed');
  assert.equal(result.commission.reversalReason, 'Refunded order');
  assert.equal(data.auditLogs.at(-1).action, 'disciple.commission_reversed');
});

test('already-reversed commission cannot be reversed again', () => {
  const data = store('reversed');
  assert.throws(() => reverseDiscipleCommission(data, { commissionId: 'com_1', reason: 'Again', actorId: 'owner_1' }, { now, reverseCommunityBonus: () => null }), /already reversed/i);
});

test('refund-flagged commission can be reversed with an auditable reason', () => {
  const data = store('reversal_required');
  const result = reverseDiscipleCommission(data, { commissionId: 'com_1', reason: 'Stripe refund confirmed', actorId: 'owner_1' }, { now, reverseCommunityBonus: () => null });
  assert.equal(result.commission.status, 'reversed');
  assert.equal(result.commission.reversalReason, 'Stripe refund confirmed');
});

test('reversing an already-paid commission creates an explicit recovery offset', () => {
  const data = store('reversal_required');
  data.discipleCommissions[0].reversalPriorStatus = 'paid';
  data.discipleCommissions[0].paidAt = '2026-09-15T12:00:00.000Z';
  data.disciplePayouts.push({ id: 'dsp_paid', commissionId: 'com_1', amount: 490, status: 'paid' });
  const result = reverseDiscipleCommission(data, { commissionId: 'com_1', reason: 'Chargeback', actorId: 'owner_1' }, { now, id, reverseCommunityBonus: () => null });
  assert.equal(result.commission.status, 'reversed_paid_recovery_required');
  assert.equal(result.recovery.amount, -490);
  assert.equal(result.recovery.status, 'recovery_required');
  assert.equal(data.disciplePayouts.length, 2);
});

test('manual sale credit rejects an invalid eligible amount', () => {
  const data = store();
  assert.throws(() => creditDiscipleSale(data, { discipleId: 'dsc_1', amountPaid: 0, reference: 'SALE-1', actorId: 'owner_1' }, { now, id }), /positive amount/i);
});

test('manual sale credit rejects a reference used by any commission source', () => {
  const data = store();
  data.discipleCommissions[0].orderId = 'REAL-ORDER-1';
  data.discipleCommissions[0].sourceType = 'event_order';
  assert.throws(() => creditDiscipleSale(data, { discipleId: 'dsc_1', amountPaid: 4900, reference: 'REAL-ORDER-1', actorId: 'owner_1' }, { now, id }), /already been credited/i);
});

test('payment recording requires a real reference', () => {
  const data = store();
  assert.throws(() => markDiscipleCommissionPaid(data, { commissionId: 'com_1', paymentReference: '  ', actorId: 'owner_1' }, { now, id }), /payment reference/i);
});

test('application export preserves contact, consent, recruiting, and agreement evidence', () => {
  const csv = discipleApplicationsCsv([{ applicationReference: 'KVN-D-1', legalFirstName: 'Jane', legalLastName: 'Disciple', email: 'jane@example.com', mobile: '+19195551212', weeklyPostCommitment: true, agreementAccepted: true, electronicRecordsConsent: true, recordsAccessConfirmed: true, recruitingLeaderHandle: 'leaderone', agreementVersion: '2.2', agreementAcceptedAt: '2026-09-25T12:00:00.000Z', submittedAt: '2026-09-25T12:01:00.000Z' }]);
  for (const value of ['applicationReference','email','mobile','weeklyPostCommitment','electronicRecordsConsent','recruitingLeaderHandle','agreementVersion','agreementAcceptedAt','submittedAt','jane@example.com']) assert.match(csv, new RegExp(value));
});

test('Disciple export protects spreadsheet formulas and includes operational identity', () => {
  const csv = disciplesCsv([{ id: 'dsc_1', name: '=CMD()', email: 'jane@example.com', code: 'JANE', handle: 'janedisciple', status: 'active', defaultCommissionPercent: 10, createdAt: '2026-09-25T12:00:00.000Z' }]);
  assert.match(csv, /'\=CMD\(\)/);
  for (const header of ['code','handle','status','defaultCommissionPercent','welcomeEmailStatus']) assert.match(csv, new RegExp(header));
});

test('CSV export neutralizes formulas after leading whitespace and control characters', () => {
  const csv = disciplesCsv([{ id: 'dsc_1', name: ' \t=CMD()', email: 'jane@example.com' }]);
  assert.match(csv, /' \t=CMD\(\)/);
});

test('commission and payout exports join Disciple names and keep financial references', () => {
  const disciples = [{ id: 'dsc_1', name: 'Jane Disciple', email: 'jane@example.com' }];
  const commissionCsv = discipleCommissionsCsv([{ id: 'com_1', discipleId: 'dsc_1', sourceType: 'kingdom_market', eligibleBase: 4900, ratePercent: 10, amount: 490, status: 'pending', payoutDate: '2026-10-15' }], disciples);
  const payoutCsv = disciplePayoutsCsv([{ id: 'dsp_1', discipleId: 'dsc_1', commissionId: 'com_1', amount: 490, status: 'paid', paymentReference: 'ACH-100', createdAt: '2026-10-15T12:00:00.000Z' }], disciples);
  assert.match(commissionCsv, /Jane Disciple/);
  assert.match(commissionCsv, /4900/);
  assert.match(payoutCsv, /ACH-100/);
  assert.match(payoutCsv, /commissionId/);
});

test('every export emits stable headers when there are no records', () => {
  assert.match(discipleApplicationsCsv([]), /^id,applicationReference,status,/);
  assert.match(disciplesCsv([]), /^id,name,email,/);
  assert.match(discipleCommissionsCsv([], []), /^id,discipleId,discipleName,/);
  assert.match(disciplePayoutsCsv([], []), /^id,discipleId,discipleName,/);
});
