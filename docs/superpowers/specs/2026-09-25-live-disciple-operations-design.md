# Live Kingdom Disciple Operations Design

## Purpose

Turn the current split Kingdom Disciple workflow into a dependable production system where an administrator can move an application from submission to an active, attributable, payable Disciple account without hidden manual steps.

## Source of truth

The KVN Command Center is the canonical system for all new Disciple applications, active Disciple identities, referral attribution, commissions, payout records, welcome-email state, teams, bonuses, and bundles. KVNLive.com remains the public application experience and forwards new submissions to the Command Center through the existing secret-authenticated intake endpoint.

The two preserved applications in the legacy KVNLive.com D1 database remain legal/audit records. An authorized administrator can transfer an eligible legacy record to the Command Center exactly once. The original KVN reference number, agreement evidence, submission time, and contact/application data travel with the transfer. Transfer retries are idempotent and never create duplicate applications.

## Approval lifecycle

An owner approves an eligible Command Center application. Approval must:

1. validate the current agreement and approval eligibility;
2. create or update exactly one active Disciple tied to the application reference;
3. reserve one unique human-readable handle and referral code;
4. persist the approved application and active Disciple before email delivery;
5. request the welcome email and record its complete result;
6. add an auditable approval event; and
7. return the active personal link.

Email delivery is not allowed to invalidate a completed approval. A failed or unconfigured welcome email leaves the Disciple active but places the record in a visible “Needs email attention” state. Owners can retry delivery. Each attempt records status, provider message ID, timestamp, and a safe error message. Retry is idempotent with respect to the Disciple account and link.

## Legacy transfer

The legacy KVN administrator detail page receives a single functional control: **Transfer to Command Center**. The server-side handler authenticates the administrator, maps the D1 record to the current intake contract, forwards it with a stable idempotency key derived from the original reference number, and records the transfer result in the legacy audit history. The browser never receives either integration secret.

Transferred records enter the Command Center as submitted unless an already-approved canonical record exists. Briannah Cooper’s preserved application is transferred first; the obvious test submission is not activated. After transfer, Briannah is approved in the Command Center, receives a working personal link, and receives the welcome email.

## Functional Command Center controls

The Disciple workspace must provide real owner-only controls:

- Approve application
- Request information
- Reject application
- Copy personal link
- Open/test personal link
- Resend welcome email
- Deactivate or reactivate Disciple
- Edit name, email, default 10% rate, and payout notes
- Designate or remove Kingdom Leader status
- Assign a team member to a Leader
- Issue/invite approved starter bundles
- Record approved Kingdom Market/manual sales
- Reverse an invalid commission
- Mark an eligible commission paid with payment reference
- Export applications, Disciples, commissions, and payouts
- View audit history and the result of every sensitive action

Destructive or financial actions require confirmation. Every control displays success or actionable failure feedback and refreshes the affected data.

## Attribution and commissions

Personal links use `https://disciple.kvnlive.com/<handle>`. A valid visit establishes the existing 30-day attribution. Paid ticket and apparel orders create a commission equal to 10% of eligible gross item sales. Taxes, processing/service fees, shipping, donations, refunds, chargebacks, and unpaid discount amounts are excluded. Refunds and chargebacks reverse affected commissions. Approved Kingdom Market sales can be recorded manually until that sales channel is connected.

Commissions progress through pending, paid, or reversed states. The dashboard shows eligible sales, commission due, payout date, paid amount, and source. Monthly payout remains the 15th with no minimum payout.

## Configuration readiness

The owner dashboard includes a non-secret configuration-health panel. It reports configured, missing, or attention-needed state without exposing values for:

- persistent storage and writeability
- Stripe payment key
- Stripe webhook secret
- Resend email key
- Disciple welcome sender
- Disciple intake secret
- Disciple approval/sync secret
- secure session/cookie secret
- owner email/password authentication
- public/base URL
- Community Bonus legal gate

The panel also reports the most recent welcome-email failure, intake failure, and storage failure when available. Missing critical settings place a visible warning on the Disciple workspace.

## Security and privacy

- All management controls remain authenticated and owner-only.
- Integration credentials stay server-side and are never returned by APIs.
- Health responses expose booleans and safe labels only.
- Application contact details never appear in public endpoints or public logs.
- Existing ticket, order, customer, and payment records are not rewritten.
- Mutating operations are idempotent where retries are expected and add audit entries.

## Acceptance criteria

1. A new KVNLive.com application appears once in the Command Center.
2. A legacy application can be transferred repeatedly without duplication.
3. Approving an eligible application creates one active Disciple and one working personal link.
4. A failed welcome email is visible, retryable, and does not duplicate the Disciple.
5. Briannah Cooper’s link resolves publicly and her welcome email has a provider message ID.
6. The dashboard’s controls call real owner-only endpoints and reflect persisted results.
7. Configuration health accurately reports required settings without exposing secrets.
8. A controlled attributed order test creates the expected 10% commission.
9. Existing ticket and order data remain unchanged except for explicitly created test data.
10. Automated tests and production smoke checks pass before completion is reported.
