# Live Kingdom Disciple Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a live, auditable Kingdom Disciple workflow from KVN application intake through approval, welcome delivery, referral attribution, commissions, and payout operations.

**Architecture:** Keep the Render-hosted KVN Command Center as the canonical Disciple system and KVNLive.com as the public intake surface. Add retryable operational APIs and dashboard controls in the ticketing service, plus an idempotent administrator-only bridge that transfers preserved legacy D1 applications into the canonical intake.

**Tech Stack:** Node.js, Express, JSON persistent store, vanilla dashboard JavaScript/CSS, Node test runner, Next.js/Vinext, Cloudflare D1, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-25-live-disciple-operations-design.md`

## Global Constraints

- Preserve all production ticket, order, customer, payment, application, and commission records.
- Keep the approved 10% eligible-gross commission, 30-day attribution, monthly payout on the 15th, and no minimum payout.
- Never expose secret values or applicant private data through public endpoints or logs.
- Keep all Disciple management and financial mutations owner-only.
- Use idempotent application transfer, approval, and email retry behavior.
- Treat email failure as visible operational attention, not as approval rollback.
- Keep the existing black/white/red KVN Command Center visual language and responsive behavior.

## Review Focus

- Repeated legacy transfer requests must return the original Command Center application instead of creating duplicates; covered by Task 4 tests.
- A welcome provider timeout after approval must leave one active Disciple and a retryable failed email state; covered by Task 1 tests.
- Repeated approval or retry clicks must not create duplicate Disciple identities or links; covered by Tasks 1 and 2 tests.
- Missing secrets must appear as safe health warnings and must never leak environment values; covered by Task 2 tests.
- Paid, reversed, and already-paid commissions must reject invalid duplicate financial transitions; covered by Task 3 tests.

---

### Task 1: Reliable Approval and Welcome Delivery

**Files:**
- Create: `lib/disciple-operations.js`
- Modify: `server.js`
- Test: `test/disciple-operations.test.js`
- Test: `test/disciple-dashboard.test.js`

**Interfaces:**
- Consumes: existing `upsertDiscipleFromApplication`, `sendDiscipleWelcome`, store arrays, `id(prefix)`, and owner authentication middleware.
- Produces: `approveDiscipleApplication(store, input, deps)`, `recordWelcomeAttempt(disciple, result, deps)`, and owner routes for approval, resend, activation status, and audit retrieval.

- [ ] **Step 1: Write failing lifecycle tests** asserting one Disciple per application reference, persisted approval before provider failure, complete welcome attempt history, safe retry behavior, and audit entries.
- [ ] **Step 2: Run `node --test test/disciple-operations.test.js`** and confirm the new interfaces are missing.
- [ ] **Step 3: Implement the minimal operations module and refactor approval routes** to use it without changing existing application or Disciple fields.
- [ ] **Step 4: Add owner-only resend, deactivate/reactivate, and audit endpoints** with validation and idempotent state transitions.
- [ ] **Step 5: Run `node --test test/disciple-operations.test.js test/disciple-dashboard.test.js`** and confirm all lifecycle tests pass.
- [ ] **Step 6: Commit** with `feat: make disciple approval and welcome delivery reliable`.

### Task 2: Configuration Health and Dashboard Action Surface

**Files:**
- Create: `lib/system-health.js`
- Modify: `server.js`
- Modify: `public/dashboard.html`
- Modify: `public/dashboard.js`
- Modify: `public/styles.css`
- Test: `test/system-health.test.js`
- Test: `test/disciple-dashboard.test.js`

**Interfaces:**
- Consumes: environment booleans, persistent-store path/write probe, dashboard data, and Task 1 owner endpoints.
- Produces: `buildSystemHealth(env, storageProbe, store)`, owner-only `GET /api/system-health`, configuration cards, attention counters, and working application/Disciple action menus.

- [ ] **Step 1: Write failing health tests** for configured, missing, degraded, storage-failure, and secret-redaction cases.
- [ ] **Step 2: Run `node --test test/system-health.test.js`** and confirm failure.
- [ ] **Step 3: Implement `buildSystemHealth` and the owner-only health route** with no secret values in its response.
- [ ] **Step 4: Write failing dashboard contract tests** for Approve, Need Info, Reject, Copy Link, Test Link, Resend Welcome, Edit, Deactivate/Reactivate, Leader, Team, Bundle, Credit Sale, and Export controls.
- [ ] **Step 5: Implement the Disciple operations header, health panel, filters, action menus, confirmations, and success/error feedback** using the existing dashboard style.
- [ ] **Step 6: Run `node --test test/system-health.test.js test/disciple-dashboard.test.js`** and `npm run check`; confirm all pass.
- [ ] **Step 7: Commit** with `feat: add live disciple controls and system health`.

### Task 3: Commission, Payout, and Export Operations

**Files:**
- Create: `lib/disciple-exports.js`
- Modify: `server.js`
- Modify: `public/dashboard.html`
- Modify: `public/dashboard.js`
- Test: `test/disciple-financial-operations.test.js`
- Test: `test/disciple-dashboard.test.js`

**Interfaces:**
- Consumes: existing commission creation/reversal/payment routes and dashboard commission/payout arrays.
- Produces: validated financial transitions, owner CSV endpoints, summary metrics, and working dashboard controls for manual Kingdom Market credit, reversal, payment recording, and exports.

- [ ] **Step 1: Write failing financial-transition tests** for pending-to-paid, pending-to-reversed, already-paid, already-reversed, invalid amount, and missing payment reference cases.
- [ ] **Step 2: Run `node --test test/disciple-financial-operations.test.js`** and confirm failure.
- [ ] **Step 3: Extract and harden the transition logic** while preserving existing commission records and approved calculations.
- [ ] **Step 4: Write failing export tests** for applications, active Disciples, commissions, payouts, escaping, and no-record headers.
- [ ] **Step 5: Implement export routes and dashboard financial controls/summary cards.**
- [ ] **Step 6: Run the Task 3 tests plus `test/disciple-commission.test.js` and `npm run check`; confirm all pass.**
- [ ] **Step 7: Commit** with `feat: operationalize disciple commissions and payouts`.

### Task 4: Legacy KVN Application Transfer

**Files:**
- Create in KVN Site: `lib/legacy-disciple-transfer.ts`
- Create in KVN Site: `app/api/admin/disciples/[id]/transfer/route.ts`
- Create in KVN Site: `app/admin/disciples/[id]/LegacyTransferButton.tsx`
- Modify in KVN Site: `app/admin/disciples/[id]/page.tsx`
- Test in KVN Site: `tests/unit/legacy-disciple-transfer.test.ts`
- Test in KVN Site: `tests/integration/disciple-routes.test.ts`

**Interfaces:**
- Consumes: legacy D1 row, ChatGPT Site administrator identity, `COMMAND_CENTER_URL`, `DISCIPLE_INTAKE_SECRET`, and the canonical intake endpoint.
- Produces: `transferLegacyDiscipleApplication(application, env)`, stable `legacy:<reference_number>` idempotency key, a safe transfer response, and a legacy audit event.

- [ ] **Step 1: Write failing mapping tests** for every preserved contact, application, agreement, consent, and timestamp field plus stable idempotency.
- [ ] **Step 2: Run the focused Vitest file** and confirm failure.
- [ ] **Step 3: Implement the server-only mapping and transfer client** with safe upstream errors and no secret exposure.
- [ ] **Step 4: Write failing route tests** for unauthorized, missing record, success, repeated success, upstream failure, and audit recording.
- [ ] **Step 5: Implement the authenticated route and detail-page control** with clear transferred/already-transferred/failure states.
- [ ] **Step 6: Run Site unit, integration, typecheck, and production build checks; confirm all pass.**
- [ ] **Step 7: Commit** with `feat: transfer legacy disciple applications to command center`.

### Task 5: Full Verification and Production Release

**Files:**
- Modify only if verification reveals a defect: files owned by Tasks 1–4.
- Update: `docs/superpowers/plans/2026-09-25-live-disciple-operations.md` checkboxes.

**Interfaces:**
- Consumes: completed Task 1–4 endpoints, dashboards, and production deployment processes.
- Produces: verified Render release, verified KVN Site release, Briannah’s active account/link, recorded welcome message ID, and a controlled attribution result.

- [x] **Step 1: Run the complete ticketing test suite and syntax checks** and record passing counts.
- [x] **Step 2: Run the complete KVN Site unit/integration/build checks** and record passing counts.
- [x] **Step 3: Review the diff for secrets, private data, unrelated changes, and production-record mutation risk.**
- [ ] **Step 4: Push the ticketing commits, deploy the exact Render commit, and wait for a live deployment.**
- [ ] **Step 5: Push/save/deploy the exact KVN Site commit and wait for a successful production deployment.**
- [ ] **Step 6: Verify public application intake and authenticated system-health behavior without exposing secrets.**
- [ ] **Step 7: Transfer Briannah’s preserved v1.0 application, request her current v2.2 agreement, and approve only after her new acceptance is recorded; then verify the personal link and welcome provider message ID.**
- [ ] **Step 8: Run a controlled attribution/commission smoke test without altering historical customer orders; remove or clearly label any synthetic test record.**
- [ ] **Step 9: Confirm the legacy test submission remains inactive and report any administrator action still required.**
