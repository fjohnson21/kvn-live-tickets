# KVN Branded Access and Unified Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Keep Render behind kvnlive.com and reconcile supported KVN activity in the Command Center.
**Architecture:** Preserve the existing Render engine and persistent records. The existing website serves branded pages and proxies only allowlisted operations. Owner reporting and member views read the same underlying records with different authorization scopes.
**Tech Stack:** Existing Node.js backend and existing Sites website; preserve current dependencies.
**Spec:** docs/superpowers/specs/2026-10-16-kvn-branded-access-unified-reporting.md

## Global Constraints
- Canonical public origin: https://kvnlive.com.
- Render remains the existing backend engine.
- Preserve production records, referral attribution, ticket validity and payment processing.
- Owner and member sessions remain distinct; no automatic enrollment or account-store merger.
- No cross-origin iframe branding workaround or browser-direct Render API calls.
- Report exact UTC intervals with America/New_York display; start inclusive, end exclusive.
- Healthy source freshness target: five minutes; stale/unavailable status must be visible.
- Existing website Site: appgprj_6a970cb9c5808191b44c487542772384.

## Review Focus
- Expired links must recover on the branded domain without leaking tokens.
- Duplicate emails/names must not merge unrelated people or expose another member's activity.
- A comp claim and its generated order must count as one claim.
- A sync failure must preserve prior records and disclose freshness.
- Legacy backend links must preserve attribution without redirecting webhooks or APIs.

---

### Task 1: Inventory deployed interfaces and baseline
**Files:** Read server.js, lib/customer-urls.js, lib/member-routes.js, lib/member-dashboard.js, lib/crm-sync.js, lib/crm-records.js, lib/sponsored-routes.js, lib/email.js, lib/shop-email.js, public/disciples.js, public/sponsored-admin.js, dashboard.js, package.json. Create docs/kvn-branding-route-audit.md. Read the selected website's .openai/hosting.json and tracked route/proxy sources.
**Interfaces:** Produces a route/generator/source inventory with exact website file paths, current method/path, authentication, canonical destination and verification command. No secret values.
- [ ] Open the selected website through the Sites source helper; retain its checkout identity. Check AGENTS.md and backend default-branch changes before implementation.
- [ ] Map every existing product to authoritative collection, stable ID and timestamp; record unsupported integrations explicitly.
- [ ] Map website member, promo, affiliate, commerce and agreement handlers; record owner cookie and CSRF requirements from backend.
- [ ] Record current tests and representative counts without copying production contacts or tokens into fixtures.
- [ ] Commit the audit. If current routes contradict the design, resolve those contradictions before routing edits.

### Task 2: Canonical outgoing URLs
**Files:** Create lib/public-urls.js and test/public-urls.test.js. Modify lib/customer-urls.js, lib/email.js, lib/shop-email.js, server.js, public/disciples.js and outgoing generators identified in Task 1.
**Interfaces:** buildPublicUrl(path: string, query: Record<string,string|number> = {}): string; accepts allowlisted KVN paths only, fixed HTTPS origin, rejects absolute/protocol-relative paths. Existing customer builder delegates without breaking its signature.
- [ ] Write failing tests asserting /member, /command-center, /command-center/sponsored-passes, /affiliate/briannahcooper and existing commerce destinations use https://kvnlive.com.
- [ ] Assert hostile Host headers cannot influence URLs; unknown paths and open redirects fail; encoded handle/query/token values preserve semantics.
- [ ] Run node --test test/public-urls.test.js; verify failure.
- [ ] Implement helper and replace all user-facing Render-origin generation, including welcome/reset/activation messages, copy buttons and exports. Keep backend service configuration separate.
- [ ] Run focused tests plus existing email/member/referral tests; inspect generated HTML/text without sending messages.
- [ ] Commit canonical URL changes. Do not release generators before Task 3 destinations pass.

### Task 3: Branded website access and login
**Files:** Modify exact website route/proxy files recorded in Task 1; create focused branded-command-center proxy and UI modules alongside existing member route conventions. Modify dashboard.html and public/sponsored-admin.html only where asset/base paths require compatibility. Add website proxy tests in its existing test directory.
**Interfaces:** /member, /command-center and /command-center/sponsored-passes; explicit method/path allowlist for existing backend owner/member APIs and required static assets. Forward only scoped session cookies; never accept an arbitrary upstream URL.
- [ ] Write failing tests for unauthenticated owner requests, member attempts at owner APIs, hostile origin mutations, cookie scoping, path traversal and non-allowlisted API paths.
- [ ] Assert login, activation, logout and expired reset flows stay on kvnlive.com; errors omit backend origins and tokens.
- [ ] Implement server-side proxy, location/header rewriting and no-store private responses, retaining backend authentication/CSRF checks.
- [ ] Apply website crown, actual font assets, black/white and restrained red to both login shells; add Member Login navigation.
- [ ] Run website checks/build and proxy tests. Verify owner/member isolation and mobile layout. Use permitted browser tooling only.
- [ ] Commit website changes without publishing until compatibility and rollback artifacts are ready.

### Task 4: Unified activity query and reconciliation
**Files:** Create lib/activity-records.js, lib/activity-query.js, lib/activity-routes.js, test/activity-records.test.js, test/activity-query.test.js and test/activity-routes.test.js. Modify server.js, lib/crm-sync.js and existing source adapters only as needed.
**Interfaces:** collectActivity(store, sourceStates): {rows, sources}; row {id,source,sourceId,personKey,category,occurredAt,status,units,amountCents,relatedId}; queryActivity(result,{from,to,categories}): {rows,totals,sources,from,to,generatedAt}. Owner-only GET /api/activity and GET /api/activity/export.csv use the same query. No access tokens in rows.
- [ ] Write failing tests for paid/comp/pending/refund/upgrade distinctions, linked claim/order deduplication, missing dates, duplicate names and unsupported sources.
- [ ] Assert an activity at from is included and at to excluded, DST intervals use supplied UTC bounds, and CSV totals equal JSON totals.
- [ ] Implement adapters for existing CRM, ticket, sponsored, disciple, apparel, donation, commission and payout records using Task 1 collection mappings. Preserve all original records.
- [ ] Implement stable source-ID deduplication and verified person linkage; uncertain identity matches remain separate.
- [ ] Add protected routes, pagination and exports; test unauthorized users and CSV formula escaping.
- [ ] Implement healthy-source refresh within five minutes using the existing service lifecycle; avoid overlapping syncs. Verify failed sync retains records and records stale/error state.
- [ ] Run new tests plus existing CRM, sponsored, report, member-dashboard and financial tests; commit.

### Task 5: Command Center report and member parity
**Files:** Modify dashboard.html, dashboard.js and existing CRM dashboard modules. Create public/activity-dashboard.js and public/activity-dashboard.css; add test/activity-dashboard.test.js. Modify lib/member-dashboard.js only for proven reconciliation differences.
**Interfaces:** report consumes /api/activity; cards, drilldowns and CSV share exact interval/category filters. Member views retain their existing scoped API and underlying ledger semantics.
- [ ] Write failing tests for last-48-hours timestamps, one shared filter state, stale-source banners, inaccessible source states, empty results, pagination and failed refresh preserving visible last-success data.
- [ ] Add combined activity report with source timestamps and paid/comp/pending distinctions; link the sponsored screen inside branded owner navigation.
- [ ] Ensure each product either contributes verified activity or displays unavailable; never silently present zero for a disconnected product.
- [ ] Reconcile fixtures between owner report, source adapters and member totals, including comp-to-upgrade and member deactivation.
- [ ] Run UI and API checks; verify responsive keyboard-accessible navigation; commit.

### Task 6: Compatibility release and proof
**Files:** Update docs/kvn-branding-route-audit.md and create docs/KVN-BRANDED-ACCESS-RELEASE.md; modify only page-entry redirects in server.js and their focused tests.
**Interfaces:** legacy human page GETs redirect to verified equivalent branded routes; API/webhook methods retain existing handlers.
- [ ] Write failing tests that legacy referral paths preserve attribution, query values and safe fragments where applicable; APIs/webhooks are not redirected.
- [ ] Implement only verified page redirects. Check old pass and agreement links remain valid.
- [ ] Run npm test, npm run check and git diff --check in backend; run selected website's actual checks/build. Review whole diff for authorization and URL leaks.
- [ ] Deploy compatible backend first with persistent storage/config unchanged, then publish matching website source using Sites. Preserve current audience.
- [ ] Verify live branded login, reset destination, owner-only reports, member access boundaries, referral navigation and generated link origins. Inspect browser-visible network and redirects for Render exposure.
- [ ] Reconcile production report counts/IDs for the exact same interval without changing records. Confirm healthy source freshness is measured.
- [ ] Record deployment versions, checks and any verification limits. Roll back routes/UI independently if parity or authentication fails; retain financial data and in-flight recovery.

## Completion contract
No success claim until live branded routes and supported-source reconciliation pass. No bulk email or synthetic production member account. Third-party payment pages retain their legitimate domain. Report unsupported integrations and real-device testing limits explicitly.
