# KVN Command Center: CRM, Kingdom Market, and Reports
Date: October 7, 2026
Status: Written design for owner review; implementation has not started.

## Intended outcome and approved scope
Frank needs a working operating dashboard: see a bird's-eye view, click into actual records, manage relationships, and run reports. The October 7 in-chat scope was approved: connect Leads/CRM and Partners/Kingdom Market, surface clickable totals and follow-up alerts, and provide date/category filters plus spreadsheet-compatible exports. Preserve the existing black/white/red interface and owner login.

## Verified starting point
Repository: fjohnson21/kvn-live-tickets, main inspected October 7.
The served dashboard uses public/dashboard.html and public/dashboard.js. server.js exposes ticket/order, apparel, Disciple, analytics, audit, and CSV endpoints. store.js persists JSON with no CRM or partner collections. The current dashboard gross calculation sums all order statuses, so it must not be relabeled as paid revenue.
The separate Kingdom Vibe Live Sites project is appgprj_6a970cb9c5808191b44c487542772384, published at https://kvnlive.com. Its current intake schema and delivery mechanism still require source inspection during implementation planning. No live lead count is asserted by this document.

## Architecture decision
Extend the existing Command Center and connect the existing website intake through an authenticated, retryable server-to-server bridge. Preserve original submissions in their source; maintain a reporting copy and local relationship-management fields in the Command Center.
Alternatives considered: a separate dashboard would split the workflow; a platform-wide database migration would expand this release substantially. Use additive collections in the current store for this scoped release. All new mutations must read the latest store immediately before a synchronous write; do not retain a mutable store snapshot across network awaits. Atomic replacement protects file integrity. Deployment must verify a persistent data directory and a single writer instance; otherwise release is blocked until durable storage is configured.

## Screens and workflow
### Overview
Default to the last 30 calendar days in America/New_York; offer Today, Last 7 Days, Last 30 Days, All Time, and Custom. Cards show new lead submissions, partnership inquiries, and overdue follow-ups. Lead and inquiry counts are intake records received within the date range, not unique people. Overdue follow-ups are an explicitly labeled current backlog.
Clicking a card opens its filtered table. Existing ticket, apparel, and Disciple entry points remain available. Any displayed revenue is explicitly labeled by source and payment basis; failed, unpaid, and canceled orders are excluded from paid revenue. Do not combine apparel-inclusive tickets and standalone apparel by counting a bundle twice. Refunds are shown separately unless a verified net-refund amount supports a net metric.
Every source displays connection state and last successful sync time. A missing connection is Not connected, an error is Unavailable, and a previously successful stale snapshot retains its timestamp with a warning. Neither failure becomes a fabricated zero.

### Leads / CRM
Search name, organization, email, and phone. Filter by date, category, source, status, and follow-up due state. Use a paginated table with name, organization, category, received date, status, and next follow-up.
Click a row to open contact details, submitted fields, consent information as captured, source identity, notes, status history, and follow-up date. Allow owner edits to contact corrections, internal notes, workflow status, and follow-up date. Original submitted values remain distinguishable.
Statuses: New, Contacted, Follow-up, Qualified, Closed. Allow archive and restore; archived rows are excluded by default and available through an explicit filter. No permanent deletion in this release.
Show related purchases only when supported by a verified identifier or exact normalized email match; label email-derived matches and never treat them as proof of identity.

### Partners / Kingdom Market
A category-filtered view of the same underlying intake records, rather than duplicated contacts. Categories are Vendor, Corporate Sponsor, Ministry Partner, and General Partnership. Preserve the original source category; unknown mappings require review.
Show requested package and submitted amount when available. Keep requested, committed, and paid amounts separate. Never infer payment from an application, approval, or a manually selected relationship status.
Owner-managed stages: Inquiry, Contacted, Proposal Sent, Confirmed, Declined. CRM follow-up fields remain shared with the associated record. Confirmation does not send an email or charge a payment method.

### Reports
Presets: Lead Intake, Partnership Pipeline, and Follow-up Queue.
A report uses the same filters and query logic as its table and overview card. Show generated time, timezone, source freshness, filter summary, record count, and records. Export UTF-8 CSV readable by Excel and Google Sheets. Export all matching rows, not just the current page. Apply CSV quoting and spreadsheet-formula neutralization to untrusted cells.
Date ranges are inclusive local dates implemented as start-inclusive/end-exclusive instants. Reject invalid ranges. Reporting uses received date for intake, current stage for pipeline, and due date/current completion state for follow-ups; each preset labels its basis.
No automated report email or scheduled distribution is included.

## Data and integration contract
Add crmRecords, crmActivities, and crmSyncState without replacing existing collections.
Each record has a local ID, source system, immutable source record ID, source created/updated timestamps, received timestamp, raw submitted category, mapped category, submitted contact fields, consent fields, and a restricted original-submission payload. Internal fields include corrected contact values, workflow status, partner stage, notes/activity references, follow-up date, archive state, and revision.
The unique integration key is source system plus source record ID. Retries upsert the same record. Similar email addresses flag possible related records; they do not merge submissions automatically. Sync updates source-owned fields while preserving internal notes and stages.
Bridge endpoints accept allowlisted fields, bounded payload sizes, authenticated requests, and schema versions. Credentials remain server-side. Use constant-time secret verification and replay protection or idempotent signed batches. Reject malformed records with actionable sync errors.
Initial backfill and subsequent delivery use the same normalization and idempotency path. Confirm actual source tables, IDs, pagination, category mapping, and retry capability before writing a bridge. Backfill must reconcile source IDs/counts; a successful HTTP response alone is insufficient.
Failure of the bridge does not prevent original website submissions from being saved. Retry delivery independently. Never expose a public endpoint listing contact data.

## Authorization and audit
Owner access only for new CRM, partnership, and report endpoints in this release; retain existing organizer/staff permissions elsewhere. Enforce authorization on the server for detail reads, searches, exports, and writes. Use existing session protections and reject cross-origin mutations.
Record actor, time, entity, action, and changed field names for edits, stage changes, archives, restores, and exports. Avoid copying full contact payloads into audit logs.
Use revision checks to reject conflicting edits with a reload message rather than silently overwriting another edit. Render untrusted values as text.

## Implementation boundaries
Changes belong in the served public dashboard, server routes, store initialization, and focused CRM/query/export/bridge modules. Inspect applicable repository instructions first. Source-side bridge changes belong in the existing Kingdom Vibe Live project.
Preserve production orders, tickets, payments, existing applications, consent evidence, affiliate attribution, and commission records. Do not seed production with demo contacts or test purchases.
A broad PostgreSQL migration, live geographic map, ad impressions, bulk outreach, automated payouts, and a full finance ledger remain outside this release.

## Acceptance and verification
1. A real existing intake submission is available in the authenticated Command Center after reconciled backfill.
2. Re-delivering a source record does not duplicate it or erase internal edits.
3. Overview count, filtered table count, and CSV count match for identical filters.
4. Clicking a total retains its filters; clicking a row opens the correct record.
5. Notes, follow-up dates, status/stage, archive, and restore survive restart.
6. Date boundaries are verified around Eastern midnight and daylight-saving transitions.
7. Disconnected, stale, empty, and failed sources render distinct honest states.
8. Unauthorized users cannot read/export contacts or mutate records.
9. CSV formula payloads and HTML payloads remain inert.
10. Paid revenue excludes unpaid orders; refund treatment is labeled and reconciled.
11. Existing checkout, Disciple, apparel, and authentication tests continue to pass.
12. Test with an isolated store, verify desktop/mobile flows, then reconcile production reads without altering production transactions.

## Release and rollback
Prepare a reviewable branch and change summary. Back up the persistent store before deploying additive initialization. Verify source ingestion, dashboard retrieval, record updates, and export end-to-end. Keep original website intake functional throughout. Rollback code independently of retained CRM data; do not roll back the entire transaction store and lose newer purchases.
The implementation is not complete while the intake bridge is unconnected. If a source dependency blocks it, report that dependency explicitly instead of presenting a placeholder as a finished tool.
