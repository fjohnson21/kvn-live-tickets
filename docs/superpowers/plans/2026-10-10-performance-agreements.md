# Performance Agreements Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task.

**Goal:** Secure agreement delivery, acceptance and unified status without replacing existing links.
**Architecture:** Independent atomic file store; Express routes; owner dashboard module; public signing page; authenticated read-only legacy Site bridge.
**Tech Stack:** Node/Express, native crypto/fetch, HTML/JS, existing Resend and Cloudflare D1.
**Spec:** ../specs/2026-10-10-performance-agreements.md

## Global constraints
- Preserve existing links, finalized terms, acceptance evidence, and production orders/tickets.
- Never send an agreement before explicit confirmation of exact content and recipient.
- Keep email delivery, email opens, page views and acceptance separate.
- No live performer data or secrets in Git.

## Review focus
- Interrupted provider calls must never silently resend (route send concurrency test).
- Legacy accepted evidence must not be overwritten by a later snapshot (sync conflict test).
- Wrong/expired verification codes cannot sign (acceptance and lockout tests).
- Stale approval cannot send a newer version (revision test).
- Async network callbacks must reload before writing (concurrent delivery/acceptance test).

## Tasks
1. Storage and domain (`lib/performance-agreements.js`, `test/performance-agreements.test.js`): write failing tests; implement atomic file store, version approval, token/OTP and acceptance state; rerun.
2. HTTP and email (`lib/performance-agreement-routes.js`, `test/performance-agreement-routes.test.js`, `server.js`): test auth/CSRF, duplicate/unknown send, external reconciliation, provider facts and acceptance; implement routes using transaction callbacks and injected transport; rerun.
3. Existing Site (`app/api/command-center/route.ts`, existing agreement route, bridge tests): add authenticated complete snapshots and additive view tracking; preserve text, tokens and acceptance table; test and publish.
4. UI (`public/performance-agreements.js`, public signing HTML/JS, dashboard integration): owner list, details, draft, approve, send, refresh, revoke, evidence download; responsive signing form with verification/consent. Test malicious content and full lifecycle.
5. Verify full npm test/check and mobile browser suite. Inspect diff, commit, push feature branch, create PR with deployment/configuration instructions and honest verification limits.
