# Unified Kingdom Disciple Program Design

**Status:** Approved architecture; implementation pending  
**Date:** September 21, 2026  
**Systems:** `kvnlive.com` and `fjohnson21/kvn-live-tickets`

## 1. Purpose

Kingdom Vibe currently has two independent Disciple application and approval systems:

1. The public Kingdom Vibe Live Site at `kvnlive.com/disciples`, backed by its own D1 database and admin workflow.
2. The KVN Live Tickets service, backed by its persistent JSON store and displayed in the KVN Command Center.

This design consolidates all new enrollment, review, approval, attribution, welcome-email, commission and payout activity into the KVN Command Center while preserving the polished public experience at `www.kvnlive.com/disciples`.

The public program name is **Kingdom Disciple**. Approved participants are **Kingdom Disciples**. Existing internal route names, database keys and API identifiers may continue using `disciple` to avoid breaking integrations.

## 2. Success Criteria

- `https://www.kvnlive.com/disciples` is the canonical public enrollment URL.
- Every new application submitted there appears once in the KVN Command Center.
- The Command Center is the only system that can approve, reject, request information, deactivate or reactivate a new application.
- Approval creates exactly one non-recyclable personal identity and URL, such as `https://disciple.kvnlive.com/briannahcooper`.
- Approval sends the Kingdom Disciple welcome email containing the personal link, intentional first-post copy, profile/bio instructions and current commission terms.
- Authorized administrators can appoint or deactivate Kingdom Leaders and manually assign, reassign or remove their direct team members.
- An active Kingdom Leader retains the standard 10% personal commission and may receive a 2% Community Bonus only on eligible customer sales attributed to directly assigned team members.
- Activated Kingdom Leaders can receive a complimentary Kingdom Disciple Experience Bundle; approved non-Leader Disciples may optionally purchase the bundle after approval.
- Agreement evidence and submission audit data are retained with the application.
- Existing Site D1 application records are preserved and remain readable during migration.
- No ticket, order, payment, attendee or historical commission record is rewritten or deleted.
- The production flow passes automated contract, integration and end-to-end tests before deployment.

## 3. Program Terms

Agreement v2.2 is the controlling public agreement for new applications. It incorporates the Kingdom Leader and Community Bonus terms and must receive review by licensed counsel before Community Bonus payouts are activated.

- Default commission: 10% of eligible gross item selling price actually paid and retained.
- Approved sales channels: KVN Live tickets, approved ticket bundles, Kingdom Vibe merchandise/apparel and approved Kingdom Market purchases or partnership packages.
- Attribution: 30 days from the valid personal-link visit, subject to recorded platform attribution rules.
- Exclusions: taxes, processing or service fees, shipping, donations, refunds, cancellations, chargebacks, complimentary items, fraudulent orders and amounts removed by discounts.
- Statuses: Pending, Available and Paid; reversals or adjustments remain auditable.
- Payout schedule: monthly on the 15th.
- Minimum payout: none.
- Payout execution: manual initially, with secure ACH onboarding deferred to a later phase.
- Promotion commitment: at least one approved promotional post weekly during assigned active campaigns.
- Compensation remains purpose-first in public positioning but is stated clearly in the agreement and welcome package.

### 3.1 Kingdom Leader and Community Bonus Terms

- Kingdom Vibe alone appoints, activates and deactivates Kingdom Leaders. Recruiting does not automatically confer Leader status.
- Participation, application and Leader consideration are free. No enrollment fee, starter-kit purchase, inventory purchase, personal purchase or sales quota is required to participate, remain active, lead a team or qualify for compensation.
- An active Kingdom Leader keeps the standard 10% commission on the Leader's own eligible sales.
- The 2% Community Bonus applies only to eligible gross sales to non-participant customers attributed to Disciples directly assigned to that Leader at the time of the qualifying sale.
- No bonus is paid for an application, enrollment, approval, recruitment, team assignment or purchase made by a Disciple or Leader.
- There are no second-level or deeper bonuses. A team member may have no more than one directly assigned Leader at a time.
- The same exclusions, reversals, attribution rules and payout schedule governing the 10% commission govern the 2% Community Bonus.
- Kingdom Vibe may manually assign or reassign members regardless of which recruiting link introduced the applicant. Assignment changes apply prospectively and remain auditable.
- Program materials and participants may not promise earnings or make unsupported income or lifestyle claims.
- Community Bonus calculation and payout remain disabled until licensed counsel approves the agreement and compensation language for the jurisdictions in which the program will operate.

### 3.2 Post-Approval Experience Bundle

- The Kingdom Disciple Experience Bundle may include a VIP ticket, approved merchandise and identified event benefits.
- An activated Kingdom Leader may be awarded one complimentary bundle by an authorized administrator. Triggering the award creates a zero-dollar fulfillment order and sends a Leader email describing it as complimentary.
- An approved non-Leader Disciple may receive an optional private purchase invitation after approval. The email and checkout state clearly: "Optional purchase—no purchase is required to participate or earn commissions."
- Buying or declining the bundle does not affect approval, status, leadership consideration, team placement, visibility, commission rates or continued participation.
- Bundle purchases by participants generate no personal commission, Community Bonus or qualification credit.
- Complimentary and paid bundles use distinct order types and remain separately reportable and auditable.

### 3.3 Compliance Design Basis

North Carolina G.S. 14-291.2 prohibits a plan in which a participant gives valuable consideration for the opportunity to receive compensation for inducing others to participate, while distinguishing compensation based on sales to non-participant customers. FTC guidance requires a fact-specific review of how a program actually operates and warns that product sales alone do not create a safe harbor when the structure incentivizes recruitment. Accordingly, this design separates free participation and KVN-controlled Leader appointment from the optional bundle, limits the Community Bonus to verified direct-team customer sales and requires legal review before bonus payouts are enabled.

Primary references:

- North Carolina General Statutes, G.S. 14-291.2: `https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_14/GS_14-291.2.html`
- FTC, Business Guidance Concerning Multi-Level Marketing: `https://www.ftc.gov/business-guidance/resources/business-guidance-concerning-multi-level-marketing`

## 4. System Ownership

### 4.1 Kingdom Vibe Live Site

The Site owns:

- Public Kingdom Disciple marketing and program explanation.
- The public application user interface.
- Client-side field validation and accessible error presentation.
- Delivery of the current agreement text for review and download.
- A server-side same-origin intake adapter that forwards validated applications to the Command Center API.
- Public confirmation containing the Command Center-issued application reference.

The Site does not own new application state, approval decisions, referral identities, welcome-email state or commission records after cutover.

### 4.2 KVN Command Center

The Command Center owns:

- Durable new application records.
- Agreement and attestation evidence.
- Duplicate-risk matching.
- Review status and decision audit history.
- Approval, rejection and information-request actions.
- Kingdom Disciple identities and personal links.
- Welcome-email attempts and delivery state.
- Kingdom Leader status, direct-team assignments and assignment history.
- Community Bonus calculations, reversals, holds and payout state.
- Complimentary bundle awards and optional post-approval purchase invitations.
- Attribution, commissions, adjustments and payout records.
- Search, export and reporting for administrators.

## 5. Data Model

The Command Center application record will retain the complete public application, including:

- Identity: legal first name, legal last name and preferred name.
- Contact: email, mobile and full mailing address.
- Program details: shirt size, primary market and affiliation.
- Reach: Instagram, Facebook, TikTok, YouTube, other social profile and combined audience size.
- Narrative: motivation, promotion plan, referral source and additional notes.
- Commitments: weekly-post commitment, agreement acceptance, electronic-records consent and records-access confirmation.
- Attestation: typed legal name, agreement version, SHA-256 agreement hash and accepted timestamp.
- Submission evidence: application reference, idempotency key, source system, IP address, user agent, created timestamp and updated timestamp.
- Risk: normalized email/mobile comparison results and duplicate-risk indicator. Duplicate risk flags the record for review and does not automatically reject it.
- Workflow: status, decision history, administrator identity, internal notes and applicant-facing messages.

The Leader and team model adds:

- Leader status: inactive or active, effective timestamp, deactivated timestamp, appointing administrator and reason.
- Team assignment: Leader identity, member identity, effective start/end timestamps, source (`recruiting_link` or `manual`), assigning administrator and reason.
- Recruiting attribution: the Leader link that introduced an applicant, stored separately from the authoritative team assignment.
- Community Bonus ledger: qualifying order, customer eligibility, assigned member, assigned Leader, eligible gross basis, 2% rate, amount, status and reversal references.
- Bundle action: recipient, bundle type, complimentary or paid mode, initiating administrator, fulfillment state and email-delivery state.

New collections are additive. Existing arrays and records in the persistent store remain intact.

## 6. Intake API

The Command Center will expose a dedicated server-to-server application endpoint for the KVN Site.

Requirements:

- Authentication uses a dedicated integration secret stored only as a Site secret and Render environment secret.
- Browser clients never receive the integration secret.
- The Site accepts the browser submission on its same-origin route and forwards it from the server.
- Requests require an idempotency key. Repeating a successful request returns the original application reference without creating a duplicate.
- Payload size, field lengths and enumerations are validated on both systems.
- The Command Center calculates the agreement hash independently or verifies it against the current canonical v2.2 agreement.
- The Command Center uses trusted proxy headers for source IP only when received from the Site adapter.
- Failed forwarding returns a safe, actionable message and does not claim the application was received.
- Application responses never expose private notes, internal risk signals or secrets.

## 7. Application Flow

1. The applicant opens `www.kvnlive.com/disciples`.
2. The page presents Kingdom Disciple branding, purpose, benefits and agreement v2.2.
3. The applicant completes required identity, contact, reach, narrative and attestation fields.
4. The Site validates the browser submission and sends it through the same-origin Site API.
5. The Site API forwards the normalized application to the authenticated Command Center intake endpoint.
6. The Command Center validates, checks idempotency, calculates duplicate risk, persists the application and audit event, then returns a KVN application reference.
7. The Site displays the reference and review expectations.
8. The application appears in the Command Center under Kingdom Disciples.

## 8. Approval Flow

1. An authorized owner reviews the complete application and agreement evidence in the Command Center.
2. The owner approves, rejects or requests information.
3. Approval is permitted only for the current accepted agreement version.
4. Approval creates or idempotently retrieves exactly one Kingdom Disciple record.
5. The canonical personal handle is derived from the approved preferred or legal name; collisions require an explicit alternative rather than silent reassignment.
6. The default commission rate is 10%, attribution is 30 days, payout day is the 15th and minimum payout is zero.
7. The system stores the non-recyclable personal identity and returns the public personal URL.
8. The welcome email is sent and every attempt is recorded as sent, failed or skipped with provider metadata where available.
9. The decision and resulting identity are written to the audit log.

## 8.1 Kingdom Leader and Team Flow

1. An owner appoints an approved Disciple as a Kingdom Leader and explicitly activates Leader status.
2. Activation does not require a purchase or team size and generates an auditable status event.
3. The Leader receives a team recruiting link. Applications arriving through it retain recruiting attribution but still require ordinary KVN approval.
4. After approval, the Command Center may suggest the referring Leader; an authorized administrator confirms or changes the direct-team assignment.
5. Administrators can manually assign, reassign or remove any approved Disciple. Each change requires a reason and effective timestamp.
6. Reassignment never moves historical bonuses. Eligible sales use the assignment effective when the sale occurred.
7. Deactivating a Leader stops new Community Bonus accrual at the effective time without changing the Leader's ordinary Disciple status unless separately deactivated.
8. The system never awards a Community Bonus for enrollment, recruitment, participant purchases or non-customer transactions.

## 8.2 Bundle Flow

1. After Leader activation, an administrator can trigger a complimentary Leader bundle.
2. The action creates a zero-dollar fulfillment order, prevents duplicate accidental awards and sends the complimentary-bundle email.
3. After ordinary Disciple approval, an administrator may send a private optional purchase invitation to a non-Leader team member.
4. The paid checkout displays the no-purchase-required disclosure and excludes the transaction from all commission and bonus calculations.
5. Fulfillment and email failures can be retried idempotently without creating duplicate orders.

## 9. Branding and Public Copy

- Program name: **Kingdom Disciple**.
- Member name: **Kingdom Disciple**; plural **Kingdom Disciples**.
- Primary heading: “Become a Kingdom Disciple.”
- Positioning remains movement- and purpose-first: faith, culture, purpose and impact.
- Compensation is described as a reward for measurable service and sales effort without obscuring the binding 10% terms.
- Kingdom Leader messaging emphasizes service, coaching and direct-team support. It does not promise earnings or present recruitment as the compensated activity.
- The main KVN Live navigation and appropriate movement calls to action link to `/disciples`.
- Existing black, white and restrained-red Kingdom Vibe visual language remains unchanged.

## 10. Legacy Site Records and Cutover

- Existing D1 application, event, decision and Disciple records are never deleted.
- Before cutover, produce a read-only export and counts by application status.
- Mark the Site’s prior Disciple admin workflow as legacy/read-only after the new intake is verified.
- Legacy applications are not automatically copied into production Command Center data without a deterministic migration report.
- Briannah Cooper should submit the current v2.2 application through the canonical public page. Any earlier record remains preserved for audit history.
- After successful cutover, all new application writes go only to the Command Center.
- A later migration may import legacy records with stable source identifiers and idempotent mapping after review.

## 11. Failure Handling

- Duplicate click or network retry: idempotency returns the original reference.
- Command Center unavailable: Site preserves the entered browser state, shows a retry message and creates no false success receipt.
- Invalid or outdated agreement: reject submission or approval with a specific instruction to accept the current agreement.
- Email provider failure: approval remains recorded, welcome delivery is marked failed, and the owner can retry without generating another identity.
- Personal-handle collision: approval pauses for an explicit alternative handle.
- Invalid or overlapping team assignment: reject the change and preserve the last valid assignment.
- Leader deactivation: stop prospective Community Bonus accrual at the effective timestamp; never rewrite settled history.
- Bundle email or fulfillment failure: retain the bundle action as failed and permit an idempotent retry.
- Partial legacy migration: stop, report the last stable source identifier and retry idempotently.
- Deployment failure: preserve the currently live version and do not cut over intake.

## 12. Security and Privacy

- Integration credentials remain in managed environment secrets and are never committed or sent to browsers.
- Owner authentication continues using the secure HTTP-only cookie session.
- Public APIs apply rate limits, payload limits, strict validation and origin controls.
- Logs exclude full application bodies, secrets and sensitive contact details.
- Bank routing and account numbers are not collected in this phase.
- Administrative responses expose only the minimum data required by the role.
- CSV exports retain spreadsheet-formula escaping.
- Leader-facing views expose only the minimum team-member information required for approved coaching and never expose private application narratives, risk flags or administrative notes.

## 13. Testing

### Contract tests

- Agreement v2.2 contains the exact 10%, eligible-channel, 30-day, payout-day and no-minimum terms.
- Leader terms expressly prohibit pay for recruitment, participant-purchase bonuses and purchase-based eligibility.
- Community Bonus activation is blocked until the legal-review configuration is enabled by an owner.
- Public Kingdom Disciple naming and canonical `/disciples` route are present.
- Welcome email contains the personal URL, first post, bio instructions and current compensation terms.

### Unit tests

- Application normalization and field validation.
- Agreement hashing and version enforcement.
- Idempotency behavior.
- Duplicate-risk matching.
- Canonical handle generation and collision detection.
- $49 eligible sale produces a $4.90 commission.
- Discount, refund and chargeback exclusions.
- Direct-team customer sale calculates a 10% member commission and separate 2% Leader Community Bonus.
- Participant purchases, enrollment and recruiting events calculate no Community Bonus.
- Team reassignment applies prospectively without changing historical bonus ownership.
- Leader activation/deactivation and manual team assignment authorization.
- Complimentary Leader bundle and optional paid-member bundle remain commission-ineligible.

### Integration tests

- Site adapter to Command Center intake with authenticated server-to-server request.
- Duplicate submission returns the same reference.
- Application appears in the Command Center with complete evidence.
- Approval creates one identity at 10% and records an audit event.
- Welcome failure can be retried without duplicating the Disciple.
- Recruiting-link attribution can be overridden by an audited manual team assignment.
- Triggering a complimentary Leader bundle creates one zero-dollar fulfillment order and sends the correct email.
- Optional member bundle checkout displays the required disclosure and creates no commission entries.

### End-to-end verification

- Submit a clearly labeled production test application from `www.kvnlive.com/disciples`.
- Confirm it appears once in the production Command Center.
- Approve it using the secure owner session.
- Confirm personal-link resolution and attribution cookie behavior.
- Confirm welcome-email provider status.
- Activate a synthetic Leader, manually assign the synthetic Disciple and verify the direct-team relationship.
- Verify a synthetic external-customer sale creates the expected 10% commission and 2% Community Bonus, while participant and complimentary orders create neither.
- Trigger a complimentary Leader bundle and verify its email and zero-dollar fulfillment record.
- Remove or deactivate only the synthetic test identity after evidence is recorded; do not alter real applications.
- Confirm existing ticket and order counts remain unchanged before and after deployment.

## 14. Deployment Sequence

1. Record pre-deployment ticket/order counts and legacy Site record counts.
2. Obtain licensed-counsel approval of Agreement v2.2 and the Community Bonus language before enabling Leader bonus payouts.
3. Add and test the Command Center intake, Leader/team, Community Bonus and bundle models.
4. Add and test the Site server-side adapter and Kingdom Disciple v2.2 copy.
5. Deploy the Command Center first while the existing Site flow remains live and Community Bonus payouts remain disabled.
6. Verify the new endpoint and compensation rules using nonproduction fixtures.
7. Deploy the Site cutover.
8. Run the labeled production end-to-end application and approval check.
9. Verify welcome delivery, personal-link behavior, team assignment, bundle actions, logs and unchanged ticket/order counts.
10. Place the former Site admin workflow into read-only legacy mode.

## 15. Out of Scope

- Automated ACH onboarding or payouts.
- Raw bank-account storage.
- Rebuilding ticket checkout.
- Changing existing ticket, order, attendee or payment records.
- Automatically importing legacy applications without a reviewed migration report.
- Multi-level or second-generation team compensation.
- Any fee or required purchase for program participation or leadership eligibility.
- The broader Partners, CRM, Analytics and Finance Command Center modules beyond the interfaces required by Kingdom Disciple.
