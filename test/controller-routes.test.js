import test from 'node:test';
import assert from 'node:assert/strict';
import {
  controllerOverview, controllerAudiences, controllerCampaigns, controllerAccessState, setControllerAccess, registerControllerRoutes
} from '../lib/controller-routes.js';

const fixture = () => ({
  orders: [
    { status: 'paid', amountTotal: 6000, buyerEmail: 'private@example.com', tickets: [{ code: 'SECRET' }, { status: 'replaced' }] },
    { status: 'refunded', amountTotal: 2500, tickets: [] }
  ],
  sponsoredClaims: [{ id: 'claim-one', email: 'private@example.com', name: 'Private Guest', quantity: 2, claimedAt: '2026-10-12T18:00:00Z' }],
  sponsoredInvitations: [],
  discipleApplications: [],
  disciples: [{ id: 'disciple-one', status: 'active', email: 'private@example.com' }],
  shopOrders: [{ status: 'paid', buyerEmail: 'private@example.com' }],
  marketing: {
    lists: [{ id: 'ticket-buyers', name: 'Ticket Buyers' }],
    contacts: [
      { id: 'one', email: 'subscribed@example.com', permission: 'subscribed', listIds: ['ticket-buyers'] },
      { id: 'two', email: 'unknown@example.com', permission: 'unknown', listIds: ['ticket-buyers'] },
      { id: 'three', email: 'blocked@example.com', permission: 'subscribed', listIds: ['ticket-buyers'] },
      { id: 'four', email: 'optout@example.com', permission: 'unsubscribed', listIds: ['ticket-buyers'] }
    ],
    campaigns: [{ id: 'cmp-one', subject: 'A private campaign', status: 'draft', recipients: [], createdAt: '2026-10-12T00:00:00Z' }]
  }
});

test('overview summarizes operations without exposing customer identities or ticket codes', () => {
  const result = controllerOverview(fixture());
  assert.equal(result.tickets.paidOrders, 1);
  assert.equal(result.tickets.paidRevenueCents, 6000);
  assert.equal(result.tickets.activeTickets, 1);
  assert.equal(result.sponsored.passesClaimed, 2);
  assert.equal(result.disciples.active, 1);
  assert.equal(result.marketing.campaignsDraft, 1);
  assert.doesNotMatch(JSON.stringify(result), /private@example\.com|SECRET|Private Guest/);
});

test('audiences fail closed on missing provider suppression information', () => {
  const result = controllerAudiences(fixture());
  assert.equal(result.suppressionVerified, false);
  assert.equal(result.lists[0].total, 4);
  assert.equal(result.lists[0].subscribed, 2);
  assert.equal(result.lists[0].permissionUnknown, 1);
  assert.equal(result.lists[0].eligibleAfterProviderSuppression, null);
  assert.doesNotMatch(JSON.stringify(result), /@example\.com/);
});

test('audiences exclude provider-suppressed subscribers', () => {
  const result = controllerAudiences(fixture(), new Set(['blocked@example.com']));
  assert.equal(result.suppressionVerified, true);
  assert.equal(result.lists[0].eligibleAfterProviderSuppression, 1);
});

test('campaign reporting exposes aggregate engagement only', () => {
  const report = controllerCampaigns(fixture(), {
    report: () => ({ summary: { accepted: 12, delivered: 10, opened: 3, clicked: 2, bounced: 1, complained: 0 } })
  });
  assert.equal(report.campaigns[0].engagement.delivered, 10);
  assert.equal(report.campaigns[0].engagement.clicked, 2);
  assert.doesNotMatch(JSON.stringify(report), /private@example\.com|blocked@example\.com/);
});

test('controller routes require both existing session authentication and owner authorization', () => {
  const routes = [];
  const auth = () => {};
  const owner = () => {};
  const app = { get: (...args) => routes.push(args), put: (...args) => routes.push(args) };
  registerControllerRoutes(app, { auth, owner, readStore: fixture, writeStore: () => {}, baseUrl: 'https://kvn.example' });
  assert.deepEqual(routes.map(route => route[0]), [
    '/api/controller/v1/access', '/api/controller/v1/access',
    '/api/controller/v1/overview', '/api/controller/v1/audiences', '/api/controller/v1/campaigns'
  ]);
  for (const route of routes) {
    assert.strictEqual(route[1], auth);
    assert.strictEqual(route[2], owner);
  }
  assert.equal(routes[0].length, 5);
  assert.equal(routes[1].length, 6);
  for (const route of routes.slice(2)) assert.equal(route.length, 6);
  assert.throws(() => registerControllerRoutes(app, { auth, readStore: fixture }), /Owner authentication/);
});

test('controller routes never mutate the source store', () => {
  const data = fixture();
  const original = JSON.stringify(data);
  controllerOverview(data);
  controllerAudiences(data, new Set());
  controllerCampaigns(data);
  assert.equal(JSON.stringify(data), original);
});

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  set() { return this; }
});

test('Controller access defaults to OFF and reporting is blocked without changing regular dashboard data', () => {
  const d = fixture();
  assert.deepEqual(controllerAccessState(d), {
    enabled: false, revision: 0, updatedAt: null, connectorConfigured: false
  });
  const before = JSON.stringify(d);
  const routes = [];
  registerControllerRoutes(
    { get: (...args) => routes.push(args), put: (...args) => routes.push(args) },
    { auth: () => {}, owner: () => {}, readStore: () => d, writeStore: () => {}, baseUrl: 'https://kvn.example' }
  );
  const guard = routes.find(r => r[0] === '/api/controller/v1/overview')[3];
  const res = response();
  let reached = false;
  guard({}, res, () => { reached = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(reached, false);
  assert.equal(JSON.stringify(d), before);
});

test('Controller toggle is owner-only, origin-checked, versioned, audited, and reversible', () => {
  const d = fixture();
  const originalOrders = JSON.stringify(d.orders), originalMarketing = JSON.stringify(d.marketing);
  const routes = [];
  let saves = 0;
  const app = { get: (...args) => routes.push(args), put: (...args) => routes.push(args) };
  const auth = () => {}, owner = () => {};
  registerControllerRoutes(app, {
    auth, owner, readStore: () => d, writeStore: () => { saves++; }, baseUrl: 'https://kvn.example'
  });
  const put = routes.find(r => r[0] === '/api/controller/v1/access' && r.length === 6);
  assert.strictEqual(put[1], auth);
  assert.strictEqual(put[2], owner);
  const badOrigin = response();
  put[3]({ headers: { origin: 'https://evil.example' } }, badOrigin, () => { throw Error('bad origin passed'); });
  assert.equal(badOrigin.statusCode, 403);
  let allowed = false;
  put[3]({ headers: { origin: 'https://kvn.example', 'sec-fetch-site': 'same-origin' } },
    response(), () => { allowed = true; });
  assert.equal(allowed, true);
  const handler = put[5];
  const invalid = response();
  handler({ body: { enabled: 'true', expectedRevision: 0 }, user: { id: 'owner1' } }, invalid);
  assert.equal(invalid.statusCode, 400);
  const on = response();
  handler({ body: { enabled: true, expectedRevision: 0 }, user: { id: 'owner1', name: 'CEO' } }, on);
  assert.equal(on.body.enabled, true);
  assert.equal(on.body.revision, 1);
  assert.equal(saves, 1);
  assert.equal(d.auditLogs[0].action, 'controller.access.enabled');
  const guard = routes.find(r => r[0] === '/api/controller/v1/overview')[3];
  let proceeded = false;
  guard({}, response(), () => { proceeded = true; });
  assert.equal(proceeded, true);
  const stale = response();
  handler({ body: { enabled: false, expectedRevision: 0 }, user: { id: 'owner1' } }, stale);
  assert.equal(stale.statusCode, 409);
  assert.equal(saves, 1);
  const off = response();
  handler({ body: { enabled: false, expectedRevision: 1 }, user: { id: 'owner1' } }, off);
  assert.equal(off.body.enabled, false);
  assert.equal(off.body.revision, 2);
  assert.equal(d.auditLogs[0].action, 'controller.access.disabled');
  const offResult = response();
  proceeded = false;
  guard({}, offResult, () => { proceeded = true; });
  assert.equal(offResult.statusCode, 403);
  assert.equal(proceeded, false);
  assert.equal(saves, 2);
  assert.equal(JSON.stringify(d.orders), originalOrders);
  assert.equal(JSON.stringify(d.marketing), originalMarketing);
});

test('Replaying an unchanged toggle is idempotent and does not add an audit entry', () => {
  const d = fixture();
  const on = setControllerAccess(d, {
    enabled: true, expectedRevision: 0, user: { id: 'owner1' }
  });
  const audit = d.auditLogs.length;
  const repeated = setControllerAccess(d, {
    enabled: true, expectedRevision: on.revision, user: { id: 'owner1' }
  });
  assert.equal(repeated.changed, false);
  assert.equal(d.auditLogs.length, audit);
  assert.equal(repeated.revision, 1);
});

test('Dashboard exposes a keyboard accessible owner-only switch without connecting OAuth implicitly', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../public/dashboard.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../public/controller-dashboard.js', import.meta.url), 'utf8');
  assert.match(html, /id="panel-superadmin"/);
  assert.match(html, /id="controllerAccessToggle"[^>]*role="switch"|role="switch"[^>]*id="controllerAccessToggle"/);
  assert.match(html, /controller-dashboard\.js/);
  assert.match(js, /expectedRevision/);
  assert.match(js, /\/api\/controller\/v1\/access/);
});
