# KV Social — private pilot

Independent demonstration for the Kingdom Vibe Network community. This is **not integrated with KingdomVibeNetwork.com** and is not a public social service. It does not import the ticket server, customer/order data, payment configuration, email provider, production authentication or dotenv. Existing `npm start` is unchanged.

## Run privately

Use Node 20+ and the repository dependencies (`npm ci`). In a local terminal, supply two distinct random demo access keys (32+ characters). These are **dedicated demo credentials**, never production passwords. For example, generate each with `openssl rand -hex 32`, keep it private, then enter it without echo:

```bash
read -rs -p 'Member demo key: ' KV_SOCIAL_MEMBER_KEY
export KV_SOCIAL_MEMBER_KEY
read -rs -p 'Owner demo key: ' KV_SOCIAL_OWNER_KEY
export KV_SOCIAL_OWNER_KEY
node social-pilot/server.js
```

Open `http://127.0.0.1:4311`. Use the member key in one browser context and the owner key in a separate private window. The optional `KV_SOCIAL_PORT` changes the port. Loopback-only binding and Host checks intentionally prevent remote hosting; `NODE_ENV=production` is rejected. There is no default password or registration route. Do not proxy or expose this service publicly.

The keys select fixed **synthetic** member and owner identities; this is not an individual-account authentication system. Sign-out invalidates that session. Sessions expire after one hour. Cookies are HTTP-only and SameSite Strict. Local HTTP cookies are intentionally not marked Secure; production requires HTTPS/Secure cookies and a different identity implementation.

Everything is memory-only, including posts, reports, appeals, reactions, saves, blocks, suspensions and audit events. Restart resets everything. Do not enter real personal data. Global capacity limits make this suitable for a disposable demo, not long-running storage.

## Try the workflows

1. Sign in as member. Explore sample feed and artist profiles. Appreciate, save, copy sample text, respond, or block an account. Samples are labeled and start with zero engagement; no artist quotes, fabricated accounts or follower counts are presented as real.
2. Share sample text; optionally choose a curated abstract visual. It remains pending and appears in **My activity**, not the feed. Edits also return to review. Arbitrary files, photos, URLs, DMs and video are intentionally unavailable.
3. In a separate owner session, open **Review desk**. Inspect the text, signals and context. Approve, hide or remove with an author-visible reason. Owner-authored content cannot be self-approved.
4. Report a published post from the member session; inspect the private report from the owner session. A report does not remove content automatically. Review resolves open reports.
5. Remove a member post, then appeal it from My activity. Owner can uphold or restore with an explanation. Appeals cannot be reopened for the same decision, and version checks reject stale decisions. Edits and separate reviews are blocked during an open appeal.
6. Suspend the member from Accounts. Published content disappears and new posting is blocked; the member can still inspect decisions and appeal. Reinstatement restores previously published content. Restore/approve cannot bypass a suspension or hidden parent conversation.

## Moderation limits and policy

All posts, comments and edits require human approval. `policy.js` contains **illustrative English heuristics**, not a comprehensive classifier. It flags example harassment, hateful group attacks, threats, spam, derogatory language, personal-information exposure and sexual content. Normalization catches some zero-width obfuscation. Coded language, other languages, alternate spellings, reclaimed words, quotation and context can defeat or confuse these rules. A no-signal result is never a publication approval. Screening failures stay pending.

Respectful criticism of music, performances, events, beliefs or decisions is allowed. Review actual targeted harm and policy violations, not negative sentiment. Reviewers must consider conversation context and appeal explanations. The one-owner demo cannot provide independent second-reviewer appeals; production must assign a distinct reviewer where feasible and record conflicts.

The approved crown asset was not available in this repository. The interface uses a text wordmark rather than inventing a substitute. Artist spotlight cards use typography and abstract CSS art, not unverified likenesses. Verify approved branding and licensed imagery before launch.

## Tests

```bash
node --test test/social-pilot.test.js test/social-pilot-ui.test.js
node --test browser-tests/social-pilot.spec.mjs
npm test
npm run check
```

The browser test uses the existing Playwright dependency and Chromium. The repository's existing `mobile-browser` GitHub Actions job installs Chromium and runs it through `npm run test:mobile`. It checks 320/390/768px layout overflow, member submission, owner approval of constructive criticism, reactions, reporting, removal, appeal/restore, and Escape dismissal. No production service is started.

API tests cover authentication, CSRF/origin/role boundaries, session expiry, data validation, limits, duplicate submissions, private reports, publication controls, stale decisions, parent/comment visibility, blocking, suspensions, appeal replay, owner self-approval and engagement toggles. The JSDOM test drives the actual UI against the isolated API; it is not a layout or real-device test.

## Network website and app integration path

The October 10 approved brief (version 3 of `KVN-Recruitment-and-Platform-Work-Brief-2026-10-10.pdf`) identifies the existing **KV Live** Sites project, but does not establish production source/hosting control of **KingdomVibeNetwork.com**. This GitHub repository owns the ticket engine and cannot prove that control either. No DNS, source, Site audience or deployment settings were changed here.

Recommended path once the main hub source/hosting is verified:

1. Implement the social UI as `/social` within the main hub, with a separate versioned `/api/social` boundary or dedicated social service. Keep ticketing as its existing handoff. Use one verified identity provider across the hub/social experience; never infer a social account or marketing consent from ticket purchase.
2. Move the demo state model to a dedicated transactional database with posts/revisions, comments, moderation cases, reports, decisions, appeals, reactions, blocks and audit events. Use conditional version updates and idempotency keys. Do not add these records to the ticket/order JSON store.
3. Introduce individual verified accounts, role-based authorization, secure invite/recovery, moderator MFA, revocation, account deletion/export, production session controls and security review. Keep member and moderator sessions separate from ticketing admin secrets.
4. Begin with invited Disciple cohort members and explicit community consent. Appoint a human moderator and backup, response targets, escalation procedures, appeals reviewer, acceptable-use policy, age policy and privacy/retention rules before enabling real submissions.
5. Replace heuristics with evaluated multilingual text/media screening **plus human review**. Fail closed when screening is unavailable. For photos, quarantine private uploads, check signatures/size/dimensions, strip metadata, scan/re-encode, review captions and images, and publish only approved derivatives. No remote URL fetcher without SSRF protection.
6. Add distributed per-account/IP/device abuse limits and storage quotas, durable audit logs, monitoring, backups/restore exercises, deletion/caching invalidation, and review queue pause controls. Prove concurrency and multi-instance behavior.
7. Add the hub's installable PWA manifest and approved crown icons after domain verification. Cache only the public static shell/offline page. Use network-only requests for sessions, personal feed, reports, moderation, checkout and ticket data; purge user-local state on logout. Test login/handoffs, installation and reopening on physical iPhone Safari and Android Chrome. App-store packaging is later work.

Alternative: a separately hosted social service linked from the hub. This offers operational isolation but adds cross-origin identity, navigation and app/offline complexity; adopt only after confirming hub hosting constraints. Copying this demo into the ticket public directory is not the recommended production integration.

## Public release gates — all remain closed

- Verified hub ownership/source/hosting and approved crown/imagery.
- Named moderation owner/backup and appeals process with actual coverage.
- Privacy/terms/age rules, retention, deletion/export, reporting and incident procedures.
- Verified real accounts, MFA for moderators, HTTPS and production-grade sessions.
- Durable isolated storage, concurrency-safe writes, backups and auditable decisions.
- Production classifier/media evaluation, rate limits, quota controls and monitoring.
- Security/accessibility review, physical-device/PWA tests, limited cohort acceptance.
- Explicit public launch decision after the preceding gates pass.

There is deliberately no flag to turn this memory-only demo into a public service.
