# KVN branded access and unified reporting
Date: 2026-10-16
Status: Design for owner review; implementation not started.

## Approved intent
Render remains the existing backend engine. KVN-controlled browser pages, logins, outgoing links, email calls to action and downloads use https://kvnlive.com. The owner explicitly requires that Render never be exposed in the user experience. Keep production records, referral attribution, ticket validity and existing payment processing intact.

## Existing evidence
The live Command Center has separate CRM, orders, disciple and sponsored-pass screens. The 48-hour report was manually assembled from these views. CRM source status showed early access, partnerships and legacy market connected. The disciple table displayed Render referral URLs. Existing member portal documentation specifies /member and independent member authorization. Source lib/crm-sync.js imports three website intake sources and marks sync older than 15 minutes stale. Existing commerce URL generation already supports several kvnlive.com destinations. Existing rollout documentation is historical evidence only, not proof of current deployment state.

## Delivery boundaries
Use the existing website Site appgprj_6a970cb9c5808191b44c487542772384 and existing backend repository/service. No replacement platform, new payment engine, database reset, or automatic member enrollment. Inventory all existing KVN product integrations; mark unsupported sources unavailable rather than implying complete sync. KV Social uses its existing membership rules; this work does not silently merge different credential stores.

## Branded access
- /member: existing member login, activation, recovery and personal disciple activity.
- /command-center: branded owner login and administration.
- /command-center/sponsored-passes: owner-only sponsored operations.
- /affiliate/{handle}: branded referral entry retaining verified attribution across supported KVN products.
- Preserve /promo, passes, shop, give and existing agreement routes.
The website server proxies allowlisted backend operations; browsers never navigate to or directly fetch the Render origin. Keep backend origin only in server configuration. Do not use a cross-origin iframe as a branding solution. Proxy only required headers, cookies, methods and paths; owner and member sessions remain distinct. Private responses are no-store. Preserve CSRF protection, rate limiting, HttpOnly Secure cookies and owner-only controls. Never proxy arbitrary destinations.

## Brand treatment
Reuse actual website crown assets, fonts, black/white palette and restrained red. Header label Member Login opens /member. Account setup, reset, errors, signed-out states, mobile navigation and dashboard shells follow the same branding. Owner login remains clearly labeled Command Center. Do not expose infrastructure errors or provider hostnames in customer-facing error text.

## Outgoing URL contract
One explicit canonical public origin, never inferred from the incoming backend Host header. Cover disciple welcome/application emails, activation/reset links, copy-link buttons, referral displays, ticket/pass/receipt links, agreements, QR destinations, CSV URL fields, and return/cancel links. Verify each branded destination exists before switching its generator. Preserve path/query/referral and token semantics without logging secrets. Old shared Render entry links should safely redirect human page requests to equivalent branded routes only after destinations work. Do not redirect webhooks or server APIs indiscriminately. Backend authentication remains required even when its hostname is known. Third-party payment-provider pages retain their legitimate provider domain; no KVN-controlled link exposes Render.

## Unified Command Center activity
Add one report backed by existing authoritative product records, not a copied chat report. Categories: CRM inquiries, paid ticket orders, comp claims, pending/expired verifications, disciple applications, apparel orders, vendor/ministry/sponsor applications, donations, commissions and payouts. Unsupported integrations display unavailable with explanation.
Use stable source plus record ID for idempotency. Keep one person profile where identity matching is verified, with separate activity records. Do not automatically merge by name. Comp orders and sponsored claims representing the same event must not count twice.
Provide last 48 hours, today, seven days and custom timestamps. Use an explicit America/New_York display and exact UTC interval boundaries; start inclusive, end exclusive. Report creation/submission and claim timestamps by their meaning. Never treat an undated pending request as confirmed in-window.
Display source status, last successful sync, generated-at time, interval, source count and reconciliation failures. Initial target: newly available source activity visible within five minutes while services are healthy; report staleness honestly on failures. Refresh uses existing synchronization and reconciliation. Exports and summary cards use the same query and definitions.
Keep paid revenue, comp impact, pending requests, refunds, upgrades and commissions separate. Member dashboards consume the same underlying ledgers but expose only the authenticated disciple's authorized activity.

## Rollout and verification
1. Inventory deployed website/backend routes, URL generators, product sources, cookies and reporting semantics.
2. Add compatibility backend endpoints and canonical URL helpers with existing routes still working.
3. Add allowlisted branded website routes and branded login shells.
4. Add unified report/query/export and source reconciliation; migrate no financial records.
5. Switch outgoing generators only after destination checks; do not bulk email members without authorization.
6. Verify desktop/mobile navigation, login/logout/recovery, owner/member isolation, CSRF, stale sync handling, exact 48-hour boundaries, duplicate claims/orders, referrals through comp-to-upgrade and supported product purchases.
7. Reconcile product totals and sampled IDs between owner report and member view. Test email templates without sending production messages. Scan rendered links, redirects, browser requests and export URL fields for Render exposure.
8. Deploy compatible backend first, then website; verify actual production branded routes and report parity. Roll back UI/routing independently while preserving records and in-flight checkout recovery.

## Acceptance
No Render URL appears in newly generated KVN-controlled links, browser-facing API calls or ordinary navigation. Owner and member logins work on kvnlive.com with existing authorization boundaries. Unified activity and exports reconcile to supported source records for the same interval. Five-minute healthy-source freshness is measured, not assumed. Existing passes and referrals continue to work. Any unavailable integration or unverified behavior is explicitly reported.
