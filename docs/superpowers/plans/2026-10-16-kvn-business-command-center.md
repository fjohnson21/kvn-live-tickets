# KVN Business Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Preserve the session's native execution method; do not dispatch implementation agents unless the owner selects that method.

**Goal:** Deliver income-first business workspaces, source-linked fulfillment and budgets, and shared conversational controls inside Command Center and ChatGPT.

**Architecture:** Keep the current Render ticketing engine and branded Sites gateway. Add focused owner reporting, fulfillment, finance and action modules over authoritative records. Both chat surfaces invoke the same validated action handlers; they do not write directly to storage.

**Tech Stack:** Existing Node.js/Express backend, current JSON persistence and Sites/TypeScript website. Existing Resend campaign execution and Controller OAuth/MCP foundation. Select the OpenAI API/SDK only after the supported credential workflow and current official documentation are verified.

**Spec:** `docs/superpowers/specs/2026-10-16-kvn-business-command-center-design.md`

## Global Constraints
- Canonical user-facing origin: `https://kvnlive.com`; preserve current site audience.
- One owner login; owner/member sessions remain separate. No broadening staff access by default.
- Yesterday, Today so far and Month to date use `America/New_York` calendar boundaries, represented by inclusive-start/exclusive-end UTC intervals.
- Count each original paid transaction and expense once. Keep donations, comp passes, pending commitments and sales distinct.
- Preserve production records, ticket validity, attribution, inventory, payments and existing broadcast behavior.
- Missing data is `Not recorded` or `Not connected`; it is not an invented zero or profit.
- Do not seed historical financial amounts from conversations.
- Real emails, refunds, stock changes or fabricated production transactions are not QA fixtures.
- Build output public files must match source byte for byte before saving a version.

## Review Focus
- A refunded sale and its refund occur in different months: retain payment-date sales and refund-date adjustments; test in Task 2.
- Two legitimately equal payments and one duplicated provider event: preserve distinct transactions and deduplicate only verified identities; test in Task 2.
- One bundle has several shirts, a partial fulfillment and a legacy shipment: preserve item state and inventory; test in Task 5.
- A commitment is paid through several installments and costs are shared: do not double-count paid/committed balances; test in Task 6.
- A chat tool times out after saving or sending, then retries: return the original action result without repeating side effects; test in Tasks 9–11.

## Delivery structure

Five independently testable release stages: A — income overview/navigation (Tasks 1–3); B — business workspaces/fulfillment (Tasks 4–5); C — budgets (Task 6); D — verified external sources (Tasks 7–8); E — both chat surfaces (Tasks 9–11). Task 12 validates and releases each stage. The entire approved scope remains open until all stages are delivered or a concrete access blocker is reported. A visible navigation entry never implies an unavailable integration is working.

---

### Task 1: Authoritative source contracts and release baseline
**Files:** Read `server.js`, `lib/member-dashboard.js`, `lib/shop-report.js`, `lib/bundle-fulfillment.js`, `lib/controller-mcp.js`, `lib/marketing-routes.js`; website `lib/engine-proxy.ts`, `worker/index.ts`, `scripts/build-verified.sh`. Create `docs/kvn-business-source-contracts.md` and `test/business-source-contracts.test.js`.
**Interfaces:** Produce a field/source map for payment ID, order ID, paid timestamp, amount/currency, refunds, event/business attribution, stock effects and fulfillment identifiers. Record exact KV Live event ID and separate KV Social service/branch, authentication and schemas from actual source/config; do not infer by display name alone.
- [ ] Write fixture assertions that known paid ticket, shop and upgrade records map to distinct stable source IDs; missing paid timestamps remain explicit exceptions.
- [ ] Run `node --test test/business-source-contracts.test.js`; verify failure before adding the adapter contract in Task 2.
- [ ] Inspect current main/source heads and pending changes. Create isolated implementation worktrees using using-git-worktrees; preserve existing local work. Inspect `social-app/server.js` on the existing `codex/kv-social-bunny-video` branch through GitHub, rather than assuming it is on ticketing main.
- [ ] Run backend `npm test`/`npm run check`, website `npm run typecheck`, focused unit checks and `npm test`; record existing failures by name. Capture no credentials or production contacts in fixtures.
- [ ] Commit the source map together with Task 2's passing contract tests.

### Task 2: Platform sales ledger and Eastern reporting periods
**Files:** Create `lib/business-periods.js`, `lib/business-sales.js`, `test/business-periods.test.js`, `test/business-sales.test.js`; complete Task 1's test.
**Interfaces:** `businessPeriods(now:Date): {yesterday,today,mtd}` where each period has `from,to,label`; `collectBusinessSales(store,sourceContract): {transactions,exceptions,sources}`; `queryBusinessSales(ledger,{from,to,business,eventId,currency}): {grossSalesCents,refundCents,netCollectedCents,rows,byBusiness,coverage}`. Transaction fields include stable ID, source, sourceId, paymentId, business, eventId, paidAt, amountCents, currency and linked refund records with their actual timestamps.
- [ ] Write failing tests: Eastern midnight and DST boundaries; paid-at versus created-at; exact end exclusion; donations/comp/pending excluded; separate currencies; missing timestamp disclosed; ticket/upgrade linkage deduplicated; equal independent payments preserved; refund in a later month does not move the original sale.
- [ ] Run `node --test test/business-periods.test.js test/business-sales.test.js test/business-source-contracts.test.js`; confirm failures are missing interfaces/behavior.
- [ ] Implement the three interfaces using Task 1's verified field mappings. Record gross sales and actual dated refund adjustments separately. Disclose incomplete historic refund timestamps instead of guessing them.
- [ ] Re-run focused tests plus `test/activity.test.js`, `test/dashboard-metrics.test.js`, `test/member-portal.test.js`; require matching owner/member source semantics.
- [ ] Commit `feat: add reconciled platform business sales reporting`.

### Task 3: Owner reporting API and income-first navigation
**Files:** Create `lib/business-routes.js`, `public/business-dashboard.js`, `public/business-dashboard.css`, `test/business-routes.test.js`, `test/business-dashboard.test.js`; modify `server.js`, `public/dashboard.html`, `public/dashboard.js`; website `lib/engine-proxy.ts`, `tests/unit/engine-proxy.test.ts`.
**Interfaces:** Owner-only GET `/api/business/overview`, `/api/business/sales` and `/api/business/sales.csv`. Overview returns the three fixed income periods plus selected-period business contributions and source status. Sales JSON/CSV share the same Task 2 query. UI registry: `shop,tix,live,market,ministry,disciples,social,marketing,email,finance` with stable labels, route state and existing-tool destinations.
- [ ] Write failing API/UI tests for owner-only scope, labeled cards, click-to-filter ledger, matching CSV totals, search/page state, stale source disclosure, mobile/keyboard navigation and private-data removal on logout.
- [ ] Run `node --test test/business-routes.test.js test/business-dashboard.test.js` and website gateway tests; verify expected failures.
- [ ] Implement routes and income-first screen. Use fixed server-validated business keys; persist only non-sensitive UI selection in URL. Add an explicit `/business` group to gateway allowlist and required static assets. Keep prior operational panels reachable until replaced.
- [ ] Verify a fixture can navigate every workspace and return to overview; every visible action has a handler/destination. Run website typecheck/build and public-asset parity.
- [ ] Commit Stage A and release using Task 12.

### Task 4: Dedicated business views and actionable queues
**Files:** Create `lib/business-workspaces.js`, `public/business-workspaces.js`, `test/business-workspaces.test.js`, `test/business-workspaces-ui.test.js`; modify Task 3 registry/routes and existing `public/crm-dashboard.js`, `public/marketing-dashboard.js` only for scoped entry points.
**Interfaces:** `businessWorkspace(store,{business,eventId,from,to}): {metrics,records,queues,coverage,links}`; GET `/api/business/workspaces/:business`. Workspace links resolve to existing authorized event, CRM, shop, disciple, marketing and email actions. KV Live uses configured authoritative event ID; ministry/market use verified category IDs, not fuzzy name matching.
- [ ] Write failing tests for scoped event/business records, vendor inquiry versus payment distinction, ministry/corporate classification, filter-consistent metrics and an explicit unavailable Social view.
- [ ] Run `node --test test/business-workspaces.test.js test/business-workspaces-ui.test.js`; verify failures.
- [ ] Implement distinct views with useful actions, search, record history, report exports and coverage. Marketing covers acquisition/conversion/spend; Email covers audience/draft/broadcast/delivery operations. Do not duplicate or replace the working broadcast runner.
- [ ] Test event editing, existing CRM disposition, disciple preview and saved campaign access through disposable fixtures. Keep real sends/refunds disabled in fixtures.
- [ ] Commit `feat: add dedicated KVN business operating workspaces`.

### Task 5: Combo apparel in Shop with original-record fulfillment
**Files:** Create `lib/shop-fulfillment.js`, `lib/shop-fulfillment-routes.js`, `public/shop-fulfillment.js`, `test/shop-fulfillment.test.js`, `test/shop-fulfillment-routes.test.js`; modify `lib/bundle-fulfillment.js`, `lib/business-workspaces.js`, `server.js`.
**Interfaces:** `collectShopFulfillment(store): FulfillmentItem[]` with sourceType/sourceOrderId/ticketId/itemId, size, quantity, eligibility, current state and history; `transitionFulfillment(store,{itemIds,transition,details,expectedRevision,requestId,actor}): {store,result}`. GET `/api/business/shop/fulfillment`; POST `/api/business/shop/fulfillment/actions`. Allowed states: needs_size, ready, packed, shipped, picked_up, cancelled, issue; map original state without inventing history.
- [ ] Write failing tests for standalone/included/optional apparel; several shirts per order; partial fulfillment; legacy-not-tracked; duplicate submission; ineligible unpaid/refunded items; conflicting revisions; no additional stock deduction, sale or email from viewing a bundle.
- [ ] Run both new test files; confirm expected failures.
- [ ] Implement original-record transitions and audit entries. Shipping requires carrier/tracking; pickup records completion. Notifications are separate explicit actions. Return per-item rejection reasons for bulk selections.
- [ ] Verify original ticket validity, inventory and member statistics before/after transitions; run existing bundle, shop, ticket and refund tests.
- [ ] Commit and release Stage B with Task 4.

### Task 6: Budgets, commitments and recorded expenses
**Files:** Create `lib/business-finance.js`, `lib/business-finance-routes.js`, `public/business-finance.js`, `test/business-finance.test.js`, `test/business-finance-routes.test.js`; modify `server.js` persistence initialization without replacing existing data.
**Interfaces:** Backward-compatible `businessFinance:{budgets,commitments,expenses,payments,allocations,revisions}`. `financeSummary(store,{business,projectId,from,to}): {approvedBudget,committedUnpaid,paid,uncommittedRemaining,coverage}`. `applyFinanceAction(store,{kind,input,expectedRevision,requestId,actor})` validates budget/commitment/payment/allocation/reversal. Owner GET/POST `/api/business/finance` and GET `/api/business/finance.csv`.
- [ ] Write failing tests for empty historic ledger, installment payments, linked commitment satisfaction, over-allocation, allocations summing exactly to original expense, reversal/correction audit and independent-project versus platform rollups.
- [ ] Run both new finance test files; confirm failures.
- [ ] Implement audited finance records and UI. Approved budget minus paid and outstanding committed costs yields remaining uncommitted budget. Require positive integer currency units; preserve currency separation. Manual payment entries are visibly owner-recorded and never create verified sales or initiate transfers.
- [ ] Verify source reports do not double-count expenses/payments and incomplete cost data does not display profit/margin. Run reporting/security tests and exports.
- [ ] Commit and release Stage C through Task 12.

### Task 7: KV Social verified reporting integration
**Files:** In ticketing create `lib/business-social.js`, `test/business-social.test.js`; modify `lib/business-workspaces.js`. In the existing Social branch, create `social-app/business-reporting.js`, `social-app/test/business-reporting.test.js`; register its route in `social-app/server.js` following the actual middleware/schema recorded in Task 1.
**Interfaces:** Social GET `/api/internal/business-summary` returns only aggregate metrics, moderation queue counts, generatedAt and source status. The adapter uses a fixed configured origin and server-to-server authenticated requests with short timeout; never forwards the ticketing owner cookie. `loadSocialSummary({origin,credential,fetchImpl}): {metrics,coverage}`.
- [ ] Inspect the current Social branch and write failing tests against its real schema for counts, authentication, private-content exclusion and source-unavailable preservation. If repository/service access is missing, report the exact blocker and keep Not connected visible.
- [ ] Run the new adapter and Social tests and confirm failure.
- [ ] Implement aggregate reporting and its dedicated workspace. Reuse Social moderation authorization for any operational deep link; do not manufacture cross-service SSO. Never invent membership or view counts from post totals.
- [ ] Verify real integration health and reconcile aggregate fixture counts with the source. Show unsupported actions clearly until their genuine authorized interface is implemented.
- [ ] Commit both branches and release Stage D's Social adapter with source service compatibility first.

### Task 8: Partner/market verified payment linkage
**Files:** Create `lib/business-partner-payments.js`, `test/business-partner-payments.test.js`; modify `lib/business-sales.js`, `lib/business-workspaces.js`, `lib/business-finance.js` only through defined interfaces.
**Interfaces:** `resolvePartnerPayment(store,{sourceType,sourceId}): {verifiedTransaction,commitment,exceptions}` maps existing processor-verified payments to explicit partner/vendor/contract IDs. If no payment integration exists, expose an owner-recorded commitment/payment workflow through Task 6 and label it separately from processor-verified sales.
- [ ] Write failing tests: an application is not a sale; one payment linked to several views counts once; deposits leave a balance; duplicate contact names cannot link a payment; incomplete integrations stay explicit.
- [ ] Run `node --test test/business-partner-payments.test.js`; verify failure.
- [ ] Implement only verified source relationships, maintaining separate payment-provenance categories. Add corporate sponsorship category and event/project linkage.
- [ ] Verify each relevant dashboard/CSV reconciles and incomplete historical records remain disclosed.
- [ ] Commit and release remaining Stage D adapters.

### Task 9: Shared authorized action service
**Files:** Create `lib/business-actions.js`, `lib/business-actions-routes.js`, `test/business-actions.test.js`, `test/business-actions-routes.test.js`; refactor small reusable operations from `server.js` only where required; preserve route compatibility.
**Interfaces:** `listBusinessActions(principal)`, `prepareBusinessAction({principal,name,args}): {operationId,target,expectedRevision,before,after,expiresAt,requirements}`, `executeBusinessAction({principal,operationId,requestId}): {status,result,auditId}`. Persist private prepared-operation and idempotency records. Owner POST `/api/business/actions/prepare` and `/api/business/actions/execute`; allowlisted operations: reports, event/product edits, fulfillment, CRM disposition, finance updates, campaign drafts/preflight/send.
- [ ] Write failing tests for member/staff denial, stale revisions, changed audience/draft, expired operations, tampered arguments, ambiguous target IDs, read versus edit/send scope and retries after a side effect completed but response was lost.
- [ ] Run both action test files; confirm failure.
- [ ] Implement fixed action schemas, server permissions, audit results and retry reconciliation. Prepared changes bind to exact actor/target/revision/arguments; request IDs cannot authorize another payload. Adapt campaign execution through existing preflight/broadcast functions, never a second mail sender.
- [ ] Verify persisted retries return the original result and untrusted record/email/post text cannot choose tools or grant access. Check no secrets enter tool results.
- [ ] Commit `feat: add shared audited business action service`.

### Task 10: Embedded Command Center assistant
**Files:** Create `lib/business-assistant.js`, `lib/business-assistant-routes.js`, `public/business-assistant.js`, `test/business-assistant.test.js`, `test/business-assistant-routes.test.js`; modify dashboard shell, gateway and focused website tests.
**Interfaces:** Owner POST `/api/business/chat` accepts `{conversationId,message,requestId}`; emits conversation/turn IDs, text, prepared operations and confirmed action results from Task 9. The backend owns model credentials and tool execution; browser sends no API key. Disabled/missing access returns a useful assistant-unavailable state without breaking dashboards.
- [ ] Follow the openai-platform-api-key skill and current official Agents/API documentation, check project/model access, then record the verified SDK/runtime contract. Do not guess API methods or silently substitute an unsupported API path.
- [ ] Write failing tests for owner/session/CSRF isolation, safe tool-result rendering, secret exclusion, untrusted content, bounded turns, disconnect/reconnect, unsupported commands and retry reconciliation.
- [ ] Run both assistant test files; confirm failure.
- [ ] Implement the verified API integration with a fixed Task 9 tool registry and visible execution status. Read commands can run directly; exact already-authorized writes proceed within scope; unresolved/ambiguous edits present a concrete review before execution. Never add arbitrary production code/SQL execution.
- [ ] Run a bounded live read-only report after credentials/access exist; compare its figures with the dashboard and source ledger. Use fixtures for sends and mutations; commit.

### Task 11: Authenticated ChatGPT connection using shared tools
**Files:** Modify `lib/controller-mcp.js`, `lib/controller-routes.js`, gateway discovery handling and existing controller tests; create `test/business-controller.test.js` and `docs/kvn-chatgpt-connection.md`.
**Interfaces:** Extend authenticated tool definitions with Task 9 business read/edit/send tools and scopes; preserve existing reporting/campaign tools. Branded fixed `/mcp` and required OAuth protected-resource discovery routes proxy only their documented paths with token-preserving server verification; never expose the engine origin or owner cookie.
- [ ] Resolve the documented dependency-security findings before external writes. Read actual OAuth configuration and current official ChatGPT connector requirements; missing issuer/client provisioning is an explicit setup blocker, not a working toggle.
- [ ] Write failing tests for issuer/audience/owner binding, expiry, revocation, scope separation, discovery metadata, Controller OFF state, changed campaign/audience revisions and duplicate external retries.
- [ ] Run new and existing controller tests; confirm expected failures.
- [ ] Connect tools to the same action service. Preserve recipient suppression/consent and current broadcast pipeline; report queued/accepted/delivered separately. Bound tool output and exclude secrets/private bulk contact lists.
- [ ] Configure and verify the actual owner connection here in ChatGPT with a real read-only business report; compare its exact interval/totals with the embedded assistant and UI. Do not claim connection success from merely publishing endpoints. Commit and release Stage E.

### Task 12: Each-stage release and final acceptance
**Files:** Update `docs/kvn-business-source-contracts.md`; create `docs/kvn-business-command-center-release.md`; preserve website `tests/public-assets.test.mjs` and existing build safeguards.
**Interfaces:** Release manifest lists exact backend/Social commits, Site version/deployment IDs, supported sources, data-contract changes, completed stages, access blockers and rollback versions.
- [ ] Run relevant tests, full project commands, backend syntax checks, website typecheck/build, packaged-asset parity and `git diff --check`. Report failures by test name; distinguish existing content assertions from feature/security regressions.
- [ ] Review owner/member separation, financial reconciliation, migrations/backups, source freshness and action idempotency before merging. Follow the selected execution skill's final independent review requirement.
- [ ] Deploy compatible source services/backend first and matching Sites source second. Preserve persistent storage/config, current audience and in-flight payment/email state. Record rollback versions; no synthetic production transactions.
- [ ] Verify live login, income cards/drilldowns, each completed workspace, both disciple views, bundle fulfillment visibility, budgets, exports, mobile controls, logout, and both authenticated chat surfaces. Use only permitted browser/tools and report blocked checks honestly.
- [ ] Finish with the verified entry point, actual capabilities and remaining source/access limitations; keep uncompleted stages open.

## Plan self-review

Coverage maps: sales and navigation → Tasks 1–3; separate workspaces and dispositions → Tasks 4–5; expense/budget reconciliation → Task 6; Social and partner source gaps → Tasks 7–8; shared permission/idempotency model → Task 9; embedded and ChatGPT surfaces → Tasks 10–11; deployment proof → Task 12. Every Review Focus condition has an owning regression test. New module names and interfaces are consistent; no production migration or external credential is assumed to exist.
