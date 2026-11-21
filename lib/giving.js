// The owner ledger is a projection of existing gifts. Checkout keys and approval URLs
// must never appear in the dashboard response.
export function givingLedger(donations) {
  const gifts = donations.filter(gift => !gift.paypalSetupTest).map(gift => {
    const provider = gift.paymentProvider || (gift.paypalOrderId ? 'paypal' : 'stripe');
    let status = gift.status || 'pending';
    if (gift.paymentAttention || gift.paypalVerification?.needsReview || (provider === 'paypal' && !gift.paypalOrderId && Date.now() - Date.parse(gift.createdAt) > 5*3600000)) status = 'payment_review';
    return {
      id: gift.id, name: gift.name || '', amount: Number(gift.amountTotal ?? gift.amount) || 0,
      provider, status, date: gift.paidAt || gift.createdAt,
      order: gift.paypalOrderId || gift.stripeSessionId || '',
      transaction: gift.paypalCaptureId || gift.stripePaymentIntentId || '',
      verification: gift.paymentAttention?.type || gift.paypalVerification?.result ||
        (provider === 'paypal' && !gift.paypalOrderId ? 'missing_order' : ''),
      checkedAt: gift.paypalVerification?.checkedAt || ''
    };
  }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const paid = gifts.filter(gift => gift.status === 'paid');
  return {
    gifts, paidCount: paid.length,
    confirmedCents: paid.reduce((sum, gift) => sum + gift.amount, 0),
    pendingCount: gifts.filter(gift => gift.status === 'pending').length,
    reviewCount: gifts.filter(gift => gift.status === 'payment_review').length
  };
}
