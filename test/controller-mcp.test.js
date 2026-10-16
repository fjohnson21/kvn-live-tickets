import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { createJwtVerifier, preflightKvCampaign, startKvCampaign, registerControllerMcp } from '../lib/controller-mcp.js';
import { ensureMarketing, upsertContact } from '../lib/marketing.js';

const issuer = 'https://id.example.test/';
const baseUrl = 'https://tickets.example.test';
const env = { RESEND_API_KEY: 'test-provider-key', RESEND_MARKETING_WEBHOOK_SECRET: 'test-webhook', KVN_CONTROLLER_OAUTH_ISSUER: issuer,
  KVN_CONTROLLER_OAUTH_JWKS_URL: 'https://id.example.test/.well-known/jwks.json', KVN_CONTROLLER_OAUTH_OWNER_SUB: 'owner-identity' };
const engagement = { blockedEmails: () => new Set(['blocked@example.com']),
  report: () => ({ summary: { accepted: 0, delivered: 0, opened: 0, clicked: 0 } }) };
function fixture() {
  const data = ensureMarketing({ settings: { controllerAccess: { enabled: true, revision: 1 } }, auditLogs: [], orders: [{ id: 'order-before' }] });
  data.marketing.settings = { senderName: 'Kingdom Vibe Network', mailingAddress: '123 Public Street' };
  for (const [email, permission, evidence] of [
    ['buyer@example.com', 'subscribed', 'Confirmed signup'],
    ['blocked@example.com', 'subscribed', 'Confirmed signup'],
    ['unknown@example.com', 'unknown', ''],
    ['optout@example.com', 'unsubscribed', 'Recipient unsubscribed']
  ]) upsertContact(data, { email, listIds: ['ticket-buyers'], permission, evidence });
  data.marketing.campaigns = [{
    id: 'cmp-approved', revision: 1, status: 'draft', subject: 'KAP is buying your ticket to KV Live',
    body: 'You are invited', ctaUrl: 'https://www.kvnlive.com/promo', ctaLabel: 'Claim Comp Pass Now',
    heroImageUrl: 'https://www.kvnlive.com/assets/campaign-banner.png', listIds: ['ticket-buyers'], recipients: []
  }];
  return data;
}
test('preflight derives verified eligible audience, excludes suppressed and unknown, and blocks duplicate', () => {
  const data = fixture(), before = JSON.stringify(data);
  const p = preflightKvCampaign(data, 'cmp-approved', engagement, env, baseUrl, undefined, new Set());
  assert.equal(p.ready, true);
  assert.equal(p.eligibleRecipientCount, 1);
  assert.deepEqual(p.audience.map(c => c.email), ['buyer@example.com']);
  assert.equal(JSON.stringify(data), before);
  data.marketing.campaigns.push({ ...data.marketing.campaigns[0], id: 'duplicate', status: 'complete', startedAt: '2026-10-12', recipients: [] });
  const blocked = preflightKvCampaign(data, 'cmp-approved', engagement, env, baseUrl, undefined, new Set());
  assert.equal(blocked.ready, false);
  assert.ok(blocked.blockers.some(text => text.includes('matching campaign')));
});

test('starting once records original campaign, preserves orders, then rejects second attempt', () => {
  let data = fixture(), calls = 0;
  const readStore = () => structuredClone(data), writeStore = d => { data = structuredClone(d); };
  const p = preflightKvCampaign(data, 'cmp-approved', engagement, env, baseUrl, undefined, new Set());
  const send = () => startKvCampaign({ readStore, writeStore, engagement, env, baseUrl, externalBlocked: new Set(), runner: { schedule: () => { calls++; } },
    campaignId: 'cmp-approved', token: p.preflightToken, expectedCount: 1, actor: 'owner-identity' });
  assert.equal(send().queued, 1);
  assert.equal(data.marketing.campaigns[0].status, 'sending');
  assert.equal(data.marketing.campaigns[0].recipients[0].status, 'pending');
  assert.equal(data.orders[0].id, 'order-before');
  assert.equal(calls, 1);
  assert.throws(send, /preflight not ready/);
});
test('wrong count, stale tokens and owner switch OFF block sends without writes', () => {
  let data = fixture(), writes = 0;
  const readStore = () => structuredClone(data), writeStore = d => { data = d; writes++; };
  const p = preflightKvCampaign(data, 'cmp-approved', engagement, env, baseUrl, undefined, new Set());
  const start = (token, expectedCount) => startKvCampaign({ readStore, writeStore, engagement, env, baseUrl,
    runner: { schedule: () => {} }, externalBlocked: new Set(), campaignId: 'cmp-approved', token, expectedCount, actor: 'owner-identity' });
  assert.throws(() => start('broken', 1), /changed|expired/);
  assert.throws(() => start(p.preflightToken, 999), /changed/);
  data.settings.controllerAccess.enabled = false;
  assert.throws(() => start(p.preflightToken, 1), /disabled/);
  assert.equal(writes, 0);
});
test('RS256 verifier checks signature, audience, scope, expiry and exact owner identity', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'key1', use: 'sig', alg: 'RS256' };
  const verify = createJwtVerifier({ issuer, jwksUrl: env.KVN_CONTROLLER_OAUTH_JWKS_URL, audience: baseUrl + '/mcp', ownerSub: 'owner-identity',
    fetchImpl: async () => ({ ok: true, json: async () => ({ keys: [jwk] }) }) });
  const jwt = payload => {
    const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'key1', typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return h + '.' + p + '.' + crypto.sign('RSA-SHA256', Buffer.from(h + '.' + p), privateKey).toString('base64url');
  };
  const claims = { iss: issuer, aud: baseUrl + '/mcp', sub: 'owner-identity', exp: Math.floor(Date.now()/1000)+3600, scope: 'kvn:read kvn:send' };
  assert.equal((await verify(jwt(claims))).sub, 'owner-identity');
  await assert.rejects(verify(jwt({ ...claims, aud: 'https://wrong.example/mcp' })), /identity/);
  await assert.rejects(verify(jwt({ ...claims, sub: 'not-owner' })), /identity/);
  await assert.rejects(verify(jwt({ ...claims, scope: 'kvn:send' })), /read permission/);
  await assert.rejects(verify(jwt({ ...claims, exp: 1 })), /lifetime/);
  await assert.rejects(verify(jwt(claims).slice(0,-4)+'abcd'), /signature/);
});
test('MCP requires owner authentication and Controller switch, and blocks send without scope', async t => {
  let data = fixture(), writes = 0;
  const app = express(); app.use(express.json());
  registerControllerMcp(app, { baseUrl, env, readStore: () => structuredClone(data), writeStore: d => { data = d; writes++; },
    engagement, runner: { schedule: () => { throw Error('Must not execute'); } }, loadSuppressed: async () => new Set(),
    verifyToken: async () => ({ sub: 'owner-identity', scopes: ['kvn:read'] }) });
  const server = app.listen(0); t.after(() => server.close());
  const local = 'http://127.0.0.1:' + server.address().port;
  const req = (method, params, bearer = 'token') => fetch(local+'/mcp', { method: 'POST',
    headers: { 'content-type': 'application/json', ...(bearer ? { authorization: 'Bearer '+bearer } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 7, method, params }) });
  assert.equal((await req('tools/list', {}, null)).status, 401);
  const listed = await (await req('tools/list', {})).json();
  assert.equal(listed.result.tools.length, 9);
  assert.deepEqual(listed.result.tools.find(t=>t.name==='kvn_prepare_business_action').securitySchemes,[{type:'oauth2',scopes:['kvn:read','kvn:edit']}]);
  const sendingTool = listed.result.tools.find(tool => tool.name === 'kvn_start_campaign');
  const readTool = listed.result.tools.find(tool => tool.name === 'kvn_campaigns');
  assert.deepEqual(sendingTool.securitySchemes, [{ type: 'oauth2', scopes: ['kvn:read','kvn:send'] }]);
  assert.deepEqual(readTool.securitySchemes, [{ type: 'oauth2', scopes: ['kvn:read'] }]);
  const audience = await (await req('tools/call', { name: 'kvn_audiences', arguments: {} })).json();
  assert.equal(audience.result.structuredContent.suppressionVerified, true);
  assert.equal(audience.result.structuredContent.lists.find(x => x.id === 'ticket-buyers').eligibleAfterProviderSuppression, 1);
  const pref = await (await req('tools/call', { name: 'kvn_campaign_preflight', arguments: { campaignId: 'cmp-approved' } })).json();
  const p = pref.result.structuredContent;
  assert.equal(p.eligibleRecipientCount, 1);
  assert.equal(JSON.stringify(pref).includes('buyer@example.com'), false);
  const result = await (await req('tools/call', { name: 'kvn_start_campaign', arguments: {
    campaignId: 'cmp-approved', preflightToken: p.preflightToken, expectedRecipientCount: 1 } })).json();
  assert.equal(result.result.isError, true);
  assert.match(result.result._meta['mcp/www_authenticate'][0], /insufficient_scope/);
  assert.equal(writes, 0);
  data.settings.controllerAccess.enabled = false;
  assert.equal((await req('tools/list', {})).status, 403);
});
