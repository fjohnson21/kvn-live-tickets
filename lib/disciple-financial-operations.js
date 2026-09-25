function operationError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function timestamp(deps) {
  return (deps.now || (() => new Date().toISOString()))();
}

function appendAudit(store, deps, action, entityId, actorId, details = {}) {
  store.auditLogs ||= [];
  store.auditLogs.push({
    id: typeof deps.id === 'function' ? deps.id('log') : `log_${store.auditLogs.length + 1}`,
    userId: actorId,
    userName: 'Owner',
    action,
    entityType: 'disciple_commission',
    entityId,
    details,
    createdAt: timestamp(deps),
  });
}

function nextMonthlyPayoutDate(iso) {
  const date = new Date(iso);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return new Date(Date.UTC(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1, 15)).toISOString().slice(0, 10);
}

export function markDiscipleCommissionPaid(store, input, deps = {}) {
  const commission = (store.discipleCommissions || []).find(item => item.id === input.commissionId);
  if (!commission) throw operationError('Commission not found.', 404);
  if (commission.status === 'paid') throw operationError('Commission is already paid.', 409);
  if (commission.status === 'reversed') throw operationError('Reversed commission cannot be paid.', 409);
  if (commission.status !== 'pending') throw operationError(`Commission status ${commission.status || 'unknown'} cannot be paid.`, 409);
  if (!Number.isInteger(Number(commission.amount)) || Number(commission.amount) <= 0) throw operationError('Commission requires a positive amount.', 400);
  const paymentReference = String(input.paymentReference || '').trim();
  if (!paymentReference) throw operationError('A payment reference is required.', 400);
  const paidAt = timestamp(deps);
  commission.status = 'paid';
  commission.paidAt = paidAt;
  commission.paymentReference = paymentReference;
  store.disciplePayouts ||= [];
  const payout = {
    id: deps.id('dsp'),
    discipleId: commission.discipleId,
    commissionId: commission.id,
    amount: Number(commission.amount),
    status: 'paid',
    paymentReference,
    createdAt: paidAt,
  };
  store.disciplePayouts.push(payout);
  appendAudit(store, deps, 'disciple.commission_paid', commission.id, input.actorId, { paymentReference, amount: payout.amount });
  return { commission, payout };
}

export function reverseDiscipleCommission(store, input, deps = {}) {
  const commission = (store.discipleCommissions || []).find(item => item.id === input.commissionId);
  if (!commission) throw operationError('Commission not found.', 404);
  if (commission.status === 'paid') throw operationError('Paid commission requires a manual adjustment.', 409);
  if (commission.status === 'reversed') throw operationError('Commission is already reversed.', 409);
  if (!['pending', 'reversal_required'].includes(commission.status)) throw operationError(`Commission status ${commission.status || 'unknown'} cannot be reversed.`, 409);
  const reason = String(input.reason || '').trim();
  if (!reason) throw operationError('A reversal reason is required.', 400);
  const priorStatus = commission.reversalPriorStatus || commission.status;
  let recovery = null;
  if (priorStatus === 'paid') {
    store.disciplePayouts ||= [];
    recovery = store.disciplePayouts.find(item => item.commissionId === commission.id && item.status === 'recovery_required') || {
      id: deps.id('dsp'), discipleId: commission.discipleId, commissionId: commission.id, amount: -Math.abs(Number(commission.amount)), status: 'recovery_required', paymentReference: '', reason, createdAt: timestamp(deps)
    };
    if (!store.disciplePayouts.includes(recovery)) store.disciplePayouts.push(recovery);
    commission.status = 'reversed_paid_recovery_required';
    commission.recoveryAdjustmentId = recovery.id;
  } else commission.status = 'reversed';
  commission.reversedAt = timestamp(deps);
  commission.reversalReason = reason;
  if (typeof deps.reverseCommunityBonus === 'function') deps.reverseCommunityBonus(store, commission.id, { now: deps.now });
  appendAudit(store, deps, 'disciple.commission_reversed', commission.id, input.actorId, { reason });
  return { commission, recovery };
}

export function creditDiscipleSale(store, input, deps = {}) {
  const disciple = (store.disciples || []).find(item => item.id === input.discipleId && item.status === 'active');
  if (!disciple) throw operationError('Active Disciple not found.', 404);
  const amountPaid = Number(input.amountPaid);
  if (!Number.isSafeInteger(amountPaid) || amountPaid <= 0) throw operationError('A positive amount paid in cents is required.', 400);
  const reference = String(input.reference || '').trim();
  if (!reference) throw operationError('A sale reference is required.', 400);
  if ((store.discipleCommissions || []).some(item => item.orderId === reference)) throw operationError('That sale reference has already been credited.', 409);
  const rate = Math.max(0, Math.min(100, Number(input.ratePercent ?? disciple.defaultCommissionPercent ?? store.settings?.defaultDiscipleCommissionPercent ?? 10)));
  const amount = Math.round(amountPaid * rate / 100);
  if (amount <= 0) throw operationError('The configured rate produces no commission.', 400);
  const earnedAt = timestamp(deps);
  const commission = {
    id: deps.id('com'),
    discipleId: disciple.id,
    eventId: '',
    orderId: reference,
    ratePercent: rate,
    eligibleBase: amountPaid,
    amount,
    status: 'pending',
    sourceType: String(input.sourceType || 'kingdom_market'),
    sourceLabel: String(input.sourceLabel || 'Kingdom Market'),
    earnedAt,
    payoutDate: nextMonthlyPayoutDate(earnedAt),
    paidAt: '',
    paymentReference: '',
    createdAt: earnedAt,
  };
  store.discipleCommissions ||= [];
  store.discipleCommissions.push(commission);
  if (typeof deps.createCommunityBonus === 'function') deps.createCommunityBonus(store, { commission, order: { id: reference, buyerEmail: String(input.buyerEmail || ''), amountTotal: amountPaid, commissionEligible: true } }, { id: deps.id, now: deps.now });
  appendAudit(store, deps, 'disciple.sale_credited', commission.id, input.actorId, { reference, amountPaid, amount });
  return commission;
}
