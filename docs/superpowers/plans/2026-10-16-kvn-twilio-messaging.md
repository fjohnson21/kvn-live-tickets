# KVN Twilio Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send reviewed SMS campaigns to KVN's opted-in business segments from Command Center and report delivery and opt-outs.
**Architecture:** Independent SMS ledger alongside email, native server Twilio transport, signed callbacks, single-instance persistent dispatcher; branded Sites gateway. Sending disabled until setup verified; customer billing and external AI remain out of scope.
**Tech Stack:** Existing Node ESM/Express/fetch/crypto/JSON store, vanilla JS, node:test/JSDOM/Playwright and Sites Worker; no new production dependency.
**Spec:** `docs/superpowers/specs/2026-10-16-kvn-twilio-messaging-design.md`.

Restored from the approved conversation after scratch maintenance. All approved interfaces, requirements, limits and eight task boundaries are preserved here.

## Global Constraints
- KVN only; Business Suite customer onboarding, billing, reseller pricing and external AI sending are later phases.
- Preserve existing Resend Broadcast behavior and production records.
- Purchases/email/phone ownership/agreements never imply SMS marketing consent.
- Secrets server-only; no secrets in HTML, exports, logs or chat.
- Provider acceptance is not delivery; delivery is not a read receipt.
- Concrete reviewed number purchase/registration and verified legal details required.
- No real campaign is released merely to validate integration.
- Public URLs/callbacks use https://kvnlive.com; preserve disk/Site audience.

## Review Focus
- Corrected/reassigned phones never inherit another number's consent: Task 2.
- Delayed START cannot override newer STOP: Task 3.
- Restart after provider acceptance cannot duplicate submission: Task 5.
- GSM extension and emoji/multipart units truthfully estimated: Task 1.
- Late private UI responses after logout/navigation must be ignored: Task 6.

## Shared contracts
`store.sms={schemaVersion:1,revision:0,scopeId:'kvn',consentEvents:[],drafts:[],previews:[],campaigns:[],attempts:[],callbackEvents:[],audit:[],requests:[]}`; preserve unrelated fields. Owner mutations: authenticated owner, trusted JSON origin, bounded input, revision and request ID. Public Twilio callbacks: <=64KB urlencoded, valid signature, no cookie authentication.

### Task 1: SMS model, encoding and disabled connection readiness
**Files:** `lib/sms-model.js`, `test/sms-model.test.js`, `docs/kvn-twilio-setup.md`.
**Interfaces:** `ensureSms(store)->store`; `smsEncoding(text)->{encoding,units,segments}`; `smsConnectionStatus(env)->{configured,sendingEnabled,checks,publicSender}`.
- [ ] Write failing initialization/secret-redaction and GSM 160/161, extension-two-septets, Unicode 70/71, emoji UTF16 tests.
- [ ] Run `node --test test/sms-model.test.js`; watch missing implementation fail.
- [ ] Implement GSM basic/extension and Unicode fallback; multipart153/67, nonempty text, max10 segments. Server settings: TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID. Enable only exact true TWILIO_SMS_SENDING_ENABLED, TWILIO_SMS_SENDER_VERIFIED, TWILIO_SMS_CALLBACKS_VERIFIED; all default false. Public metadata TWILIO_SMS_PUBLIC_NUMBER is not verification evidence. Document operator attestations backed by actual setup checks.
- [ ] Run tests, expect zero failures.
- [ ] Commit.

### Task 2: Audience sources and independent SMS consent
**Files:** `lib/sms-audiences.js`, `test/sms-audiences.test.js`.
**Interfaces:** `collectSmsAudience(store,{scopeId:'kvn',segmentIds,now})->{eligible,excluded,sourceCoverage,fingerprint}`; `recordSmsConsent(store,event)->{event,replayed}`.
- [ ] Failing fixtures for all eight source segments, overlap, invalid/missing/ambiguous phones, unpaid/donation exclusion, email-vs-SMS, corrected numbers, withdrawal precedence and tenant isolation.
- [ ] Run `node --test test/sms-audiences.test.js`; expect failure.
- [ ] Read actual source fields. Normalize US/Canada10 digits or explicit +1 eleven digits; exclude international/ambiguous. Bind consent events to exact phone, marketing purpose, scope, disclosure/evidence/source/times. Preserve genuine CRM text consent only for original phone with provenance. Unknown remains excluded. Return source IDs and exclusion reasons; fingerprint effective audience.
- [ ] Run tests; expect zero failures.
- [ ] Commit.

### Task 3: Twilio transport and signed delivery/opt-out callbacks
**Files:** `lib/sms-twilio.js`, `lib/sms-webhooks.js`, matching tests; `server.js` parser wiring.
**Interfaces:** `createTwilioClient({env,fetchImpl})->{sendMessage,readMessage,readService}`; `verifyTwilioForm({url,fields,signature,authToken})->boolean`; `registerSmsWebhooks(app,{readStore,writeStore,client,env,now})`.
- [ ] Failing tests: fixed provider host, secret-only Basic auth, form encoding,10sec timeout/no redirects/no POST retry, sanitized failures, official HMAC vector, tampered URL/body/extra fields/duplicate keys/wrong scope, duplicate/out-of-order status, forged STOP and delayed START, unknown SID.
- [ ] Run `node --test test/sms-twilio.test.js test/sms-webhooks.test.js`; expect failure.
- [ ] Implement native HTTPS Twilio Messages POST with MessagingServiceSid/To/Body/StatusCallback and read-only Message/Service GET. Signature: documented HMAC-SHA1 exact configured URL incl query plus sorted complete form fields, account AuthToken, timing-safe comparison. Reject JSON/duplicate keys; bound64KB. Branded callback paths `/api/sms/twilio/status` and `/api/sms/twilio/inbound`. Match account/service/message-attempt identity, quarantine conflicts. Never regress terminals. STOP immediate; START only active after provider lookup establishes correct identity and newer creation time than withdrawal, otherwise pending. Empty TwiML avoids duplicate provider replies.
- [ ] Run tests; expect zero failures.
- [ ] Commit.

### Task 4: Drafts, exact previews and reviewed release service
**Files:** `lib/sms-campaigns.js`, `test/sms-campaigns.test.js`.
**Interfaces:** `createSmsCampaignService({readStore,writeStore,now})->{saveDraft,preview,release,pause,queueTest}` with owner principal/requestId/expectedRevision; previews bind text, sender, selection, exact recipients and exclusions, units.
- [ ] Failing tests: no provider calls before release; stale content/source/consent/sender/revision;15min expiry, owner token binding, replay, withdrawn consent, overlap, explicitly authorized exact test recipient/message, disabled sending.
- [ ] Run `node --test test/sms-campaigns.test.js`; expect failure.
- [ ] Persist immutable reviewed campaign and unsent attempts atomically; max1000 recipients/10000 estimated units; never synchronous send. Test is one expressly authorized recipient; release and pause audited. Preserve email data.
- [ ] Run tests; expect zero failures.
- [ ] Commit.

### Task 5: Durable bounded dispatch and uncertain-outcome recovery
**Files:** `lib/sms-dispatcher.js`, `test/sms-dispatcher.test.js`; server wiring.
**Interfaces:** `createSmsDispatcher({readStore,writeStore,client,env,now})->{tick,start,stop,reconcile}`.
- [ ] Failing tests: last-moment STOP, parallel ticks, pause, restart,429/5xx, timeout/no SID, concurrent store writes, callback-before-response; assert no duplicate submissions/unrelated data loss.
- [ ] Run `node --test test/sms-dispatcher.test.js`; expect failure.
- [ ] One in-process lock, maxone new attempt/sec, reread config/consent/campaign immediately before submission, persist submitting before POST, fresh store before result write. Restart unknown submissions ->needs_review; reconcile known SIDs by GET, no blind POST retries. Daily10000-unit application cap incl tests; not promised bill limit. stop prevents new claims.
- [ ] Run tests; expect zero failures.
- [ ] Commit.

### Task 6: Owner routes and reporting UI
**Files:** `lib/sms-routes.js`, `public/sms-dashboard.js`, route/UI tests; modify `server.js`, `public/dashboard.html`, `public/dashboard.js`, `lib/business-workspaces.js`.
**Interfaces:** `registerSmsRoutes(app,{auth,owner,readStore,writeStore,campaignService,env})`; `window.KVNSms.init({api,user,container})`, `clear()`.
- [ ] Failing tests: owner-only GET `/api/sms/{connection,audiences,drafts,campaigns}`, trusted JSON draft/preview/release/test/pause, exact filtered formula-safe CSV, draft persistence, disabled setup, conflicts/double click, logout/nav late response. Existing email untouched.
- [ ] Run `node --test test/sms-routes.test.js test/sms-ui.test.js test/marketing-broadcast-routes.test.js`; expect new failures.
- [ ] Add SMS Audiences/Drafts/Campaign History/Connection Settings under Email & Marketing and labeled business links. Redacted setup status and secure deployment-secret instructions (no new browser secret store). Preview exclusions/encoding/units and distinct delivery totals, matching report export. Epoch clear ignores private late responses.
- [ ] Run tests and `node --check public/sms-dashboard.js`; expect zero failures.
- [ ] Commit.

### Task 7: Branded opt-in page and Sites gateway
**Files:** `public/sms-opt-in.html`, `public/sms-opt-in.js`, opt-in tests; Sites engine-proxy, new sms-webhook-proxy, worker wiring, tests.
**Interfaces:** public GET `/sms/opt-in`, GET `/api/sms/opt-in/config`; exact two public webhook POSTs with original bytes/signature and no cookies/auth. Owner APIs branded `/api/command-center/sms/...`.
- [ ] Failing tests for metadata-only page visit/no send/consent, exact routes/methods,64KB, signature forward/cookie stripping, timeout/redirect handling/no origin leak.
- [ ] Run backend opt-in and Sites Vitest; expect missing paths.
- [ ] Add KVN signup page showing verified public number/disclosure/version, purpose/frequency/rates/STOP/HELP/privacy/terms, asking user to text START. Clicking alone grants no consent. Signed inbound START records confirmed consent per Task3 with configured disclosure. Honest unavailable state until ready. Gateway owner API/assets and dedicated two-path cookie-free byte-preserving webhook proxy; exact public URL retained for validation.
- [ ] Run focused tests and Sites typecheck; expect zero failures.
- [ ] Commit backend and Site separately.

### Task 8: Integration verification, account handoff and release
**Files:** `test/sms-integration.test.js`, `browser-tests/sms.spec.mjs`, setup/release docs.
**Interfaces:** Consume Tasks1–7; native execution, one independent final review.
- [ ] End-to-end real fixture owner APIs: overlapping audiences, draft/preview/release into fake transport, dispatch/signed delivery/STOP/exact reports/no email. Browser320/390px tabs/dialogs/counts/disabled state/private clearing.
- [ ] Run integration/mobile tests, observe failures, finish wiring.
- [ ] Full backend test/check, Site focused tests/typecheck/build/asset parity and required CI/mobile. One independent final review; Important/Critical regression tests RED/GREEN; affected/full checks.
- [ ] Publish backend then existing Site, sending disabled, disk/data/audience preserved; record source/deploy IDs, disclose unavailable real signed-in browser verification.
- [ ] Account handoff: actual legal owner and KVN subaccount, verified sender/MessagingService/AdvancedOptOut/copy, branded callbacks, restricted API credentials and webhook AuthToken via secure secret storage. Record actual evidence before flags; default sending false. Purchase/registration only concrete reviewed charge/form.
- [ ] When account/sender/callback setup is ready and owner gives an authorized recipient/exact message, send only that reviewed test, confirm real SID/delivery/optout before enabling production. Never activate real marketing campaigns or customer billing as a test. If credentials unavailable, release only honest disabled readiness and report blocker.
- [ ] Commit verification evidence and complete ledger, recording blocked live-account steps accurately.

## Self-review and official references
Coverage preserved: account/release8, consent/sources2, draft/review4/6, provider/callback3, durability5, branded gateway7, validation8. Every Review Focus has an owning test; all shared interfaces above consistent.
https://www.twilio.com/docs/messaging/onboarding/build-your-account
https://www.twilio.com/docs/usage/security
https://www.twilio.com/docs/usage/webhooks/webhooks-security
https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out
https://www.twilio.com/docs/messaging/guides/track-outbound-message-status
