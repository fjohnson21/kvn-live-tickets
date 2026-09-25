export function flagOrderCommissionsForReversal(store, input, deps = {}) {
  const now = (deps.now || (() => new Date().toISOString()))();
  const affected = [];
  store.auditLogs ||= [];
  for (const commission of store.discipleCommissions || []) {
    if (commission.orderId !== input.orderId) continue;
    if (['reversed', 'reversal_required'].includes(commission.status)) continue;
    commission.reversalPriorStatus = commission.status;
    commission.status = 'reversal_required';
    commission.reversalNote = String(input.reason || 'Payment reversed or disputed.').slice(0, 500);
    commission.reversalSourceEventId = String(input.sourceEventId || '');
    commission.reversalRequiredAt = now;
    affected.push(commission);
    store.auditLogs.push({
      id: typeof deps.id === 'function' ? deps.id('log') : `log_${store.auditLogs.length + 1}`,
      userId: 'system',
      userName: 'Stripe webhook',
      action: 'disciple.commission_reversal_required',
      entityType: 'disciple_commission',
      entityId: commission.id,
      meta: { orderId: input.orderId, reason: commission.reversalNote, sourceEventId: commission.reversalSourceEventId },
      createdAt: now,
    });
  }
  return affected;
}
