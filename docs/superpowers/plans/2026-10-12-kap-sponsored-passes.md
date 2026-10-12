# KAP Sponsored Passes Implementation Plan

Goal: 250 independently allocated, email-verified complimentary GA admissions with at most two passes per claim with durable distributor attribution and optional paid VIP upgrades.
Architecture: additive sponsoredInvitations/sponsoredClaims records in existing atomic store; free orders use existing QR/email/check-in infrastructure, never paid product inventory. Upgrade checkout reuses canonical VIP pricing, fees, apparel and commissions, and retires the original admission on payment.
Tech: Express, existing JSON store, Stripe, Resend, node:test and Playwright.

## Approved design / constraints
- Hard campaign cap 250; owner allocates individual invitation links, optionally assigned to an active Disciple. No live allocations during development.
- One claim per invitation, normalized email and phone; required name/email/phone, one or two passes per claim. Email verification precedes issuance. Verification and access tokens are secrets and links use URL fragments, no tracking.
- Free GA has no apparel, no payment/commission and no paid-inventory consumption. Claimed allocation remains consumed after upgrade.
- Enrollment is optional through the existing agreement/application process. Report verified applications and active enrollment separately from interest.
- VIP costs the current $39 early/$49 regular bundle price plus configured fees, includes Drop 001 and consumes paid VIP inventory only. No extra giveaway-specific discount.
- Original distributor attribution survives later cookies and devices via claim access link. Existing event commission rules apply to paid upgrades; zero-dollar claims earn count credit only.
- Upgrades replace the free admission; pending/failed payments do not. One pending/paid upgrade per claim. Refunds do not resurrect free admissions automatically.
- Existing orders/customer records/discounts preserved. No seed-data updates, production tests, invitations or campaign launch.

## Review focus
- Concurrent last-slot claims and duplicate webhook deliveries.
- Expired verification/retry and email send failure without consuming admission.
- Attribution spoofing, unauthorized owner access and public token disclosure.
- Paid checkout reservation races and stale store writes across asynchronous callbacks.
- Upgrade after check-in, refund/reversal and dual admission prevention.

## Task 1: domain
Files: lib/sponsored-passes.js, test/sponsored-passes.test.js.
- [x] RED tests for allocation cap/idempotency, claim validation/verification/duplicates, untouched paid products, reporting and replacement semantics.
- [x] Implement allocateInvitations, beginClaim, confirmClaim, claimAccess, validateUpgrade, completeUpgrade, sponsoredReport.
- [x] Run focused tests then suite.

## Task 2: routes and integration
Files: lib/sponsored-routes.js, server.js, test/sponsored-routes.test.js.
- [x] RED integration: owner-only allocation; verification sends only mocked mail; real local claim QR; free claim zero commission; Stripe signed webhook creates one VIP and commission, invalidates GA; failed/duplicate checkout safe.
- [x] Register owner/public routes with bounded requests and rate limits; persist before asynchronous mail; fresh reload after mail.
- [x] Hook existing checkout to restrict sponsored upgrades to the matching count of canonical VIP bundles, pin verified identity/distributor and reserve inventory; finalize replacement atomically with paid order.
- [x] Check-in rejects retired/refunded tickets. Include complimentary attendees in exports without sales inflation.

## Task 3: UI and verification
Files: public/sponsored.html/js/css, public/sponsored-admin.html/js, dashboard link, browser-tests/sponsored.spec.mjs, docs/SPONSORED-PASSES.md.
- [x] Build welcoming mobile claim/verify/ticket/optional enrollment/upgrade experience; owner allocation and counts by Disciple.
- [x] Browser checks at 320 and 390 pixels using disposable synthetic data.
- [x] Full tests, syntax checks, diff check, independent review and fixes.
- [ ] Commit/push feature branch and create PR. Verify CI; production deployment requires authorized merge/release. No campaign activation.

## Execution evidence and decisions
- Baseline: 266 tests passed. Development occurred on an isolated clone/feature branch; no production store opened or changed.
- RED/GREEN: missing allocation/claim domain; active-admission dashboard count; checkout recovery; refund/dispute reporting; hash-link phone navigation; delayed shop resend overwriting a new claim.
- Independent fresh-context review found three Important issues (checkout recovery, reversal visibility, stale full-store writes). Fixed each with regression evidence. No deferred minor findings.
- Ruling: individually allocated single-use links rather than a public reusable distributor link. This gives deterministic distributor ownership and a strict allocation cap; distributors must share one link per guest.
- Ruling: verified email plus normalized US phone define campaign uniqueness; this does not independently verify phone ownership or identity.
- Ruling: recovery reuses exact Stripe config and idempotency key for 23 hours; unresolved unknown sessions beyond that require owner Stripe review rather than risking duplicate charges.
- Ruling: retain historical free order but retire its QR on upgrade; consume its campaign slot permanently. This avoids recycling beyond the approved 250 guests.
- Release limited to feature PR pending merge/deploy authorization. No real allocation, claim, email, payment, enrollment or check-in during tests.

## User update — October 12, 08:08 ET
Maximum two complimentary passes per claim. Name/email/phone are required, and either email or phone must block another comp claim through event expiration. Implemented quantity 1–2, two-pass invitation reservations with automatic unused-slot release, unique QR per pass, campaign/report/distributor counts measured in passes, and guestClaims as a separate count. Whole-claim VIP upgrades preserve the original admission quantity, total price, shirt selections, and check-in count.

Focused quantity review verified 250 unique QR admissions, mixed early pricing and partial check-in transfer. Corrected quantity-aware VIP availability with a browser regression (two passes cannot be offered when only one unreserved VIP remains).
