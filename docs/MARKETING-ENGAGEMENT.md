# Campaign engagement reporting

## What this adds

Owner-only campaign totals and recipient-level evidence at **Marketing → Engagement**. Filters cover delivered, opened, clicked, bounced, complained, failed, suppressed, delayed and unconfirmed delivery. Recipient results are paginated in groups of 50; each shows counts, first/last times, and its most recent 50 events. Aggregate counts are unique recipients, not webhook deliveries. Dates are UTC.

Existing campaign send outcomes and message IDs are unchanged. `accepted` means the send API accepted a message; `email.sent` also establishes provider acceptance. `email.delivered` confirms delivery to the recipient's mail server, not inbox placement or reading. Opens and clicks never imply delivery. Negative outcomes remain visible when earlier delivery events arrive later.

Delivery rate = explicitly delivered members of the accepted cohort / accepted cohort. Open and click rates = delivered recipients with the corresponding event / confirmed delivered recipients. A missing denominator produces “Unavailable.” These are observed cohorts, not guaranteed complete historical results. Open rates are estimates: Apple Mail privacy prefetching can inflate them and image blocking can hide them. Link scanners can trigger clicks. “No event recorded” never means “unread.”

## Persistence and integrity

`DATA_DIR/marketing-engagement.ndjson` is a separate, permission-restricted append journal (0600). The receiver never writes `store.json`, campaigns, contact permissions, unsubscribe tokens, lists, ticket/orders, agreement records or customer details. Existing send operations retain their normal store writes. No historical migration or campaign send is performed.

Svix checks signatures and timestamp tolerance over the raw body before JSON processing. The webhook is registered before Express's JSON parser and limits payloads to 256 KiB. Supported events are normalized, synchronously appended and fsynced **before** returning 200. Storage failure returns 503 for retry. Unknown event types are acknowledged and ignored. Malformed signed events return 400; conflicting reuse of a known event ID returns 409.

The signed `svix-id` is the durable deduplication key. Indexes rebuild on restart. An incomplete trailing append is truncated on startup because it was not acknowledged; corruption in complete records stops startup rather than discarding history. Back up the journal alongside the main store and preserve it on rollback. Do not truncate or rotate it without a migration that retains deduplication and suppression evidence.

This implementation assumes **one Node process on one service instance**, matching the application's file-store architecture. Do not use clustering, multiple instances, or multiple writers. Move to a shared transactional database before scaling. The append path avoids rewriting all history per webhook; retained events are indexed in memory. Monitor disk and memory usage. There is no automatic retention deletion.

Only event ID, Resend email ID, event type, event/receipt timestamps and (for clicks) URL origin are retained. No email body, recipient address, IP, user agent, URL query, fragment, credentials or token-bearing path is added to the journal. The owner report joins recipient addresses from existing campaign records. Click history deliberately shows destination domain, not full links.

## Correlation and sending safety

Webhook `data.email_id` matches the existing recipient `messageId` returned by Resend's send API. This is the Resend email ID, **not** the SMTP `Message-ID` header. There is no email-address or subject fallback. Unmatched verified events remain indexed so an event received before the send result is saved becomes visible when its message ID appears. Events from agreements or other emails do not become campaign records.

A correlated bounce, complaint or provider suppression adds a derived sending block for that address. This does not overwrite consent, unsubscribe evidence or list membership. Audience previews and every pending send recheck the block; recovery sends also enforce it. New recovery sends retain an immutable recipient address alongside their send result, so later cart edits cannot redirect a block. Historical recovery results without that recipient snapshot cannot safely provide automatic address suppression; reconcile them with provider records instead of guessing from the current cart address. An in-flight provider call cannot be recalled. Imports or setting permission to subscribed cannot bypass the derived block. Delivery/open/click events never clear it. Delivery-delay events alone do not block an address. Contacts show “Provider block” separately from their recorded permission.

Uncertain historical sends without a saved Resend email ID cannot be correlated automatically. Review provider logs; do not resend to obtain tracking. Recipient history remains available even without engagement events. This change does not poll or fabricate historical events, and cannot recover opens/clicks never collected by Resend.

## Deployment and provider setup

Inspection on 2026-10-10 found no Resend webhook endpoints and open/click tracking disabled on the sending domain. This PR does not change those production settings or send messages. Recent inspected provider records were agreement emails, which do not establish marketing campaign volume.

1. Review/merge the PR through the existing GitHub test workflow. Back up persistent data, deploy the reviewed commit to the existing service, and keep the journal under its persistent `DATA_DIR`. Do not create a replacement service or copy repository seed data over production.
2. Create a Resend webhook for `https://<existing-service-host>/api/webhooks/resend/marketing`. Subscribe to `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`, `email.failed`, and `email.suppressed`.
3. Store that endpoint's signing secret in **RESEND_MARKETING_WEBHOOK_SECRET** on the service. Do not commit or expose it in the browser. Redeploy/restart as required by the hosting configuration. Until configured, the receiver returns 503.
4. Enable open and click tracking on the sending domain in Resend. These are domain-wide settings affecting other emails sent from that domain, including agreements. The dashboard reports local secret presence and first/latest verified receipt, not an independently verified provider configuration.
5. Use Resend's webhook test facility with synthetic, uncorrelated IDs to verify delivery attempts receive 200; replay the same event to verify duplicate protection. Invalid signatures must return 400. No campaign launch is necessary.
6. Inspect Marketing → Engagement for actual campaigns and verify IDs against Resend. Events begin with the configured stream; older data may be incomplete. Where provider-retained historical events exist, a deliberate replay can be considered separately. Do not infer unavailable history.

If the journal is corrupt, restore/repair it before restarting. If a write fails, Resend retries non-2xx responses. Never acknowledge an event merely to silence retries. Rolling back code also removes the new derived sending blocks: pause marketing first, retain both the journal and existing unsubscribe records, and reconcile suppression evidence before resuming.

## Verification

Automated tests use synthetic stores and fake senders only. They exercise raw-body signatures, stale/future timestamps, duplicate and conflicting IDs, durable restart recovery, persistence failure, event ordering, late correlation, permission preservation, owner authorization, pagination, UI escaping, logout races and phone-sized report navigation. No real emails are sent by tests.

## References

- https://resend.com/docs/webhooks/verify-webhooks-requests
- https://github.com/resend/resend-openapi/blob/main/resend.yaml
- https://resend.com/blog/open-and-click-tracking
- https://www.apple.com/legal/privacy/data/en/mail-privacy-protection/
