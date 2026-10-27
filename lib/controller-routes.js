import crypto from 'node:crypto';
import { buildDashboardMetrics } from './dashboard-metrics.js';
import { sponsoredReport } from './sponsored-passes.js';

const list = value => Array.isArray(value) ? value : [];
const count = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const emailKey = value => String(value || '').trim().toLowerCase();

export function controllerOverview(data = {}) {
  const orders = list(data.orders);
  const metrics = buildDashboardMetrics(orders);
  const sponsored = sponsoredReport({ ...data, orders });
  const paidShopOrders = list(data.shopOrders).filter(order => order.status === 'paid');
  const campaigns = list(data.marketing?.campaigns);
  const disciples = list(data.disciples);
  return {
    schemaVersion: 1,
    tickets: {
      paidOrders: metrics.paidOrders,
      paidRevenueCents: count(metrics.paidRevenue),
      activeTickets: metrics.activeTickets,
      refundedOrders: metrics.refundedOrderCount
    },
    sponsored: {
      capacity: sponsored.cap,
      passesClaimed: sponsored.claimed,
      claimants: sponsored.guestClaims,
      remaining: sponsored.remaining,
      discipleApplications: sponsored.applications,
      paidUpgrades: sponsored.paidUpgrades,
      upgradeRevenueCents: count(sponsored.upgradeRevenue)
    },
    apparel: { paidOrders: paidShopOrders.length },
    disciples: {
      total: disciples.length,
      active: disciples.filter(d => d.status === 'active').length
    },
    marketing: {
      campaignsTotal: campaigns.length,
      campaignsSending: campaigns.filter(c => c.status === 'sending').length,
      campaignsDraft: campaigns.filter(c => c.status === 'draft').length
    }
  };
}

// An unknown suppression state must never be presented as a safe-to-send audience.
export function controllerAudiences(data = {}, blockedEmails = null) {
  const contacts = list(data.marketing?.contacts);
  const lists = list(data.marketing?.lists);
  const blocks = blockedEmails instanceof Set ? blockedEmails : null;
  return {
    schemaVersion: 1,
    suppressionVerified: blocks !== null,
    lists: lists.map(group => {
      const members = contacts.filter(c => !c.archivedAt && list(c.listIds).includes(group.id));
      const subscribed = members.filter(c => c.permission === 'subscribed');
      const safe = blocks === null ? null : subscribed.filter(c => !blocks.has(emailKey(c.email))).length;
      return {
        id: group.id,
        name: group.name,
        total: members.length,
        subscribed: subscribed.length,
        eligibleAfterProviderSuppression: safe,
        permissionUnknown: members.filter(c => c.permission === 'unknown').length
      };
    })
  };
}

export function controllerCampaigns(data = {}, engagement = null) {
  return {
    schemaVersion: 1,
    campaigns: list(data.marketing?.campaigns).slice(-30).reverse().map(c => {
      const recipients = list(c.recipients);
      let engagementSummary = null;
      if (engagement && typeof engagement.report === 'function') {
        try {
          const stats = engagement.report(c).summary;
          engagementSummary = {
            accepted: count(stats.accepted),
            delivered: count(stats.delivered),
            opened: count(stats.opened),
            clicked: count(stats.clicked),
            bounced: count(stats.bounced),
            complained: count(stats.complained)
          };
        } catch {
          engagementSummary = null;
        }
      }
      return {
        id: c.id,
        subject: c.subject,
        status: c.status,
        createdAt: c.createdAt || null,
        startedAt: c.startedAt || null,
        completedAt: c.completedAt || null,
        recipientCount: recipients.length,
        acceptedCount: recipients.filter(r => r.status === 'accepted').length,
        engagement: engagementSummary
      };
    })
  };
}

/** Owner-controlled access gate for the Controller reporting API and future scoped connectors.
 * Missing or malformed saved state is OFF; no auto-enablement on startup.
 */
export function controllerAccessState(data = {}) {
  const value = data.settings?.controllerAccess;
  return {
    enabled: value?.enabled === true,
    revision: Number.isSafeInteger(value?.revision) && value.revision >= 0 ? value.revision : 0,
    updatedAt: typeof value?.updatedAt === 'string' ? value.updatedAt : null,
    connectorConfigured: Boolean(process.env.KVN_CONTROLLER_OAUTH_ISSUER && process.env.KVN_CONTROLLER_OAUTH_JWKS_URL && process.env.KVN_CONTROLLER_OAUTH_OWNER_SUB) // Identity provider configured, not necessarily linked to ChatGPT.
  };
}

export function setControllerAccess(data, { enabled, expectedRevision, user, now = new Date().toISOString() } = {}) {
  if (typeof enabled !== 'boolean') throw Object.assign(new Error('Choose ON or OFF.'), { statusCode: 400 });
  const current = controllerAccessState(data);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== current.revision) {
    throw Object.assign(new Error('Controller settings changed. Reload before retrying.'), { statusCode: 409 });
  }
  if (current.enabled === enabled) return { ...current, changed: false };
  data.settings ??= {};
  data.settings.controllerAccess = { enabled, revision: current.revision + 1, updatedAt: now };
  data.auditLogs ??= [];
  data.auditLogs.unshift({
    id: 'controller_' + crypto.randomUUID(),
    userId: user?.id || 'owner',
    userName: user?.name || 'Owner',
    action: enabled ? 'controller.access.enabled' : 'controller.access.disabled',
    entityType: 'controller',
    entityId: 'access',
    createdAt: now
  });
  return { ...controllerAccessState(data), changed: true };
}

/**
 * Owner-session-only, read-only controller reporting. This is NOT a machine
 * credential or a ChatGPT connector. Do not add cross-origin access or writes.
 */
export function registerControllerRoutes(app, { auth, owner, readStore, writeStore, engagement, baseUrl }) {
  if (typeof auth !== 'function' || typeof owner !== 'function' || typeof readStore !== 'function' || typeof writeStore !== 'function' || !baseUrl) {
    throw new Error('Owner authentication and readStore are required for controller routes.');
  }
  const noStore = (req, res, next) => {
    res.set({
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff'
    });
    next();
  };
  const requireControllerEnabled = (req, res, next) => {
    // Read on EVERY request, so turning OFF immediately blocks subsequent calls.
    if (!controllerAccessState(readStore()).enabled) {
      return res.status(403).json({ error: 'Controller access is OFF. Enable it in Super Admin.' });
    }
    next();
  };
  const sameOrigin = (req, res, next) => {
    if (req.headers.origin !== new URL(baseUrl).origin || req.headers['sec-fetch-site'] === 'cross-site') {
      return res.status(403).json({ error: 'Use the signed-in dashboard.' });
    }
    next();
  };
  // Access status remains available when OFF. Neither route makes a ChatGPT connection.
  app.get('/api/controller/v1/access', auth, owner, noStore, (req, res) => {
    res.json(controllerAccessState(readStore()));
  });
  app.put('/api/controller/v1/access', auth, owner, sameOrigin, noStore, (req, res) => {
    try {
      const data = readStore();
      const result = setControllerAccess(data, {
        enabled: req.body?.enabled,
        expectedRevision: req.body?.expectedRevision,
        user: req.user
      });
      if (result.changed) writeStore(data);
      res.json(result);
    } catch (error) {
      res.status(error.statusCode || 500).json({
        error: error.statusCode ? error.message : 'Could not change Controller access.'
      });
    }
  });
  app.get('/api/controller/v1/overview', auth, owner, requireControllerEnabled, noStore, (req, res) => {
    res.json({ generatedAt: new Date().toISOString(), ...controllerOverview(readStore()) });
  });
  app.get('/api/controller/v1/audiences', auth, owner, requireControllerEnabled, noStore, (req, res) => {
    const store = readStore();
    let blocks = null;
    try {
      if (engagement && typeof engagement.blockedEmails === 'function') {
        blocks = engagement.blockedEmails(store);
      }
    } catch {
      // Fail closed: no numeric "safe to send" count on suppression failure.
    }
    res.json({ generatedAt: new Date().toISOString(), ...controllerAudiences(store, blocks) });
  });
  app.get('/api/controller/v1/campaigns', auth, owner, requireControllerEnabled, noStore, (req, res) => {
    res.json({ generatedAt: new Date().toISOString(), ...controllerCampaigns(readStore(), engagement) });
  });
}
