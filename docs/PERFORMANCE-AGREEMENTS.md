# Performance agreement operations

The seven existing KV Live agreements remain on the original signing Site. Do not regenerate links, import signing tokens, resend invitations, change terms, or change their signature assurance. The Command Center copies read-only status/evidence through a protected endpoint.

## Configuration

On the existing signing Site, configure `COMMAND_CENTER_SECRET_HASH` as SHA-256 of a random 32-byte secret. Set `AGREEMENT_EMAIL_IDS_JSON` privately to the verified original invitation message IDs and sent timestamps keyed by lowercase recipient email. The bridge response never contains the original private tokens. The companion source revision and deployed version are recorded in the PR.

On the existing Render service, merge (never replace) these environment variables:
- `AGREEMENT_SOURCE_URL`: `https://kv-live-agreements.fjohnson.chatgpt.site`
- `AGREEMENT_SYNC_SECRET`: the same random secret in plaintext, stored as a secret.
- `AGREEMENT_SOURCE_IDS`: JSON array of the seven exact original contract IDs. Fetch these only through the authenticated source bridge. All seven must be present before synchronization is healthy.
- `PERFORMANCE_AGREEMENTS_ENABLED`: `false` during rollout. Set `true` only when ready to permit owner-confirmed new issuance.
- `RESEND_API_KEY`: existing Resend key must support sending and retrieving email status.
- `PERFORMANCE_AGREEMENT_FROM`: optional; defaults to `KV Production Team <info@tickets.kvnlive.com>`.

Retain the existing persistent `DATA_DIR`. New `performance-agreements.json` is separate from `store.json` and written with mode 0600 using atomic replacement. Back it up with the persistent disk. **Run one Node process/instance against this file.** Atomic replacement is not a multi-process transaction lock. The current Render service has one instance and a persistent disk; do not scale writers without migrating agreement storage to a transactional database.

## Owner workflow

Open Agreements, select Refresh all status, and inspect the sync timestamp/health. This refresh performs no email sends. Provider responses are recorded separately from signed status; a source error blocks new issuance immediately. The provider API exposes its latest event, so polling cannot reconstruct every historical email open or delivery event. Displayed observation times are refresh times, not fabricated event timestamps.

Create a draft with a unique event reference, exact recipient and exact finalized agreement text. Saving or revising never sends mail. Review the displayed version, SHA-256, recipient and text; select the confirmation checkbox and approve. Issuing requires another explicit confirmation. A revision clears approval; issued content is immutable. Accepted records cannot be revoked. Existing-site agreements are read-only.

Native links expire after 30 days and are held only as hashes. Signers receive a code at the agreed email address (10-minute validity, five attempts, one request/minute, ten/day), then enter legal name/email and explicitly consent. Evidence retains the exact text/hash, identity method, typed name/email, UTC acceptance time, user agent, consent and verification attempts. Repeated acceptance returns the first evidence unchanged. Evidence exports contain personal data and must remain in authorized storage.

Delivery attempt outcomes: provider accepted is not confirmed delivery; failed is a definitive request rejection; unknown includes timeout/interruption. Unknown/accepted attempts cannot be blindly retried. A definitive rejection can be retried only after an explicit owner confirmation. Revocation disables the old link. Original-site records cannot be revoked or resent here.

Page views mean successful agreement-page loads, which may include automated requests. Existing-site view counts begin with the tracking deployment. Zero recorded email opens does not prove unread. Imported legacy acceptance retains `private_link_and_typed_name`; new OTP verification is never claimed retroactively.

## Verification and release

`npm test`, `npm run check`, and `npm run test:mobile` cover domain/API security, source failures, exact-text evidence, XSS escaping, mobile owner review, public signing, and the original mobile regression suite. No real email is sent in tests. Use a separate test data directory; never run fixture tests against production data.

Merge through the repository PR process and deploy the existing Render service deliberately (auto-deploy is off). Confirm the read-only seven-record sync and retained signed evidence before enabling issuance. Rollback the app without deleting the separate agreement data file or modifying the original signing Site. Do not remove or downgrade accepted evidence during rollback.
