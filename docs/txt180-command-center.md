# TXT180 Command Center

The existing owner-only Text Messages workspace supports TXT180 through the reseller API at `https://secure.txtpkg.com/api.php`. Customer account selection remains server-side. No reseller provisioning or billing actions are implemented.

Owners can add a contact with permission attestation and source, create a group, assign existing contacts to groups, select groups or Added contacts, save drafts, preview exact recipients and text, release the reviewed campaign, pause future sends, and inspect/export attempt history. Contacts and groups are stored on the existing persistent disk and tied to the provider account/keyword/sender. Existing business audiences without a registered TXT180 contact are excluded with an actionable reason.

Configuration: `SMS_PROVIDER=txt180`, `TXT180_API_KEY` (secret), `TXT180_ACCOUNT_ID`, `TXT180_SHORT_CODE` (ten digits, no +1), `TXT180_KEYWORD`, `TXT180_SMS_SENDING_ENABLED=true`. Existing Twilio variables remain untouched. Configure via Render environment merging; never commit a real key. The startup log confirms a real read-only customer API check, without printing contact details or credentials.

Phone numbers for contacts use E.164. Provider opt-outs are fetched before additions and before queued dispatch (30-second freshness). A failed refresh invalidates freshness. Malformed or incomplete opt-out pages block dispatch. Provider STOP cannot be overridden by ordinary contact entry. Existing Twilio public START signup remains unavailable in TXT180 mode; owner contact entry is the supported enrollment flow in this release.

All mutations require owner authentication, a trusted JSON origin, and an idempotency request ID. Contact/group requests persist intent before provider mutation. Unknown outcomes are retained for manual review, not automatically replayed. Messages retain the existing durable queue, preview expiry, audience deduplication, pause checks, and daily/recipient limits. XML is escaped, validated and parsed with DTD/entity declarations rejected; endpoint is fixed and redirects prohibited.

TXT180 `<ok/>` means accepted, not delivered. No delivery receipt or read receipt is claimed. Individual recipients are submitted from the immutable reviewed snapshot rather than sending to a mutable provider group. Local limits are estimates, not a dollar budget.

Validation includes provider XML/response/error tests, permission and group behavior, owner/origin protection, complete contact→group→preview→release→dispatch flow, stale UI response guards, and mobile contact/group form coverage. No production campaign is sent during automated checks.
