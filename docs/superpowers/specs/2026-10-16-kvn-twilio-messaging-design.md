# KVN Twilio texting — approved design

Approved October 16, 2026 17:42 Eastern; implementation plan approved 18:28 Eastern. Restored from the approved conversation after scratch maintenance. No account, number, paid resource, credential or real SMS has been created.

## Goal
Add Text Messages alongside Email in kvnlive.com Command Center. KVN owner selects segments, saves drafts, reviews exact recipients, sends an authorized test and releases campaigns. Preserve original records and Resend Broadcast behavior. Customer onboarding/billing/reseller pricing and AI sending remain future phases.

## Account
Use a platform parent account and isolated KVN subaccount/Messaging Service. Actual legal owner and EIN require verified onboarding details, not assumptions. The owner completes signup, verification and billing through Twilio. Initial work uses fixtures; sending stays disabled until credentials, sender registration, consent and callbacks are verified. Choose a verified toll-free or registered 10DLC sender after inspecting account availability. Number purchase/registration needs a concrete reviewed charge/form. Future customers have isolated account/sender/consent scopes.

## User experience
SMS has Audiences, Drafts, Campaign History and Connection Settings under Email & Marketing. Segments: paid ticket holders, comp recipients, disciples, apparel, Ministry Partners, vendors/Kingdom Market, sponsors and leads when data exists. Union selected segments, deduplicate phones; separately explain missing/invalid phone, missing consent and opt-outs. Composer shows text, branded links, encoding/segment count, eligible count and estimated message units, without fabricating actual cost. Preview binds text, membership, permission and sender; changes invalidate it. Saving/import/preview never sends. Test and release are deliberate owner actions.

## Consent
Purchases, emails, phone ownership and agreements never imply SMS marketing consent. Retain channel/purpose, brand/scope, exact phone, source, disclosure/version, timestamp and evidence. Existing verified CRM text consent can be preserved only for its original phone. Unknown evidence stays excluded. Withdrawal precedence and scope isolation apply. A branded opt-in page can be shared via website/email; do not send unsolicited SMS invitations. Test recipients need explicit authorization. Ambiguous countries/numbers remain excluded; original source IDs/evidence remain intact.

## Delivery and security
Server-only secret credentials; redact from UI/log/export/chat. Owner authentication and same-origin JSON protection on mutations. Validate Twilio signatures against exact branded callback URLs and all fields; forged callbacks cannot change records. Advanced Opt-Out processes provider STOP/START and local records retain provenance; withdrawals apply before later dispatch. Verify HELP/STOP copy during onboarding.

Persist campaigns and attempts before external calls. Stable request IDs avoid duplicate actions; uncertain sends are never blindly retried. Distinguish queued/accepted/delivered/undelivered/failed/excluded/needs-review. Provider SID binds callbacks; duplicate/out-of-order events cannot regress terminal state. Acceptance is not delivery, delivery is not a read receipt. Reload consent before each submission. Single-instance bounded durable dispatcher resumes only definitely unsent attempts; reconcile known SIDs, leave uncertain outcomes for review. Pause stops future dispatch but cannot retract accepted SMS. Application limits and server authorization are independent of UI.

## Release
Fixture and browser tests cover source overlap, consent/phone isolation, preview invalidation, owner security, dispatch/restart/unknown outcomes, signatures, status ordering and mobile controls. Existing email/owner/member tests remain passing. Publish readiness with sending disabled. Actual live test requires chosen authorized recipient plus reviewed exact text and successful account/sender/callback setup. Record setup, deployment and real delivery evidence separately; do not release a marketing campaign as validation. Browser credential runtime was unavailable; no account setup or real delivery is claimed.
