# TXT180 Command Center

The existing owner-only Text Messages workspace supports TXT180 through the reseller API at `https://secure.txtpkg.com/api.php`. Customer account selection remains server-side. No reseller provisioning or billing actions are implemented.

Owners can add a contact with permission attestation and source, create a group, assign existing contacts to groups, select groups or Added contacts, save drafts, preview exact recipients and text, release the reviewed campaign, pause future sends, and inspect/export attempt history. Contacts and groups are stored on the existing persistent disk and tied to the provider account/keyword/sender. Existing business audiences without a registered TXT180 contact are excluded with an actionable reason.

Configuration: `SMS_PROVIDER=txt180`, `TXT180_API_KEY` (secret), `TXT180_ACCOUNT_ID`, `TXT180_SHORT_CODE` (ten digits, no +1), `TXT180_KEYWORD`, `TXT180_SMS_SENDING_ENABLED=true`. Existing Twilio variables remain untouched. Configure via Render environment merging; never commit a real key. The startup log confirms a real read-only customer API check, without printing contact details or credentials.

Phone numbers for contacts use E.164. Provider opt-outs are fetched before additions and before queued dispatch (30-second freshness). A failed refresh invalidates freshness. Malformed or incomplete opt-out pages block dispatch. Provider STOP cannot be overridden by ordinary contact entry. Existing Twilio public START signup remains unavailable in TXT180 mode; owner contact entry is the supported enrollment flow in this release.

All mutations require owner authentication, a trusted JSON origin, and an idempotency request ID. Contact/group requests persist intent before provider mutation. Unknown outcomes are retained for manual review, not automatically replayed. Messages retain the existing durable queue, preview expiry, audience deduplication, pause checks, and daily/recipient limits. XML is escaped, validated and parsed with DTD/entity declarations rejected; endpoint is fixed and redirects prohibited.

TXT180 `<ok/>` means accepted, not delivered. No delivery receipt or read receipt is claimed. Individual recipients are submitted from the immutable reviewed snapshot rather than sending to a mutable provider group. Local limits are estimates, not a dollar budget.

The reseller endpoint requires `send_message` recipient `contact_number` directly
under `sms`, alongside `message`. Do not use the `contacts` wrapper shown in the
public customer API examples. The reseller documentation supplied by TXT180
(`APIfull/newAPIdocs962011.txt`) specifies this direct-child format. On October 21,
2026, wrapped phone and contact-ID requests returned error 1000, while the same
owner-only test using the direct-child phone format returned `<ok/>`. Delivery
still requires recipient confirmation. Do not automatically retry uncertain sends
or fall back to group/all-contact delivery.

Validation includes provider XML/response/error tests, permission and group behavior, owner/origin protection, complete contact→group→preview→release→dispatch flow, stale UI response guards, and mobile contact/group form coverage. No production campaign is sent during automated checks.

## Owner-approved survey import

`npm prestart` runs `scripts/import-survey-sms.js`. It is inert by default.
An operator can enable one specific approved import with `TXT180_SURVEY_IMPORT_ID`,
`TXT180_SURVEY_IMPORT_SCOPE` (account:keyword:number), `TXT180_SURVEY_IMPORT_EVIDENCE`,
and `TXT180_SURVEY_IMPORT_GROUPS` (JSON category to existing providerGroupId, name,
extension). Group IDs must first be confirmed for that customer account.
Run only before the HTTP server starts; the operation needs exclusive store access.
Do not run against the live store concurrently with the server.

The job snapshots active comp-survey CRM records, normalizes and deduplicates phone
numbers, unions their selected interests, checks local and provider opt-outs, reuses
existing provider contacts and assigns each selected group. Owner-attested permission
is separately recorded; it does not invent a survey SMS checkbox or the phone call date.
It never calls send_message. TXT180 may send its normal subscription confirmation
when adding a new contact. Confirm consent before enabling this operation.

Each request is marked before submission. Unknown outcomes require review, and a
provider group rejection blocks the remaining batch. Completed and blocked runs do
not repeat on restart. Inspect `sms.surveyImports` and the count-only startup log.
Remove the four job variables after inspecting the result. Do not use a new run ID
to retry an unknown outcome; reconcile provider state and the journal first.
These settings do not enable scheduled imports or campaign sends.

Group creation must include an empty default_message element. Command Center uses
conservative group codes of at most six letters/digits (the operational groups use
three or four); long codes are rejected by this reseller endpoint.
