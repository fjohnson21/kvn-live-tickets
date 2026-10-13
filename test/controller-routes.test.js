import test from 'node:test';
import assert from 'node:assert/strict';
import {
  controllerOverview, controllerAudiences, controllerCampaigns, registerControllerRoutes
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
  const app = { get: (...args) => routes.push(args) };
  registerControllerRoutes(app, { auth, owner, readStore: fixture });
  assert.deepEqual(routes.map(route => route[0]), [
    '/api/controller/v1/overview', '/api/controller/v1/audiences', '/api/controller/v1/campaigns'
  ]);
  for (const route of routes) {
    assert.strictEqual(route[1], auth);
    assert.strictEqual(route[2], owner);
    assert.equal(route.length, 5);
  }
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
