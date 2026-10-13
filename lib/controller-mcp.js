import crypto from 'node:crypto';
import { ensureMarketing, eligibleContacts, normEmail } from './marketing.js';
import { controllerAccessState, controllerAudiences, controllerCampaigns } from './controller-routes.js';

const sha = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const scopes = ['kvn:read', 'kvn:send'];
const now = () => Date.now();
const bad = (message, status = 400) => Object.assign(new Error(message), { statusCode: status });
const textResult = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
const exact = (left, right) => typeof left === 'string' && typeof right === 'string' &&
  Buffer.byteLength(left) === Buffer.byteLength(right) &&
  crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));

export function createJwtVerifier({ issuer, jwksUrl, audience, ownerSub, fetchImpl = fetch }) {
  if (![issuer, jwksUrl, audience, ownerSub].every(x => typeof x === 'string' && x.length > 0)) throw bad('OAuth verifier not configured.', 503);
  const expectedIssuer = new URL(issuer);
  const keysUri = new URL(jwksUrl);
  if (expectedIssuer.protocol !== 'https:' || keysUri.protocol !== 'https:') throw bad('OAuth endpoints must use HTTPS.', 503);
  let cache = null, cachedUntil = 0;
  async function keyFor(kid) {
    if (!cache || cachedUntil < now() || !cache.keys.some(key => key.kid === kid)) {
      const response = await fetchImpl(jwksUrl, { signal: AbortSignal.timeout(4000), headers: { Accept: 'application/json' } });
      if (!response.ok) throw bad('OAuth key discovery failed.', 503);
      const data = await response.json();
      if (!Array.isArray(data.keys) || data.keys.length > 30) throw bad('Invalid OAuth signing keys.', 503);
      cache = data;
      cachedUntil = now() + 5 * 60 * 1000;
    }
    const jwk = cache.keys.find(k => k.kid === kid && k.kty === 'RSA' && (!k.use || k.use === 'sig') && (!k.alg || k.alg === 'RS256'));
    if (!jwk) throw bad('Unknown token signing key.', 401);
    return crypto.createPublicKey({ key: jwk, format: 'jwk' });
  }
  return async function verifyJwt(token) {
    if (!token || token.length > 12000 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) throw bad('Invalid bearer token.', 401);
    const segments = token.split('.');
    let header, payload;
    try {
      header = JSON.parse(Buffer.from(segments[0], 'base64url').toString());
      payload = JSON.parse(Buffer.from(segments[1], 'base64url').toString());
    } catch { throw bad('Malformed bearer token.', 401); }
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 256) throw bad('Unsupported token signature.', 401);
    const publicKey = await keyFor(header.kid);
    const valid = crypto.verify('RSA-SHA256', Buffer.from(segments[0] + '.' + segments[1]), publicKey, Buffer.from(segments[2], 'base64url'));
    if (!valid) throw bad('Bearer token signature rejected.', 401);
    const seconds = now() / 1000;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (payload.iss !== issuer || !aud.includes(audience) || !Number.isFinite(payload.exp) ||
        payload.exp <= seconds || payload.exp > seconds + 86400 || (payload.nbf && payload.nbf > seconds + 30) ||
        !exact(payload.sub, ownerSub)) throw bad('Bearer token identity, audience or lifetime rejected.', 401);
    const grants = String(payload.scope || '').split(' ').filter(Boolean);
    if (!grants.includes('kvn:read')) throw bad('Marketing read permission is required.', 403);
    return { sub: payload.sub, scopes: grants, expiresAt: payload.exp };
  };
}

const definitions = [
  { name: 'kvn_audiences', title: 'KV Tix Audience Summary', description: 'Read eligible counts and suppression state, not customer email addresses.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: 'kvn_campaigns', title: 'List KV Tix Campaigns', description: 'Show draft, active and completed campaigns and delivery status to prevent repeats.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: 'kvn_campaign_preflight', title: 'Verify Campaign Before Sending', description: 'Verify draft, audience permissions, recipient count, artwork, CTA and duplicate send history. Does not send.', inputSchema: { type: 'object', properties: { campaignId: { type: 'string' } }, required: ['campaignId'], additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: 'kvn_campaign_status', title: 'Campaign Delivery Status', description: 'Read provider acceptance, delivery summary and outstanding recipients without exposing addresses.', inputSchema: { type: 'object', properties: { campaignId: { type: 'string' } }, required: ['campaignId'], additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: 'kvn_start_campaign', title: 'Start Approved KV Tix Campaign', description: 'Write action: launch the exact preflighted campaign once, using the Command Center consent database and background delivery. Requires owner approval and kvn:send scope.', inputSchema: { type: 'object', properties: { campaignId: { type: 'string' }, preflightToken: { type: 'string' }, expectedRecipientCount: { type: 'integer', minimum: 1 } }, required: ['campaignId', 'preflightToken', 'expectedRecipientCount'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false } }
];
const duplicateKey = c => JSON.stringify([String(c.subject || '').trim().toLowerCase(), String(c.ctaUrl || '').trim(), [...(c.listIds || [])].sort()]);

export function preflightKvCampaign(data, campaignId, engagement, env, baseUrl, minuteOverride = Math.floor(now() / 60000)) {
  const d = ensureMarketing(data), campaign = d.marketing.campaigns.find(c => c.id === campaignId);
  if (!campaign) throw bad('KV Tix campaign not found.', 404);
  const provider = engagement && typeof engagement.blockedEmails === 'function' ? engagement.blockedEmails(d) : null;
  if (!(provider instanceof Set)) throw bad('Provider suppression evidence unavailable; campaign blocked.', 503);
  const marketing = d.marketing, audience = eligibleContacts(d, campaign.listIds || [])
    .filter(c => String(c.evidence || '').trim() && !provider.has(normEmail(c.email)))
    .map(c => ({ id: c.id, email: normEmail(c.email) })).sort((a, b) => a.id.localeCompare(b.id));
  const names = new Set(), unique = audience.filter(c => !names.has(c.email) && names.add(c.email));
  const earlier = marketing.campaigns.filter(c => c.id !== campaignId &&
    duplicateKey(c) === duplicateKey(campaign) && (c.startedAt || !['draft', 'cancelled'].includes(c.status)));
  const blockers = [];
  if (campaign.status !== 'draft') blockers.push('Campaign is already active, completed, paused, or requires review.');
  if (!unique.length) blockers.push('No subscribed, permission-verified, unsuppressed recipients.');
  if (earlier.length) blockers.push('Another matching campaign exists with send history or active status.');
  if (!env.RESEND_API_KEY) blockers.push('Resend sending is not configured.');
  if (!env.RESEND_MARKETING_WEBHOOK_SECRET) blockers.push('Resend engagement/suppression webhook is not configured.');
  if (!String(marketing.settings?.mailingAddress || '').trim()) blockers.push('Organization mailing address is missing.');
  if (!String(campaign.body || '').trim()) blockers.push('Campaign body is missing.');
  if (!String(campaign.subject || '').trim()) blockers.push('Campaign subject is missing.');
  if (String(campaign.subject || '').trim().toLowerCase() === 'kap is buying your ticket to kv live') {
    if (JSON.stringify(campaign.listIds || []) !== JSON.stringify(['ticket-buyers'])) blockers.push('KAP campaign must use only the Ticket Buyers audience.');
    if (campaign.ctaUrl !== 'https://www.kvnlive.com/promo') blockers.push('KAP campaign claim link has changed.');
    if (!String(campaign.heroImageUrl || '').startsWith('https://')) blockers.push('The approved hosted KV Live banner is missing or not HTTPS.');
  }
  if (!String(campaign.ctaUrl || '').startsWith('https://')) blockers.push('Valid HTTPS CTA is missing.');
  const minute = minuteOverride;
  const signature = {
    campaignId, minute, revision: campaign.revision, subject: campaign.subject, body: campaign.body,
    ctaUrl: campaign.ctaUrl, ctaLabel: campaign.ctaLabel, heroImageUrl: campaign.heroImageUrl,
    audience: unique, settings: marketing.settings, controllerRevision: controllerAccessState(d).revision
  };
  return {
    campaignId, status: campaign.status, subject: campaign.subject, sender: 'info@tickets.kvnlive.com',
    ctaUrl: campaign.ctaUrl || null, artworkUrl: campaign.heroImageUrl || null,
    listIds: campaign.listIds, eligibleRecipientCount: unique.length, duplicateCampaigns: earlier.map(c => ({ id: c.id, status: c.status })),
    suppressionSource: 'KV Tix permission data and verified Resend webhook journal (not an independent provider-wide suppression export)',
    ready: blockers.length === 0, blockers, preflightToken: blockers.length ? null : minute + '.' + sha(signature),
    audience: unique
  };
}

export function startKvCampaign({ readStore, writeStore, engagement, env, baseUrl, runner, campaignId, token, expectedCount, actor }) {
  if (!runner || typeof runner.schedule !== 'function') throw bad('Campaign runner unavailable.', 503);
  const data = readStore();
  if (!controllerAccessState(data).enabled) throw bad('Controller access is disabled.', 403);
  const givenMinute = Number(String(token || '').split('.')[0]);
  const currentMinute = Math.floor(now() / 60000);
  if (!Number.isSafeInteger(givenMinute) || givenMinute < currentMinute - 5 || givenMinute > currentMinute)
    throw bad('Campaign preflight expired. Run a fresh preview.', 409);
  const p = preflightKvCampaign(data, campaignId, engagement, env, baseUrl, givenMinute);
  if (!p.ready) throw bad('Campaign preflight not ready: ' + p.blockers.join(' '), 409);
  if (!exact(token, p.preflightToken) || expectedCount !== p.eligibleRecipientCount) {
    throw bad('Campaign or audience changed. Run a fresh preflight before sending.', 409);
  }
  const campaign = data.marketing.campaigns.find(c => c.id === campaignId);
  campaign.recipients = p.audience.map(item => ({ ...item, status: 'pending' }));
  campaign.settings = { ...data.marketing.settings };
  campaign.startedAt = new Date().toISOString();
  campaign.status = 'sending';
  campaign.autoRun = true;
  campaign.engineVersion = 2;
  data.auditLogs ??= [];
  data.auditLogs.unshift({ id: crypto.randomUUID(), action: 'marketing.campaign.connector.start', userId: actor, entityType: 'marketing', entityId: campaignId, createdAt: campaign.startedAt });
  writeStore(data);
  runner.schedule();
  return { status: 'sending', campaignId, queued: p.eligibleRecipientCount, providerAccepted: 0, message: 'Started once in KV Tix; accepted and delivered counts will be reported separately.' };
}

export function registerControllerMcp(app, { readStore, writeStore, engagement, runner, env = process.env, baseUrl, verifyToken }) {
  const issuer = env.KVN_CONTROLLER_OAUTH_ISSUER, jwksUrl = env.KVN_CONTROLLER_OAUTH_JWKS_URL, ownerSub = env.KVN_CONTROLLER_OAUTH_OWNER_SUB;
  const resource = baseUrl.replace(/\/$/, '') + '/mcp';
  const configured = Boolean(issuer && jwksUrl && ownerSub);
  const verifier = verifyToken || (configured ? createJwtVerifier({ issuer, jwksUrl, ownerSub, audience: resource }) : null);
  const discovery = (_q, s) => configured ? s.json({
    resource, authorization_servers: [issuer], scopes_supported: scopes
  }) : s.status(503).json({ error: 'Owner OAuth identity provider must be configured before linking.' });
  app.get('/.well-known/oauth-protected-resource', discovery);
  app.get('/.well-known/oauth-protected-resource/mcp', discovery);
  const challenge = s => s.set('WWW-Authenticate', 'Bearer resource_metadata="' + baseUrl.replace(/\/$/, '') + '/.well-known/oauth-protected-resource", scope="kvn:read"').status(401).json({ error: 'Owner OAuth authentication required.' });
  app.post('/mcp', async (q, s) => {
    s.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    if (!configured || !verifier) return s.status(503).json({ error: 'ChatGPT connector is not configured.' });
    if (!controllerAccessState(readStore()).enabled) return s.status(403).json({ error: 'Controller is OFF in Super Admin.' });
    const match = /^Bearer (\S+)$/.exec(String(q.headers.authorization || ''));
    if (!match) return challenge(s);
    let principal;
    try { principal = await verifier(match[1]); }
    catch (error) { return error.statusCode === 403 ? s.status(403).json({ error: error.message }) : challenge(s); }
    if (!principal.scopes.includes('kvn:read')) return s.status(403).json({ error: 'Missing read scope.' });
    const request = q.body || {};
    if (request.jsonrpc !== '2.0') return s.status(400).json({ error: 'MCP JSON-RPC request required.' });
    const reply = result => s.json({ jsonrpc: '2.0', id: request.id ?? null, result });
    const fail = (code, message) => s.json({ jsonrpc: '2.0', id: request.id ?? null, error: { code, message } });
    if (request.method === 'notifications/initialized') return s.status(202).end();
    if (request.method === 'initialize') return reply({
      protocolVersion: '2025-06-18', capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'kv-tix-controller', version: '1.0.0' }
    });
    if (request.method === 'ping') return reply({});
    if (request.method === 'tools/list') return reply({ tools: definitions });
    if (request.method !== 'tools/call') return fail(-32601, 'MCP method not found.');
    const name = request.params?.name, args = request.params?.arguments || {};
    try {
      if (name === 'kvn_audiences') return reply(textResult(controllerAudiences(readStore(), engagement?.blockedEmails(readStore()))));
      if (name === 'kvn_campaigns') return reply(textResult(controllerCampaigns(readStore(), engagement)));
      if (name === 'kvn_campaign_preflight') {
        if (typeof args.campaignId !== 'string') throw bad('Campaign ID required.');
        const p = preflightKvCampaign(readStore(), args.campaignId, engagement, env, baseUrl);
        const { audience, ...safe } = p;
        return reply(textResult(safe));
      }
      if (name === 'kvn_campaign_status') {
        const c = ensureMarketing(readStore()).marketing.campaigns.find(x => x.id === args.campaignId);
        if (!c) throw bad('Campaign not found.', 404);
        const recipients = c.recipients || [], counts = recipients.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {});
        return reply(textResult({ id: c.id, subject: c.subject, status: c.status, total: recipients.length,
          counts, engagement: engagement?.report(c).summary || null, startedAt: c.startedAt || null, completedAt: c.completedAt || null }));
      }
      if (name === 'kvn_start_campaign') {
        if (!principal.scopes.includes('kvn:send')) throw bad('Explicit owner-approved kvn:send permission required.', 403);
        if (typeof args.campaignId !== 'string' || typeof args.preflightToken !== 'string' || !Number.isSafeInteger(args.expectedRecipientCount))
          throw bad('Exact campaign ID, preflight token and recipient count are required.');
        return reply(textResult(startKvCampaign({ readStore, writeStore, engagement, env, baseUrl, runner, campaignId: args.campaignId,
          token: args.preflightToken, expectedCount: args.expectedRecipientCount, actor: principal.sub })));
      }
      return fail(-32601, 'Unknown tool.');
    } catch (error) {
      return reply({ isError: true, content: [{ type: 'text', text: error.statusCode ? error.message : 'Campaign operation failed safely; review server logs.' }] });
    }
  });
  app.get('/mcp', (q, s) => s.status(405).set('Allow', 'POST').end());
}
