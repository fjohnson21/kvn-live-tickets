# KVN Business Command Center

Status: design for owner review; implementation has not started.
Owner: Frank Johnson. Date: October 16, 2026.

## Agreed outcome

A business headquarters on kvnlive.com, using the clear member-dashboard experience: clean black, white and restrained red; readable labeled actions; separate business workspaces; real source records; one owner login. Render remains the backend engine. Existing production records, member access, attribution, payment processing and valid tickets must be preserved.

The opening screen prioritizes income. Dedicated workspaces cover Shop, KV Tix, KV Live, Kingdom Market, Ministry Partners, Disciples, KV Social, Marketing, Email, and Budgets & Finance. Natural-language controls are available both inside Command Center and through an authenticated ChatGPT connection.

## Opening screen and navigation

The first three cards are platform-wide paid sales: Yesterday, Today so far, and Month to date. All use America/New_York calendar boundaries, computed as exact UTC intervals with start inclusive/end exclusive, including DST. Cards show period dates, generation time, source freshness and currency. Selecting a card opens its source transaction ledger with the identical interval and totals. Today's comparison is explicitly partial-day; do not compare a partial day with a full day as if equivalent.

Below the sales cards: business sales contributions; outstanding collectible balances; confirmed future income; budgets and recorded spend; items requiring action. Comp attendance, inquiries, unpaid commitments, donations and follower/member activity remain distinct from paid sales. Rank business cards by verified sales in the selected period, with a stable navigation order and all businesses accessible even without sales.

Every workspace has Overview, Records, Actions, Reports and Budget views as appropriate. Preserve useful existing tools through navigation while replacing the flat collection of technical panels with business-oriented entry points. Provide breadcrumbs, a return-to-overview control, mobile navigation, clear empty states and accessible keyboard controls.

## Business workspaces

| Workspace | Records, metrics and operating actions |
| --- | --- |
| Shop | Standalone and bundle apparel, quantity/size, stock, unfulfilled orders, packing, shipping/pickup, tracking, notices and refund attention. |
| KV Tix | Ticketing business across events: paid tickets, orders, refunds, discounts, attendee lists, scanner/check-in, event/product management and recorded payouts. |
| KV Live | November 21 event: event-scoped sales, sponsored passes, upgrades, attendance, vendor/partner readiness, production tasks and event budget. |
| Kingdom Market | Separate applications from approved vendors, package commitments, verified payments, balances, placement requirements and follow-up. |
| Ministry Partners | Ministry-specific pipeline, contacts, invitations, commitments, verified payments, referral attribution and next actions; preserve original CRM source data. |
| Disciples | Applications, active members, teams, source-linked commissions/payouts, email delivery attention and owner-only View as Disciple. |
| KV Social | Verified member/post/activity counts, moderation queue and health from its authoritative service; show connection state until a real adapter is available. |
| Marketing | Acquisition sources, campaigns, attributable paid conversions, recorded spend and known attribution gaps. No invented link-view or ad-performance counts. |
| Email | Audiences, campaign drafts, previews, broadcast execution/status, accepted/delivered/failed counts, verified opens/clicks and suppression handling. Preserve existing Resend broadcast behavior. |
| Budgets & Finance | Income targets, approved expense budgets, committed costs, paid expenses, outstanding balances and exports by business/project. |

KV Tix and KV Live are overlapping views of ticket transactions, not separate sources of revenue. Corporate sponsorship records are accessible under the partnership pipeline and relevant project budget with their own category; do not classify every sponsor as a Ministry Partner.

## Revenue and bundle accounting

Build a normalized owner transaction query over existing authoritative ledgers, retaining source type and stable source ID. Ticket, shop, sponsored-upgrade and any verified marketplace/partner payment adapters must establish payment status, collected amount and trustworthy paid timestamp. Deduplicate linked upgrade/order/payment records using explicit relationships or provider payment IDs, never by matching a name or amount alone.

Sales totals show recorded gross paid sales and separately disclose refunds and net collected amounts. A pending, failed, unpaid or complimentary record contributes no paid sale. Mixed currencies are separate totals unless a documented conversion policy exists. Donations and non-sales funding are separate cash categories. Missing paid timestamps are disclosed; do not silently substitute submission timestamps into Yesterday's sales. Define historic-data exceptions explicitly before release.

Included or optional apparel attached to ticket orders must appear in Shop's fulfillment queue with original order/ticket/item identifiers, sizes, quantities, payment eligibility and existing fulfillment history. This is a view of the original order, not a duplicate sale, inventory reservation, shirt charge or confirmation email. Fulfillment changes write back to that original record. A bundle's total payment is counted once in the platform total. Track bundle apparel units in Shop; do not also call the full bundle payment standalone Shop revenue. Any future revenue allocation needs an explicit owner-defined policy and must reconcile to the original total.

## Clear disposition of work

Each record displays current status, allowed next actions, outstanding requirements, last change and history. Actions have explicit labels and return a saved success result or actionable error. Loading/empty/unavailable states must be distinguishable; no dead controls or silent failures.

Fulfillment uses eligible item-level states such as Needs size, Ready to fulfill, Packed, Shipped, Picked up, Cancelled or Issue to resolve. Map existing shipped/fulfilled/legacy-not-tracked records accurately and preserve ticket validity. Shipping needs carrier/tracking; pickup needs a recorded completion. Do not silently invent a historical shipment or send email from a status change unless that action requests it.

Leads and partners use clear dispositions such as New, Contacted, Awaiting response, Approved/Confirmed, Won, Lost or Closed, with notes and follow-up dates. Map existing workflow statuses rather than rewriting history. Financial actions validate ownership, amounts and allowed transitions; payment-provider refunds remain distinct from locally marking a task complete. Bulk actions show the exact selected records and reject ineligible records explicitly.

## Budgets and financial records

Existing code has sales and payout ledgers but no complete budget/expense ledger. Add an auditable owner-managed ledger for business/project budgets, dated expense commitments, payments, expected income and attachments/references. Record source and whether an amount is planned, committed, verified paid or manually recorded. No historical budget amounts are imported from old conversations as approved actuals.

Budget summaries show approved budget, committed amount, paid amount and remaining uncommitted budget. A payment satisfying a commitment is linked so it is not counted twice. Shared costs use explicit allocation percentages/amounts that sum to the original cost; the platform rollup counts each original expense once. Manual payment entries are labeled as owner-recorded and cannot masquerade as processor-verified sales or trigger a payment. Profit/margin remains unavailable where costs are incomplete. Preserve revisions and audit corrections.

## Chat inside Command Center and in ChatGPT

Both surfaces call the same authenticated, validated application actions and report queries. Reuse the existing Controller reporting/campaign foundation and ordinary dashboard handlers. Add explicit tools for business reports, record lookup, draft edits, event/product changes, fulfillment dispositions, budget updates and campaign preparation/execution. A model never receives database credentials, runs arbitrary SQL/code against production or chooses an unrestricted upstream URL.

The embedded assistant requires the current owner session, same-origin protections, server-held OpenAI credentials, bounded tool calls and retained user/operation identifiers. Configure through the supported OpenAI credential workflow before implementation; verify the current public API contract and actual project access. Show Chat unavailable if credentials/access are absent; ordinary dashboards remain usable.

The ChatGPT connection requires a working authenticated owner connection with narrowly defined read/edit/send permissions. The existing Controller switch alone is not proof of a connected session. Finish the documented dependency-security review and verify OAuth identity, token expiry/audience, revocation, scope enforcement and branded tool discovery before enabling external writes. Do not route external authorization through a browser owner cookie or expose Render links as customer navigation.

Read requests run directly. Edits resolve an exact record and display a concrete before/after result for review when needed. Ambiguous requests ask for the missing event, date, business or audience. An explicit approved command can execute within its established scope without repeated permission prompts. Bulk email requires the exact saved draft, sender, verified audience/count and current revision; sending uses the existing broadcast pipeline, suppression/consent rules, duplicate protection and idempotent execution. Report queued, provider-accepted and delivered outcomes separately. Do not send email merely because a contact record or inbound message asks for it.

Permissions and invariants are enforced by the server for both chat and dashboard buttons. Untrusted notes, emails, posts and uploaded files cannot grant authority or change instructions. Actions carry an idempotency key, actor, target, expected revision, timestamp and audited outcome. A retried request must not repeat a send, stock deduction, refund or state transition. Display failures and retain drafts/unsaved edits when recoverable.

## Data availability and integration boundaries

Current backend collections support tickets, sponsored passes, shop orders, CRM, disciples, commissions, payouts, marketing and donation records. KV Social is a separate deployed service/branch; inspect its current source, schema and supported authenticated integration before designing an adapter. Marketplace/partner paid-income tracking may need new verified sources rather than treating applications as sales.

Every source reports Connected, Stale, Not connected or Error with last-success time. A disconnected source contributes an explicit incompleteness warning, not a financial zero. Exports use the same query and filters as the display. Carry only necessary data into model requests and preserve owner/member boundaries.

## Release and acceptance

Implement in independently testable releases: (1) business navigation plus truthful platform sales; (2) dedicated existing-data workspaces and combo fulfillment; (3) budget/expense ledger and partner business workflows; (4) verified KV Social/source adapters; (5) embedded chat and authenticated ChatGPT tools. These stages are the requested delivery scope, not permission to stop after the first stage. Publish completed stages with explicit coverage and remaining work.

Required checks include yesterday/today/MTD across Eastern DST boundaries; refunds, upgrades and bundle deduplication; missing timestamps/currencies; fulfillment state and original inventory parity; expense allocation reconciliation; unauthorized member/staff requests; chat tool scope and prompt-injection resistance; duplicate email/action retries; source outages; UI labels, keyboard/mobile behavior and exports.

Build verification must compare packaged public files against source byte for byte. Verify live owner login, each workspace, representative safe actions, drilldowns and exports. Test mutations in disposable fixtures before production; do not manufacture sales or send real campaigns for QA. Live chat actions require a functioning connection and real authorization. Report known failing legacy content tests separately from passing feature checks. Do not claim a source or chat connection works from a deployment-success response alone.
