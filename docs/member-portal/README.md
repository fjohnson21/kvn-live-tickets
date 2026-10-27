# Personal KVN Disciple dashboard

## Scope and design

Approved Disciples use https://kvnlive.com/member to activate a personal account through their existing verified-by-email address, choose a unique username and a password, then view their own activity across the KVN program. The interface follows the light card-based KAP sponsored-pass dashboard. It is responsive, keyboard accessible, and preserves the branded domain.

One member identity covers all portal sections: overview, paid and complimentary tickets, marketplace/vendor/apparel activity, commission ledger, payout records, assigned team and community bonuses, and account/password management. This establishes a member account foundation; it does not automatically connect unrelated future apps or replace owner/admin credentials.

## Identity and security

- No open registration or client-chosen Disciple ID. Activation requires a unique existing active Disciple email and a 15-minute single-use random email token.
- Only token hashes are persisted. Passwords use a unique salt and scrypt N=131072, r=8, p=1; plaintext passwords and reset tokens are never stored or logged.
- Password length is 15–128 characters. Username is unique and case-insensitive. Email also works for login. Existing usernames remain unchanged on recovery.
- Dedicated owner-inaccessible-to-members credential store: DATA_DIR/member-auth.json, atomic replacement and mode 0600. Back up this file with the existing persistent storage. No production data migration is required.
- Member sessions are random, stored hashed, expire after 12 hours, and use an HttpOnly Secure SameSite=Strict host-only cookie. They do not share the owner cookie, user collection or owner middleware.
- Password changes/reset revoke sessions; every authenticated request rechecks active membership and current email. Duplicate emails fail closed and require owner correction.
- Authentication attempts are persisted and limited by identity and network source. Password hashing has bounded concurrency. Secrets and client IPs are not returned to the browser.
- Site proxy forwards only allowlisted paths, body fields, and the member cookie. It signs the network identity using the existing COMMERCE_BRIDGE_SECRET. Backend fallback ignores unverified forwarded IPs.
- Unsafe requests require allowed Origin plus a custom header. Private responses are no-store, and the member HTML has a strict self-only CSP, no tracking scripts, no framing, and no referrer.
- Auth state changes abort refreshes, discard stale responses and erase private rendered data.

## Reporting semantics

All overview totals are all-time. Search/date/category filters narrow the relevant detail tables. Money is integer cents in storage/export and formatted dollars in the UI.

- Paid and complimentary ticket units are separate; upgrades remain their own order activity. Check-ins exclude replaced or invalidated tickets.
- Comp passes measure impact, not commission. No zero-dollar claim is made into an earning.
- Ticket and apparel earnings use existing commission records. Marketplace/vendor earnings use existing owner Credit Sale records; no new rate or payout policy is introduced.
- Pending, paid, reversed and review/recovery commissions remain distinct. The portal does not issue payments. Payout history is a read-only view of existing records.
- Community bonuses are separate from personal commissions. Leaders see only their currently assigned team names/statuses and their own bonus rows, not members' customers or personal commission ledgers.
- No guest contact data, QR codes, claim/access tokens, Stripe session IDs, internal payment references, or owner data are returned.
- Click analytics is explicitly marked unavailable. Financial totals are recorded ledger values, not promises of future payouts.

## Marketplace inquiry attribution

New partner/vendor applications receive a server-generated HMAC proof bound to the unique source record ID and Disciple code using the existing CRM_SYNC_SECRET. The signed CRM sync verifies this proof and stores verifiedReferralCode. Explicit owner-assigned discipleId takes precedence. User-editable referral messages do not grant access. Unsigned historical records are not exposed; the owner can reconcile these separately using existing source records.

The Site and Render CRM secrets must already match. If sync is unavailable, inquiries do not appear until a successful sync. Paid marketplace commissions remain visible independently of inquiry sync.

## Deployment order

1. Deploy the backend routes to the existing Render service, keeping DATA_DIR and all production records intact.
2. Publish the matching Site member page, API bridge and verified-referral submission handlers.
3. Confirm unauthenticated dashboard requests return 401, cross-origin mutations return 403, and the branded member page serves the expected HTML.
4. Existing approved Disciples activate themselves via First time here or forgot your password. Future welcome email templates include the member URL. No bulk activation email is sent by deployment.

## Validation

Run npm test and npm run check. Focused tests cover token expiry/replay, duplicate email, username login, restart persistence, password/session revocation, authorization scope, CSRF, cookie flags, CSV/private responses, upgraded check-ins and signed source proofs. Site tests cover allowlisted proxy behavior, private cookies, XSS-safe rendering, tabs/search and the delayed-refresh/sign-out race.

A real member activation email and real-device Safari workflow require an approved member to exercise setup. Do not create a synthetic production account or send test emails to actual Disciples as part of deployment.
