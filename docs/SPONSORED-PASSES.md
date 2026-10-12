# KAP sponsored KV Live passes

## What this adds
A total of 250 KAP complimentary general-admission passes without apparel. Each invitation can be claimed once for one or two passes, never more than two. Name, verified email, and phone are mandatory for each claim. Owner access: Command Center → Disciples → KAP Sponsored Passes (`/sponsored-admin.html`). No allocation or ticket is created on startup or deployment.

Owner selects an active distributing Disciple (or KAP direct), sets a quantity, and creates individual invitation links. Each link should be shared with one intended claimant. Two-pass invitations reserve two slots; if only one is claimed, the unused slot is released for further allocation. Creation reserves campaign allocation but does not send messages. “Mark sent” records an operator's sharing action; it is not provider delivery evidence.

Guest opens `/sponsored.html#invite=…`, enters name/email/US phone, receives a 30-minute verification link, and explicitly confirms. Only confirmation issues an order and QR ticket. The server prevents reuse of an invitation and rejects another claim if either normalized email or US phone has already claimed in this event campaign. Confirmed identity locks are retained through event expiration and are not released by upgrade, refund, email failure, or refresh. Email is verified; phone ownership and real-world identity are not independently verified. Different legitimate guests sharing a phone need owner assistance; do not work around duplicates with fabricated details.

The complimentary order has status `complimentary`, amount zero, no apparel, and no commission. It never changes paid product sold counts, discounts, or apparel inventory. The campaign's claimed allocations remain consumed after guests upgrade; upgrades do not create new giveaway supply.

## Optional enrollment and upgrades
No application or Disciple agreement is accepted by claiming a pass. The optional enrollment link opens the existing Disciple application/consent flow. Reporting matches verified claim emails to applications submitted or active member records created after the claim. Existing memberships do not count as new conversions; these are observed matches, not causal attribution or email opens.

The guest's private pass link retains the original distributing Disciple, independent of referral cookies. The optional upgrade purchases exactly one current canonical Kingdom VIP Pass Bundle per pass in the claim, including Drop 001 and its required size/address. Current configuration: $39 early / $49 regular, plus configured fees. No separate giveaway discount or cash value is applied. Existing per-Disciple/event commission rules use paid eligible merchandise subtotal, excluding fees/taxes, and retain existing reversal handling.

Checkout restricts sponsored upgrades to the verified guest email and the number of VIP bundles matching the claim (one or two). Upgrades apply to the whole claim; partial upgrades are not offered. The page displays the total for both passes before checkout when applicable. Pending ticket reservations count against paid inventory. One pending upgrade checkout per claim is allowed; returning guests can resume the stored Stripe checkout URL. A checkout with an ambiguous provider failure can recover the exact original Stripe request with its original idempotency key for up to 23 hours, or retrieve its known Stripe session. It never creates a new order to retry. After that safe retry window, an unknown session requires owner inspection in Stripe before resolving it. Local expiration alone does not authorize a new sponsored upgrade: Stripe must confirm expiration through its webhook or the recovery lookup. Unresolved sponsored attempts continue reserving paid capacity and early pricing.

On verified payment, the VIP ticket replaces the free ticket; the old QR is rejected. The number of free tickets checked in while payment was pending transfers to the corresponding number of VIP tickets. Refund/dispute state blocks admission and follows the existing commission reversal process. A refund never automatically revives the free pass.

## Reporting
The campaign report shows unallocated, allocated, marked-sent, claimed passes, guest claim count, unclaimed allocation, applications, active conversions, completed/paid upgrades, upgrade revenue and claim rows. Distributor-level totals retain claim and upgrade credit. Claim CSV includes pass quantity and amounts in cents; identities are recorded once per claim. Campaign “remaining” means cap minus all claimed passes, while “unallocated” means cap minus claimed passes and outstanding invitation reservations.

Dashboard paid revenue and paid-order count exclude complimentary orders. Active admission count excludes replaced/refunded tickets. Attendee CSV includes complimentary admissions and skips replaced tickets; its final column records ticket status. The original order/ticket remains in storage for audit and support.

## Security and data
Invitation and pass links are bearer secrets. URL fragments keep tokens out of HTTP paths and referrers. Pages use no third-party assets or tracking scripts and send no-referrer/no-store headers. Owner APIs require existing owner authentication and reject foreign browser origins. Public APIs validate secrets, limit requests, and do not expose secret fields in reports. Verification hashes are stored; invitation and private access tokens must remain secret in protected DATA_DIR/backups.

The feature uses the existing single-process atomic JSON store. Keep the service to one writer/instance; horizontal scaling requires database transactions across the whole ticketing application. Fresh store reads are used after external email/checkout calls. Shop email callbacks and organization connection writes now reload the latest store to prevent stale full-store snapshots from erasing simultaneous claims. New collections are additive; existing customer/order/inventory records are not migrated or reset.

## Release and operation
1. Review/merge the feature PR through the established GitHub workflow after CI passes.
2. Confirm Render deployed that exact commit, persistent DATA_DIR is unchanged, and the service is healthy.
3. Read-only smoke check `/sponsored.html` without a token and the authenticated empty campaign report. Do not allocate/claim live passes merely to verify deployment.
4. Confirm the configured Resend sender and Stripe/webhook configuration are healthy. Verification/pass links are transactional secrets: use a sender with click tracking disabled; do not enable domain-wide tracking for this campaign.
5. Only launch after owner intentionally allocates links. No mass email/invitation sending is included in this PR.

Synthetic tests replace external Stripe/Resend boundaries and use disposable data. Local browser checks cover Chromium phone viewports; they are not physical-device validation or evidence of live provider delivery.
