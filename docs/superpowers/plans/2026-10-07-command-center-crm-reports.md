# KVN Command Center CRM and Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CRM and Kingdom Market placeholders with connected intake records, actionable overview totals, editable relationship profiles, and reconciled CSV reports.

**Architecture:** Keep the current Node/Express Command Center and add CRM modules around its JSON store. An authenticated, paginated read-only feed in the existing KVN website provides all three intake tables; the Command Center pulls and upserts reporting copies, keeping owner edits separate. Pulling saved records makes intake independent of reporting outages and allows repeatable backfill without a new source-side queue.

**Tech Stack:** Existing Node ESM/Express/node:test; vanilla dashboard JS/CSS; existing Sites Vinext/TypeScript/D1/Vitest. Use existing dependency versions and lockfiles.

**Spec:** ../specs/2026-10-07-command-center-crm-reports-design.md — approved October 7, 2026. Plan awaits review and execution selection.

## Global Constraints
- Preserve the existing black/white/red interface and owner login.
- Owner access only for new CRM, partnership, and report endpoints in this release; retain existing organizer/staff permissions elsewhere.
- Default to the last 30 calendar days in America/New_York; offer Today, Last 7 Days, Last 30 Days, All Time, and Custom.
- Statuses: New, Contacted, Follow-up, Qualified, Closed.
- Categories are Vendor, Corporate Sponsor, Ministry Partner, and General Partnership.
- Owner-managed stages: Inquiry, Contacted, Proposal Sent, Confirmed, Declined.
- Add crmRecords, crmActivities, and crmSyncState without replacing existing collections.
- No permanent deletion in this release.
- Preserve production orders, tickets, payments, existing applications, consent evidence, affiliate attribution, and commission records.
- No automated report email or scheduled distribution is included.
- Deployment must verify a persistent data directory and a single writer instance; otherwise release is blocked until durable storage is configured.

## Review Focus
- A returning early-access email updates its existing source row; sync must retain its ID and owner notes (Task 2).
- Current Kingdom Market submissions live in partner_leads, not the legacy kingdom_market_applications table; do not omit them (Tasks 1–2).
- SQLite timestamps omit a timezone while newer values use ISO UTC; normalize both and test DST boundaries (Tasks 1 and 3).
- A record is edited while a network sync is running; read the latest store after awaits and reject conflicting owner revisions (Tasks 2 and 4).
- A filtered export spans multiple pages or contains spreadsheet formulas/newlines; export every matching row safely, with count parity (Tasks 3 and 5).

## Grounded source findings
Command Center branch: codex/command-center-crm-reports-2026-10-07.
Spec commit: 3e089ea24632306b37eeca6d9160416d5b208f61.
Website checkout inspected at a5719cfeb01670d7d5ab758b893a775b96831802:
- app/api/early-access/route.ts upserts early_access_leads by email. Its returned generated leadId is not reliable for an update; use the persisted row ID.
- app/api/partners/route.ts writes partner_leads.
- app/api/kingdom-market/apply/route.ts also writes partner_leads; opportunity_type distinguishes church/sponsor/market and participation_level retains tier.
- kingdom_market_applications exists in live D1 but is not the current form's write target. Include it as a legacy source with its own table-qualified identity.
- partner_leads does not store consent flags or accepted terms. Display Not captured; do not invent consent from the fact of submission.
- Early-access counts represent source intake records, not the number of historical form submissions.

## File map
Command Center:
- store.js: additive collection initialization and atomic file replacement.
- lib/crm-records.js: normalization/upsert, edits, activity history.
- lib/crm-sync.js: signed feed requests, pagination, retries, freshness.
- lib/crm-query.js: validated filters, Eastern date bounds, common matching and counts.
- lib/crm-export.js: CSV serialization and report metadata.
- lib/crm-routes.js: owner-only routes, same-origin mutation enforcement.
- lib/dashboard-metrics.js: explicit paid revenue and refunded-order metrics.
- public/crm-dashboard.js and public/crm-dashboard.css: overview, tables, details, reports.
- public/dashboard.html, public/dashboard.js: integrate new module and preserve existing workflows.
- server.js: route registration and single-flight sync lifecycle.
- env.example: CRM_SOURCE_URL and CRM_SYNC_SECRET descriptions only.
- test/crm-*.test.js and test/dashboard-metrics.test.js: meaningful behavioral coverage.

Existing website:
- Create lib/crm-feed.ts: D1 feed with explicit field allowlists.
- Create app/api/integrations/crm/route.ts: signed read-only feed route.
- Create tests/unit/crm-feed.test.ts and tests/integration/crm-feed-route.test.ts.
- Modify .env.example/env.d.ts only as required for CRM_SYNC_SECRET.
- Preserve source forms and their write paths.

---

### Task 1: Authenticated source feed
**Interfaces:** Export `readCrmFeed(db, request, secret, now): Promise<Response>` from website lib/crm-feed.ts. GET /api/integrations/crm accepts source (exact table enum), after (last ID or empty), and limit (1–100). Returns {schemaVersion:1, source, rows, nextAfter, sourceCount, generatedAt}. Rows use the actual source column names, limited to the columns listed below. Signed headers x-kvn-crm-time (Unix seconds) and x-kvn-crm-signature authenticate HMAC-SHA256 of timestamp + newline + GET + newline + pathname/search. Reject timestamps beyond 300 seconds. Read-only replay within this window cannot mutate data.
- early_access_leads: id, first_name, last_name, email, mobile, city_state, interests, email_consent, text_consent, created_at, updated_at.
- partner_leads: id, contact_name, organization, email, phone, social_url, opportunity_type, participation_level, group_size, message, preferred_contact, created_at.
- kingdom_market_applications: id, reference_number, status, contact_name, business_name, email, phone, tier, category, business_url, team_size, message, terms_accepted, created_at, updated_at.

- [ ] Write unit/route tests for missing/bad/expired signatures (401), missing configured secret (503), unknown table/invalid cursor or limit (400), and keyset pages using ORDER BY id with parameterized id > after.
- [ ] Run `npm run test:unit -- tests/unit/crm-feed.test.ts tests/integration/crm-feed-route.test.ts`; expect failure until the feed exists.
- [ ] Implement feed using getRawDb() and Web Crypto HMAC verification. Bound cursor length to 200, reject response caching with Cache-Control: no-store, and select explicit columns. Do not allow arbitrary table names/SQL.
- [ ] Test that both a Kingdom Market row in partner_leads and a legacy row are returned, that a zero-row table is a successful connected source, and no public request receives contacts.
- [ ] Run the same tests and `npm run typecheck`; expect pass, recording any unrelated existing failure separately.
- [ ] Commit the source feed and tests in the existing Site checkout; do not publish yet.

### Task 2: Durable normalization and repeatable sync
**Interfaces:** `normalizeSourceRow(source,row): SourceRecord`; `upsertCrmRecords(store,records,{now,id}): {created,updated,unchanged}`; `syncCrmSources({sourceUrl,secret,fetchImpl,readStore,writeStore,now}): Promise<SyncResult>`.
SourceRecord fields: sourceSystem='kvnlive', sourceTable, sourceId, sourceCreatedAt, sourceUpdatedAt, receivedAt=sourceCreatedAt, sourceCategory, category, needsCategoryReview, submittedContact, consent, requestedPackage, submittedAmount, originalSubmission. Internal record fields: id, correctedContact={}, workflowStatus='New', partnerStage='Inquiry' for partners else null, followUpDate=null (YYYY-MM-DD Eastern date), archivedAt=null, revision=1.
Use sourceSystem/sourceTable/sourceId as the unique key. submittedAmount is null when only a range, tier, or unverified current price is available. Preserve raw requestedPackage. Do not treat tier prices as paid money.

Category mapping:
- Early-access: category='Early Access' (CRM-only).
- Corporate Sponsorship Activation or Sponsorship Inquiry, or market tier sponsor: Corporate Sponsor.
- Premium Vendor Experience or tier onsite: Vendor.
- Group/Church Partnership, KV Ambassador Church, or tier church: Ministry Partner.
- Other known market tiers member/growth/premier/directory/exposure, Kingdom Market Partnership, Exclusive Category Partnership, Community Impact Partnership, Media Partnership: General Partnership.
- Unknown text: General Partnership plus needsCategoryReview=true; show raw text.
Legacy table maps tier with the same rules. An arbitrary business category such as food is retained separately, not used as relationship category.

- [ ] Add test/crm-records.test.js, test/crm-sync.test.js and test/crm-store.test.js. Pin tests with:
```js
assert.equal(after.crmRecords.length, before.crmRecords.length); // repeated batch
assert.equal(after.crmRecords[0].workflowStatus, 'Contacted'); // owner edit survives sync
assert.equal(normalizeSourceRow('partner_leads', marketRow).category, 'Ministry Partner');
assert.equal(normalizeSourceRow('partner_leads', partnerRow).consent.email, null);
assert.equal(normalizeSourceRow('early_access_leads', sqlDateRow).receivedAt, '2026-10-07T12:00:00.000Z');
```
- [ ] Run `node --test test/crm-records.test.js test/crm-sync.test.js test/crm-store.test.js`; expect fail.
- [ ] Implement additive collections and atomic write via same-directory temporary file + rename in store.js. Preserve permissions and cleanup only the operation's own temp file; never overwrite the whole store from a stale network snapshot.
- [ ] Implement source normalization: SQLite YYYY-MM-DD HH:mm:ss is UTC; ISO dates retain timezone. Reject invalid dates/IDs; preserve unknown consent as null and allowlist originalSubmission fields.
- [ ] Implement sync with 10-second request timeout, 100-row pages, 1 MiB page response limit, and single-flight locking. Complete a source scan in memory, validate unique keys and sourceCount, then synchronously reread/upsert/write. Retry failed scans at 5 minutes, also allow manual refresh. Fetch first-page metadata again and reconcile count; on a mismatch restart once, then retain previous snapshot and report an error. Later full scans capture updates and concurrent inserts; never delete absent local records automatically.
- [ ] Persist per-source state {lastAttemptAt,lastSuccessAt,lastError,sourceCount,importedCount}. Missing configuration => Not connected; last error => Unavailable with retained snapshot; last success older than 15 minutes => Stale; otherwise Connected. Never turn failure into zero.
- [ ] Test a write during delayed fetch, duplicate IDs, early-access row updates under the same ID, repeated nextAfter, timeout, partial pages, count mismatch, and restart persistence. Retain existing unrelated collections byte-equivalent after normalization.
- [ ] Run tests to pass and commit.

### Task 3: Shared filtering, metrics, and exports
**Interfaces:** `parseCrmFilters(input,now): CrmFilters`; `queryCrm(store,filters,{paginate=true}): {rows,total,summary,filters}`; `crmReportCsv(report): string`; `buildDashboardMetrics(orders): {paidRevenue,paidOrders,refundedOrderCount,refundedOrderOriginalAmount}`.
CrmFilters: preset (lead_intake/partnership_pipeline/follow_up), from/to local dates or null, search max 200, category, sourceTable, workflowStatus, partnerStage, followUp (all/overdue/due_today/upcoming/none), archived (exclude/include/only), page positive integer, pageSize 25/50/100. Unknown enums and invalid dates => 400. Sort receivedAt descending then id; follow_up sorts due date then id. Search uses corrected contact where present, otherwise submitted contact.

- [ ] Add test/crm-query.test.js, test/crm-export.test.js, test/dashboard-metrics.test.js. Assert:
```js
assert.equal(dateBounds('2026-03-08','2026-03-08').start, '2026-03-08T05:00:00.000Z');
assert.equal(dateBounds('2026-03-08','2026-03-08').end, '2026-03-09T04:00:00.000Z');
assert.equal(dateBounds('2026-11-01','2026-11-01').end, '2026-11-02T05:00:00.000Z');
assert.equal(queryCrm(store, filters, {paginate:false}).rows.length, 61);
assert.equal(buildDashboardMetrics([{status:'pending',amountTotal:500},{status:'paid',amountTotal:900}]).paidRevenue,900);
```
- [ ] Run `node --test test/crm-query.test.js test/crm-export.test.js test/dashboard-metrics.test.js`; expect fail.
- [ ] Implement dateBounds(from,to) using Intl America/New_York conversion with exact calendar validation. Last 30 Days means today and previous 29 local dates. All Time clears both bounds. Filters use receivedAt except follow_up uses followUpDate. Overdue excludes Closed/archived records and means due date before today; pipeline uses current stage and received date.
- [ ] Implement all queries once; summary/card/report/export consume the same matching rows. Partner totals exclude Early Access. Validate one-based page and preserve full total when a page is empty.
- [ ] Implement report CSV with identical column counts in all rows: record ID, name, organization, email, phone, category, source, receivedAt, status, stage, follow-up, requested package, submitted amount, consent values; include generatedAt/timezone/filter summary/freshness as repeated metadata columns. Quote cells, preserve Unicode/newlines, prefix untrusted formula-leading content (=,+,-,@,tab,CR or leading whitespace before these) with apostrophe. Export full result; attach no-store and dated filename.
- [ ] Implement paid-only overview metric; display refunded-order count/original amount separately, explicitly not actual refunded amount or net revenue. Keep ticket and standalone shop totals distinct. Update current dashboard metric bindings/labels without changing checkout calculations.
- [ ] Verify boundary inclusion/exclusion, invalid February dates, null due dates, case-insensitive search, 61-row export across pages, archived toggles, formula/newline/Unicode payloads, and empty datasets. Run tests and commit.

### Task 4: Owner APIs and audited record updates
**Interfaces:** `registerCrmRoutes(app,{auth,owner,readStore,writeStore,id,sync,now})`.
Routes: GET /api/crm/overview, GET /api/crm/records, GET /api/crm/records/:id, PATCH /api/crm/records/:id, GET /api/crm/reports, GET /api/crm/reports.csv, POST /api/crm/sync.
PATCH accepts {revision, correctedContact?,workflowStatus?,partnerStage?,followUpDate?,archived?,note?}. note is appended, never overwrites history. Reject unknown fields/enums, excessive strings, invalid email/date and stale revision (409). Note max 4000; contact name/organization max 200, email 254, phone 80. Category review corrections may be supplied as categoryOverride from the partner category enum and are audited; retain source category.

- [ ] Add test/crm-routes.test.js following isolated temporary DATA_DIR/session setup in test/admin-auth.test.js. Assert 401 unsigned, 403 non-owner/cross-origin mutations, 404 absent ID, 409 stale revision, 400 invalid patch.
- [ ] Run route tests to fail.
- [ ] Implement routes using Tasks 2–3, same-origin verification for writes, no-store responses and limits. Never allow an owner cookie route to accept the integration secret instead of session authentication.
- [ ] Return detail {record,activities,relatedPurchases}. Match purchases by existing verified ID if available or trimmed/lowercased nonempty email; label email matches and list separate orders/shopOrders with provenance. Never infer a partner payment from an email match.
- [ ] Append crmActivities and auditLogs for edits/notes/archive/restore/export with actor/time/entity/action/changed field names, not full contact payloads. Require note OR field changes; increment revision once per successful write. Source sync preserves internal changes.
- [ ] Register periodic sync once in server lifecycle when configuration exists, plus manual sync; clean timer on shutdown. Return current sync state while a flight is already running.
- [ ] Test edit reload, archive/restore, unknown category review, source edits during sync, blank-email no-match, organizer isolation, audit metadata privacy, and export authorization. Run tests to pass and commit.

### Task 5: Working dashboard flow
**Interfaces:** public/crm-dashboard.js exposes `window.KVNCrm.init({api,showPanel,user})` and `window.KVNCrm.open(view,filters)`. Use the existing authenticated api wrapper and tab navigation. Module owns CRM state only.
Modify only served public files; root historical dashboard copies are not the target.

- [ ] Add test/crm-dashboard.test.js for query serialization and a browser flow test using the available browser test environment; first assert missing controls/endpoints fail.
- [ ] Replace the two placeholder panels with searchable, paginated tables and visible filters. Add a Reports navigation entry and report preset selector. Use black/white/red styling, compact headings, readable labels, loading/error/empty states and accessible buttons.
- [ ] Add overview cards for intake records, partnership inquiries, and current overdue backlog. Card clicks call open(view,filters) with the exact dates/categories used to compute totals; overdue explicitly clears received-date bounds and selects overdue follow-ups.
- [ ] Add keyboard-accessible detail dialog, focus return, submitted-versus-corrected contact display, source/consent values, notes, workflow/stage, follow-up, archive/restore, and labeled related purchases. Show revision conflicts as a reload instruction preserving unsaved inputs.
- [ ] Add Run Report and Export CSV; display timezone, generated time, filters, count, and freshness. Download all matching rows using the report query. Expose Refresh Data and last successful sync for each source.
- [ ] Reject stale async responses when filters change quickly; clear private CRM state on logout and hide module for non-owner users. Render contact values via textContent or established escaping; no raw source HTML.
- [ ] Verify at desktop and mobile widths: card → list → record → save → reload; search/filter/pagination; report and download count parity; keyboard close/focus; disconnected/error/stale/empty sources; HTML payload inert; logout removes records. Use isolated fixture data, never production demo inserts.
- [ ] Run focused tests plus `npm run check`; commit.

### Task 6: Connect, reconcile, and release
**Files:** env.example, source .env.example/env.d.ts, deployment notes under docs; no secret values in git.
**Interfaces:** CRM_SOURCE_URL='https://kvnlive.com'; independent CRM_SYNC_SECRET shared server-side between the two services. Keep existing Disciple secret unchanged.

- [ ] Run Command Center `npm test` and `npm run check`; source `npm run test:unit` and existing build flow. Record baseline failures and fix task-caused regressions before release.
- [ ] Inspect current Render service configuration using its existing service identity; verify persistent DATA_DIR and one writer instance. Create a recoverable private backup without exposing contacts or credentials. If persistence is absent, resolve it before code publication.
- [ ] Review branch diff against approved spec; check owner-only access and absence of test contacts/secrets. Use the execution method's required whole-branch review.
- [ ] Configure one randomly generated dedicated sync secret through supported secret configuration on both services, redacting output; never put it in shell arguments, browser JS or files committed to git.
- [ ] Publish the source feed through the existing Sites project and verify terminal deployment success. Deploy the tested Command Center changes to the existing Render service using its established workflow.
- [ ] Run authenticated initial sync. Compare distinct source-table/ID sets and per-source counts with all pages of the live source read; no duplicate IDs or unexplained missing rows. Verify a real existing record is visible and the CSV matches the same filter.
- [ ] Verify production reads, authentication, checkout page access and source forms without placing orders or sending outreach. Reuse isolated edit/restart tests; do not alter real customer records merely for QA.
- [ ] Report the working dashboard URL, features verified, and any genuine limitation. If rollback is necessary, revert code only and retain new CRM records and newer transaction data; never restore an old complete transaction snapshot over newer purchases.

## Self-review result
Every spec section maps to Tasks 1–6. Source ownership and consent gaps are explicit; original forms remain authoritative. Integration, queries, UI and exports share the same identifiers and filter contract. No counts or source payments are inferred. Archive/restore, freshness, conflicts, authorization, DST, export safety and transaction preservation have behavioral checks. Pull-based retry is the selected bridge mechanism; no outbound email or new user-facing automation is created.

## Execution handoff
Review this plan, then select native execution (same agent implements tasks in order with final independent review) or subagent-driven execution (fresh implementer/review cycles per task). Native execution is recommended because source/feed, store/query and UI interfaces are tightly connected and this avoids repeated setup context. Production release follows successful verification.
