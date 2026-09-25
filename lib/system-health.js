function configured(value) {
  return Boolean(String(value || '').trim());
}

function check(key, label, required, ready, detail) {
  return { key, label, required, status: ready ? 'ready' : required ? 'missing' : 'attention', detail };
}

export function buildSystemHealth(env = {}, storageProbe = {}, store = {}, deps = {}) {
  const persistentStorageReady = storageProbe.ok === true && storageProbe.persistentConfigured !== false;
  const checks = [
    {
      key: 'persistent_storage',
      label: 'Persistent storage',
      required: true,
      status: persistentStorageReady ? 'ready' : 'failed',
      detail: persistentStorageReady ? 'Configured persistent data storage passed a write/read probe.' : storageProbe.ok ? 'DATA_DIR must point to persistent storage.' : 'Persistent storage is not writable.'
    },
    check('stripe_payments', 'Stripe payment key', true, configured(env.STRIPE_SECRET_KEY), configured(env.STRIPE_SECRET_KEY) ? 'Payments are configured.' : 'Stripe payment key is missing.'),
    check('stripe_webhook', 'Stripe webhook secret', true, configured(env.STRIPE_WEBHOOK_SECRET), configured(env.STRIPE_WEBHOOK_SECRET) ? 'Payment completion events are configured.' : 'Stripe webhook secret is missing.'),
    check('resend_email', 'Resend email key', true, configured(env.RESEND_API_KEY), configured(env.RESEND_API_KEY) ? 'Transactional email is configured.' : 'Resend email key is missing.'),
    check('disciple_sender', 'Disciple welcome sender', false, configured(env.DISCIPLE_FROM_EMAIL), configured(env.DISCIPLE_FROM_EMAIL) ? 'Welcome sender is configured.' : 'Using the default KVN welcome sender.'),
    check('disciple_intake', 'Disciple intake secret', true, configured(env.DISCIPLE_INTAKE_SECRET), configured(env.DISCIPLE_INTAKE_SECRET) ? 'KVNLive.com intake is authenticated.' : 'Disciple intake secret is missing.'),
    check('disciple_sync', 'Disciple approval/sync secret', true, configured(env.DISCIPLE_SYNC_SECRET), configured(env.DISCIPLE_SYNC_SECRET) ? 'Approved-application sync is authenticated.' : 'Disciple sync secret is missing.'),
    check('owner_auth', 'Owner authentication', true, storageProbe.ownerAuthReady !== false && configured(env.OWNER_EMAIL), storageProbe.ownerAuthReady !== false && configured(env.OWNER_EMAIL) ? 'Owner authentication is configured.' : 'Owner authentication requires attention.'),
    check('public_url', 'Public service URL', true, configured(env.BASE_URL), configured(env.BASE_URL) ? 'Public service URL is configured.' : 'Public service URL is missing.'),
    check('secure_cookie', 'Secure session cookie', true, true, 'Sessions use Secure, HttpOnly, SameSite=Strict cookies.'),
    check('community_bonus_legal', 'Community Bonus legal gate', false, env.COMMUNITY_BONUS_LEGAL_APPROVED === 'true', env.COMMUNITY_BONUS_LEGAL_APPROVED === 'true' ? 'Community Bonus payouts are enabled.' : 'Community Bonus payouts remain disabled pending legal approval.')
  ];

  const recentFailures = [];
  for (const disciple of store.disciples || []) {
    const welcome = disciple.welcomeEmail;
    if (welcome && welcome.status !== 'sent') recentFailures.push({
      type: 'welcome_email',
      entityId: String(disciple.id || ''),
      occurredAt: String(welcome.attemptedAt || welcome.failedAt || ''),
      message: String(welcome.error || 'Welcome email requires attention.').slice(0, 200)
    });
  }
  for (const entry of store.auditLogs || []) {
    if (!['disciple.intake_failed', 'storage.write_failed'].includes(entry.action)) continue;
    recentFailures.push({
      type: entry.action === 'storage.write_failed' ? 'storage' : 'disciple_intake',
      entityId: String(entry.entityId || ''),
      occurredAt: String(entry.createdAt || ''),
      message: String(entry.meta?.error || 'Operation requires attention.').slice(0, 200)
    });
  }
  recentFailures.sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)));

  const criticalMissing = checks.filter(item => item.required && item.status !== 'ready').length;
  const emailAttention = recentFailures.filter(item => item.type === 'welcome_email').length;
  const needsAttention = criticalMissing > 0 || emailAttention > 0 || checks.some(item => item.status === 'attention' || item.status === 'failed');
  return {
    status: needsAttention ? 'attention' : 'ready',
    checkedAt: (deps.now || (() => new Date().toISOString()))(),
    summary: { criticalMissing, emailAttention, totalChecks: checks.length },
    checks,
    recentFailures: recentFailures.slice(0, 10)
  };
}
