# Comp ticket survey lead routing

Retained non-test survey submissions are backfilled at server startup. Store writes route new submissions and ticket verification updates into durable CRM records. Existing orders, tickets and claim tokens are unchanged. Survey snapshots whitelist contact/location/interests and claim-state fields; access tokens and verification hashes never enter CRM or exports.

One survey contact per normalized email has multiple lead-list memberships: business → Vendor, ministry → Ministry Partner, disciple → Disciple Prospect, volunteer → Volunteer, sponsor → Corporate Sponsor, donate → Donor Prospect, events/attend → Event Audience. Manual passes without survey responses and launch tests are excluded. Repeat claims preserve individual survey snapshots. Previously purged claims cannot be reconstructed. Expired claims retained at deployment remain eligible for backfill.

Leads / CRM and Reports contain named survey-list buttons. Each list has an Excel-compatible CSV export with the selected segment in its filename, location, interests, verification state and follow-up fields. Business workspaces link to the appropriate prospect lists. Corporate Sponsor prospects are under Marketing; donor prospects are under Budgets & Finance. All seven lists are available together in Leads / CRM. One shared contact workflow, notes and archive setting apply across memberships, as stated in the profile. Existing applications remain separate source records.

Survey prospects are not enrollments, applications, confirmed partners, donations, or messaging consent. Legacy email/SMS audience import skips survey CRM rows; existing campaign sources retain their behavior. No messages are sent by this migration. Owner authentication and existing CRM audit/concurrency protection apply to lists, profile edits and CSV exports.

Validation covers multiselect routing, repeated submissions, safe snapshots, idempotence, persistence after claim cleanup, preserved orders, business links, CSV filtering, legacy audience exclusion and mobile list/export flows. Startup logs only aggregate counts by segment, never contact information.
