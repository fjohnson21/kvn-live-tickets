# Marketing Broadcast release

Production campaign releases use native Resend Broadcasts when `MARKETING_CAMPAIGN_TRANSPORT=broadcast`. Transactional receipts, account emails, owner tests and checkout reminders retain their individual email API.

`RESEND_BROADCAST_SEGMENTS` is a JSON map from KV Tix list IDs to existing Resend segment IDs. Every selected list must map to the same segment. Unconfigured or mixed segments fail closed; there is no individual-email fallback. The preview shows the native segment name and subscribed recipient count. KV Tix contact totals are local CRM counts and need not equal the existing provider segment membership. This release does not add or resubscribe CRM contacts to Resend or create/delete segments.

Provider unsubscribes are excluded. Local archived, unsubscribed, suppressed and known bounce/complaint contacts are excluded; their memberships are removed from the selected segment before release, without deleting the contact or altering other segment memberships. Provider suppression checks also apply when Resend delivers the Broadcast.

A preview token binds the draft revision, native segment audience and mailing address. A durable lock is stored before creation and release. The Broadcast ID, provider status and results URL are persisted. An uncertain response requires review in Resend and is never automatically retried. Test email sending remains separate and is labeled TEST.

Dashboard refresh reconciles linked releases with Resend. Before creating a Broadcast, KV Tix also looks for an already released Broadcast in the same segment with the same subject and CTA. It links that provider ID and blocks a second dashboard release. This intentionally favors duplicate prevention over sending another message with an identical subject/CTA. A genuinely new campaign should have a distinct subject. Operators releasing from chat must first review existing broadcasts and reuse the campaign ID; do not create and send a second copy of a dashboard campaign.

Native delivery/open/click results are available through the campaign's Resend Broadcast / Results link. The old individual-email engagement report is not shown for native Broadcasts, avoiding misleading zero metrics.

There is no automatic migration or continuation of an old individual campaign when Broadcast mode is enabled. Old partially processed campaigns require explicit operational review. Production order and ticket records are unchanged.
