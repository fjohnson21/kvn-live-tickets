# KVN Unified Platform Blueprint
**Version:** 1.0 — strategic architecture for review  
**Date:** October 14, 2026  
**Owner ecosystem:** Kingdom Vibe Network (KVN)  
**Positioning:** One verified account. Multiple authorized profiles. One connected ecosystem.  
**Status:** Proposed product architecture and commercial packaging; NOT permission to activate production services, charge customers, or merge work into main.

## 1. Executive decision

KVN is a video-first, faith-rooted community and a connected growth/commerce suite for **members, ministries, artists/creators, nonprofits and businesses**. KV Social is the discovery and participation layer, **not** a second independent ticketing or marketing system.

A single verified human identity can own or administer many approved profiles; organizations have their own legal ownership, staff permissions, catalog, contacts, subscriptions, payments, and public presence. The member's home feed and account switcher connect to the same authorized organization workspaces. The product must avoid conflating a public social profile with verified legal identity or verified fundraising authority.

**Movement promise:** Faith. Purpose. Community. Impact.

### Non-negotiables
1. **One human login, multiple authorized profiles** — not a shared password for ministry teams; ownership transfer requires documented approvals.
2. **Trust is not a paid privilege** — verified badge, eligibility for Go Live, payouts and messaging are separate from subscription purchase.
3. **Movement first** — free member community, accessible faith content and personal connection remain strong even for non-paying people.
4. **Build once, integrate** — KV Tix, ticket passes, Disciple attribution, CRM/campaign tools and the KVN website are integrated through APIs/events; never copy customer/order records into a new social checkout.
5. **Keep money and permissions separated** — organizers, merchants, charities and donors retain correct legal/financial boundaries.
6. **Video-first but cost-conscious** — short video posts, thumbnail-first muted autoplay, tap-to-unmute, visibility-based pause, Data Saver, signed playback and actual viewing-based allowances.

## 2. Unified account and profile model

The account is an **identity**, not a business subscription. Member consent is not automatically consent to a specific organization's marketing.

| Object | Scope | Essential behavior |
|---|---|---|
| Member identity | One human sign-in and security settings | Email verification; step-up phone/passkey/MFA for risk; age/eligibility controls; recovery, export/delete |
| Personal profile | Member public community presence | Name/handle, photo, follows, posts, saves, testimonies, prayers; one default personal profile |
| Creator/artist profile | Authorized public brand attached to identity | Artist directory, video, links, products, events, earnings; genuine identity/representation review |
| Ministry profile | Organization-owned public brand | Service schedule, directory listing, streams, events, prayer, giving after approval |
| Business profile | Organization-owned brand | Products, links, website, ticketed experiences, storefront, marketing |
| Nonprofit profile | Legally recognized entity | Programs and donation capabilities only after eligibility and payment onboarding |
| Organization workspace | Separate tenant, not a personal-account alias | Owners, operators, seats, locations, entitlements, domain, audiences, transactions, billing |
| Team membership | User-to-organization role mapping | Invitation, scoped rights, revocation, action log; no sharing login credentials |

A human may own a business, serve on two ministry teams and manage an artist brand. Switching profiles never changes the underlying authenticated user ID; every mutation logs both **actor_user_id** and **organization_id/profile_id** where applicable. The number of legal entities is not capped by identity; subscription controls workspaces, seats, locations and features.

### Suggested role hierarchy
- **Organization owner:** legal contact, contracts, billing ownership, transfers and security controls.
- **Administrator:** teams and operational settings, excluding ownership transfer and sensitive payouts.
- **Content manager:** profile, posts, pages and streams, subject to moderation policy.
- **Event manager:** KV Tix events, inventory and attendee operations through scoped integrations.
- **Marketing manager:** audience segments and approved email/SMS programs with consent.
- **Finance manager:** read financial reporting; separately permitted payout/refund actions.
- **Live host/moderator:** schedule or run livestreams within a verified organization's allowances.
- **Viewer/analyst:** read-only reporting.

Sensitive permissions (payout destination, org ownership, billing administrator, API keys) require MFA and audit trails. Assign a backup owner, with an emergency recovery policy.

## 3. Anti-bot and progressive verification program

**Goal:** One accountable personal identity rather than one universal publicly exposed legal name. We can reduce bots and duplicate abuse, but must not promise zero bots or perfect one-person-one-account enforcement.

1. **Onboarding:** verified email, unique normalized email, one active personal profile, challenge/velocity controls, throttled registration, anti-abuse signals; anonymous browsing can remain limited.
2. **Credibility:** optional phone proof or passkey, account age, content quality, benign participation, device/IP risk; handle collision protection and no purchased followers as eligibility evidence.
3. **Creator/organization authenticity:** authorized administrator, organization records/domain verification as appropriate, impersonation complaint and ownership-dispute procedures; badge issued by review, not by payment.
4. **Financial enablement:** identity/business onboarding and payout capability checks through a payment provider; do not collect/store sensitive bank or ID documents in social state.
5. **Trust & safety:** behavioral detection, adaptive limits, manual appeal, blocks, spam suppression and progressive sanctions. Never infer religion, private attributes or identity from worship content for scoring.
6. **Privacy:** protect minors, maintain age policy, support data access/deletion/retention, prevent cross-organization contact leakage. One subscription does not waive policies.

### Proposed account-standing states
Unverified → Email verified → Established → Organization/creator reviewed → Financially enabled and/or Go Live approved. These are **independent claims**, not a single rank or implied assurance of ministry credentials.

## 4. Entitlements and proposed bundles

**Commercial hypothesis only: validate costs and willingness to pay before publishing these prices.** Verification is separately earned; subscriptions buy tools and capacity, not a verified checkmark or the right to impersonate a ministry.

| Offering | Candidate price/month | Who | Included foundations |
|---|---:|---|---|
| **KV Community** | **$0** | Every member | 1 personal profile; feeds; 30–60-sec video uploads; follows, prayer, testimonies, saves; basic links and event discovery |
| **KV Creator** | **$15** | Artists and creators | 1 additional creator profile; creator directory eligibility; branded links; insights; product/event linking; live application eligibility |
| **KV Launch** | **$39** | Ministry, nonprofit or business starting online | 1 organization workspace/profile; directory; KV Links/one-page site; 2 staff seats; basic product/event cards; starter analytics |
| **KV Growth** | **$99** | Active organizations | 1 workspace; 5 staff seats; connected event/ticket catalog; custom-domain eligibility; multi-page site; shop; audience CRM; campaigns/automations; enhanced analytics |
| **KV Pro** | **$249** | Multi-program ministries and established businesses | 1 workspace plus locations; 10 staff seats; expanded site/catalog/marketing; subscriptions and approved giving integrations; additional live allowance; advanced reporting |
| **KV Network** | Custom quote | Networks, denominations, multi-brand operators | Multi-entity tenancy, permission delegation, API access, managed implementation, negotiated usage and support |

**Verification/badges:** separately reviewed, never automatically granted through a $15 or $249 plan. Eligible organizations may have a free basic directory listing subject to moderation; paid levels enhance tools, not baseline community participation.

**Feature allowances must be implemented as an entitlement ledger**, not scattered if-statements tied to plan names. Example keys: org_profile_limit, staff_seat_limit, landing_page_count, custom_domain_limit, product_limit, live_broadcast_minutes, live_viewer_minutes, video_storage_gb, email_sends, sms_segments, API_calls, analytics_retention_days, workflow_runs. Each has include / burst / overage / blocked behaviors, with dashboards and usage alerts.

### Proposed capacity policies for pricing tests
- Community: standard 60-second reviewed video posts; no unrestricted live broadcasting.
- Creator: live can be approved after trust review; modest monthly stream and viewer allowances.
- Launch: scheduled organization Go Live after entity/operator verification; basic site/catalog limits.
- Growth: recurring live scheduling, replay entitlement, expanded email/SMS and marketing automation.
- Pro/Network: larger approved live allowances, locations, multi-staff production and reporting.
- **Email, SMS, bandwidth, live viewer-minutes, domain purchases, payment fees, storage and external services** are metered or billed above explicit plan allowances; never label usage “unlimited” without an economic ceiling.

### Unit-economics illustration (not a forecast)
100 Launch accounts × $39 + 50 Growth × $99 + 10 Pro × $249 = **$11,340 monthly gross subscription revenue** before processing, taxes, infrastructure, support, moderation, sales, churn and refunds. Keep platform-service fees, merchant transaction fees and charitable donation proceeds separate. Profit cannot be inferred from gross subscriptions.

## 5. KV Social and the new Go Live policy

### Core video post experience
- Videos: 30–60 seconds first release, vertical preferred, genuine thumbnail, short caption, creator identity, topic tag, report/follow/share/save.
- Store actual media in specialist video delivery (Bunny Stream candidate); store provider video ID, derivative references, moderation state and engagement in KVN.
- Start muted inline playback only for the principal visible card; pause offscreen; default a per-member Data Saver or Wi-Fi-only option. No simultaneous streams.
- Upload → quarantine/private provider access → scan/transcode/thumbnail → human moderation approval → signed playback URL/entitlement check → CDN delivery.
- Do not retain unreviewed media as an openly accessible URL; signing keys stay server-side. Add content rights and removal/revocation processes.

### Go Live eligibility: trust + verification + fair access
**Go Live status is not an automatic subscription perk.**

| Broadcaster | Proposed eligibility | Initial rule |
|---|---|---|
| Individual community member | Verified account, healthy history, phone/passkey as needed, enough authentic activity, no recent severe enforcement | Apply after 30 days plus ≥3 approved original posts; small, time-limited trial; manual review |
| Verified creator | Artist/creator authorization, healthy standing, approved Live application | Eligible for reviewed access regardless of raw follower count |
| Ministry/nonprofit | Verified entity and authorized live host, named moderator, suitable stream plan | Can be reviewed immediately even with few followers |
| Business | Verified operator, healthy standing, clear purpose; comply with sales and claims rules | Promotional live sessions subject to plan and risk limits |
| KVN-owned account | Staff-only privileges, two-person control for large events | Scheduled broadcasts and featured placement after operational sign-off |

Follower thresholds might later be used as one anti-abuse signal, but are **not** the only gate; this avoids excluding small ministries. Abuse or credible safety incidents can override eligibility. Appeals, suspensions, emergency stop, live reporting, chat moderation, copyright escalation and replay policy are mandatory.

**First rollout:** invited organizations and approved creators only. Phone-based spontaneous Live for trusted members comes later. Make Live playback tap-to-join by default to control unexpected viewer-minute spend. Track broadcast minutes, unique/peak viewers, delivered viewer-minutes and host moderation incidents. Apply per-account budget caps, warnings, stop-controls and billing reconciliation. Compare live video providers separately from short video delivery.

## 6. Connected KV Business Suite: end-to-end customer journey

One social post should be able to link to an organization's own verified objects:

**Video post → official profile → link/shop/event/giving/subscribe CTA → organization website or hosted checkout → confirmed order/event/donation/subscription → consent-based relationship → retention campaign → analytics.**

All CTA destinations are checked against the acting profile's privileges, organization ownership and product status; short links are not an open redirect service. Use deep links in the future app. Never force a member to create a paid account just to see ordinary worship content.

### Suite modules
| Module | Customer result | Build/reuse decision |
|---|---|---|
| KV Social | Discovery, testimony, community, short videos, Go Live | Evolve separate Social service with reviewed media pipeline |
| KV Directory | Discover verified ministries, artists, businesses, nonprofits | New directory backed by authoritative org/profile identity |
| KV Links | Link-in-bio destinations, social CTA storefront | Extend branded links; attribution scoped to organization and source |
| KV Sites | Mobile website and landing-page editor | New multi-tenant page/section/template system; domains later |
| KV Tix / Events | Event catalog, tickets, QR and check-in | **Reuse current KV Tix engine** by scoped API/webhooks, not duplicate orders |
| KV Market / Shop | Products, digital goods, apparel, simple inventory | One catalog/commerce orchestration shared across posts, pages and directories |
| Giving | Approved donation campaigns and receipts | Payments routed to verified recipient; charity status verified independently |
| Subscriptions | Memberships, courses, support plans, recurring programs | Separate billing objects for SaaS seats and each org's own customer subscriptions |
| KV Email | Segments, compliant campaigns, transactional messages | Reuse controlled marketing infrastructure and sending domains with tenant isolation |
| KV Text | Consented SMS reminders and campaigns | Tenant-specific sender/registration, consent and suppression controls |
| Audience CRM | Leads/contacts with source, preference and relationship | Per-organization data partition; one person can belong to many audiences with independent consent |
| Analytics & automation | Funnel and engagement visibility | Event-driven source attribution, role-scoped dashboard and metered automations |
| Kingdom Disciple | Referral and community rewards | Reuse existing attribution program with fraud controls and payout reporting |

### Domains and websites
Each organization can start with a KVN-hosted profile/landing page. Paid customers may connect a custom domain, but domain ownership proof, certificate activation, duplicate-hostname checks, transfer/offboarding and email DNS boundaries must be managed per tenant. Cloudflare for SaaS supports user-provided hostnames and automated certificates with validation requirements. Source: https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/

### Email and text marketing
- Marketing data is **organization-specific**. A KV Social follower is not automatically an email or SMS subscriber.
- Capture source, purpose, exact consent text, time, proof, preferred channels and jurisdiction; maintain organizational suppression/unsubscribe history.
- Separate transactional login/ticket notices from optional marketing.
- US A2P 10DLC messaging requires brand/campaign registration, documented opt-in/opt-out flows and public privacy/terms pages for new registrations. Source: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc
- Frequency limits, quiet-hours policies, STOP/HELP handling, delivery failures and provider costs are required before the first tenant campaign.
- KVN may resell managed marketing services, but each customer retains its own consent and sending authority.

## 7. Payments, giving and subscriptions

**Stripe Connect is a candidate for independent merchants and recipient organizations**, subject to product eligibility, platform pricing model, onboarding, tax, dispute and refund reviews. Each merchant or approved nonprofit requires its own verified connected account or equivalent legal payment arrangement, with clear merchant-of-record and payout liability. Reference: https://docs.stripe.com/connect/enable-payment-acceptance-guide

**Three distinct money flows must never be conflated:**
1. **KVN platform subscription:** organization buys SaaS access from KVN; plan, seats, usage, invoice, renewals.
2. **Customer purchases:** buyer pays an event organizer or merchant for tickets/products/services; route to correct merchant and record application fees/processing/refunds per agreement. Preserve KV Tix checkout/ledger as its own system.
3. **Charitable giving:** donor funds belong to the verified beneficiary according to the processor/recipient arrangement; receipts and tax-deductibility claims are issued only by appropriate eligible parties. No automatic representation of every ministry as a tax-deductible charity.

Support recurring donor gifts and organization memberships only after handling who owns the subscription, cancellations, failed payments, refunds and tax reporting. Require policy/legal review of fundraising language and jurisdictional rules. Do not route gifts through a general KVN operating balance by default.

## 8. Technical reference architecture

### Logical service boundaries
**KVN Identity / Account service**
→ claims, security factors, human account, organization memberships and delegated roles.

**KVN Profile & Directory service**
→ public member/artist/ministry/business profiles, verification/badges, discovery and directory indexing.

**KV Social service**
→ posts, reactions, follows, reports, moderation, media references, live state and presentation APIs.

**KV Business Suite service**
→ site builder, domains, link blocks, product catalog, CRM, subscription entitlements, tenant metrics and automation.

**KV Tix integration adapter**
→ scoped event and product views, ticket purchase deep links, signed webhook status, idempotent attribution events. KV Tix remains the authoritative source of ticket inventory and order records.

**Media and Live providers**
→ specialist video hosting and delivery, signed playback, live streaming, thumbnails and usage telemetry.

**Payments + Billing adapters**
→ independent organization payment accounts, SaaS invoices, fee ledger, giving/merchant separation.

**Messaging adapters**
→ Resend and SMS provider integrations with isolated tenant senders, suppression and deliverability logs.

A unified KVN mobile/web app becomes a consumer of the same APIs; no app-specific duplicate customer database.

### Migration from current pilot
The current Social production-foundation PRs use a dedicated Postgres JSONB document and revision checks. That is sufficient as a development bridge, **not** a scalable multi-tenant community model. Before commercial launch:
- Introduce normalized/indexed tables and scoped foreign keys; migrate with a reversible, tested process.
- Move photo and video bytes out of database state into private managed media/object storage.
- Replace single-process sessions with secure shared identity/session management.
- Add database migrations, background jobs/outbox, backups, usage metering, account deletion/retention jobs, monitoring, rate-limit distribution and automated incident alerts.
- Leave production KV Tix data where it is until separate contract/API and migration approval. Never bulk import ticket purchasers into Social accounts or ministry marketing consent.

### Proposed core data entities
- **Identity:** users, credentials, verification_challenges, sessions, recovery_events, user_devices, policy_consents.
- **Tenant:** organizations, legal_entities, profiles, profile_managers, memberships, roles, role_permissions, identity_claims, verification_cases, organization_locations.
- **Community:** posts, comments, follows, reactions, saves, user_blocks, moderation_cases, content_decisions, appeals, abuse_events.
- **Media/live:** media_assets, media_variants, thumbnails, livestreams, live_participants, live_moderation_events, provider_usage_records.
- **Suite:** directory_listings, pages, page_blocks, domains, link_cards, catalogs, products, variants, events_cache, checkout_links, attribution_events.
- **Customer relationship:** contacts, contact_sources, consent_events, marketing_lists, campaigns, messages, suppression_events, automations.
- **Commerce:** merchant_accounts, billing_customers, subscriptions, entitlements, usage_meters, invoices, transaction_references, refunds, payouts, donation_campaigns, charitable_receipts.
- **Reliability:** audit_log, idempotency_keys, integration_outbox, integration_inbox, webhook_deliveries, retention_jobs.

Use tenant-scoped access control at query/API layers (and database row-level policies as appropriate). Do not return cross-organization contacts, payment details, moderation reports or secrets to a public profile. Every webhook needs signature verification, replay controls and idempotent processing. Distinguish **human identity** from **public persona**, **organization** from **subscription**, and **funds recipient** from **platform operator**.

## 9. Phased product delivery and release gates

| Phase | Outcome | Hard gate |
|---|---|---|
| **0. Secure Social beta** | Invite 25–50 testers; profile, short video, basic feeds, reports, manual moderation | Durable database plan; email verification/recovery; privacy/terms/age review; video quarantine; tested iPhone/Android; operator coverage |
| **1. Unified accounts and organizational workspaces** | Account switcher, invitation permissions, profile claims, directory listings | Identity migrations; verified org admin; role tests; bot/impersonation reporting |
| **2. Video-first community and trusted Go Live** | Managed video posts, thumbnails, muted autoplay; approved organization broadcasting | Metering/budget caps; signed delivery; chat moderation and emergency stop |
| **3. Connected commerce** | Directory and post CTAs linking to KV Tix, products and verified payment destinations | Scoped API/webhooks, seller/charity onboarding, refund/fee reconciliation |
| **4. KV Links, Sites and Market** | Hosted pages, domains, catalogs, team dashboard | Verified domain ownership, cross-tenant security, published-site moderation |
| **5. KV Marketing and subscriptions** | Tenant CRM, email/SMS campaigns, workflows and SaaS tier billing | Consent/audience isolation, messaging registrations, metering, invoices, support |
| **6. Network + installable KVN app** | App shell, notifications, multi-location networks, integrations | Security/load/device testing, backup recovery, accessibility, platform publishing controls |

**Time-critical boundary:** KV Live on November 21, 2026 has an existing ticketing engine and campaign commitments. Do not let this expansion destabilize the event release. A small controlled Social pilot can proceed only after its own quality/security gates; do not promise Go Live, payouts or tenant website hosting at the event unless actually shipped and approved.

### Next implementation backlog (prioritized)
1. Freeze canonical **Identity → Organization → Profile → Membership → Permission** schema, including org switching and deletion/offboarding.
2. Document and build the migration away from single-document Social state with tests for concurrency and permissions.
3. Define the media ingest/thumbnail/moderation pipeline for short video; use signed access and bounded provider spend.
4. Ship organization directory MVP and staff-invitation workflow; no paid tiers required to test profiles.
5. Create read-only KV Tix event cards and deep links with verified attribution; no changes to production checkout.
6. Implement one universal organization product/CTA block for posts, bio links, landing pages and directory results.
7. Add a feature-entitlement and usage-meter service behind internal feature flags.
8. Perform pilot testing with 25–50 diverse verified creators, ministries and business operators; gather actual conversion, support and media-cost metrics.
9. Prototype tier checkout and paid onboarding **in test mode only**, after billing and legal review.
10. Stage managed Go Live for verified invited organizations; add member Live later.

## 10. Operating scorecard

| Area | Core measures |
|---|---|
| Community | Verified registrations, real monthly/daily active users, cohort retention, posts/comments, genuine engagement |
| Trust | Suspected bot rejection, false-positive complaints, moderation turnaround, appeal outcomes, repeat abuse |
| Media and Live | Upload success, video time-to-first-frame, thumbnail accuracy, playback minutes, egress per active user, live viewer-minutes |
| Directory/suite | Verified organizations, active sites, linked domains, link CTA conversion, paid org attach rate |
| Commerce | Ticket/product/donation CTAs, completed eligible transactions, net platform fees, refunds/disputes, proper recipient reconciliation |
| Marketing | Verified consents, opt-out rates, campaigns sent/delivered, provider usage cost per tenant |
| Finance | MRR, ARPA, gross margin after variable services, churn, support cost, overdue balances |
| Operations | p95 latency, system uptime, incident recovery, backup restores, audit coverage, data deletion SLAs |

**North-star candidate:** retained verified members meaningfully engaging with trusted organizations and creators **plus** the percentage of eligible organizations that activate useful tools. Do not optimize follower counts or paid conversions at the expense of authentic community participation.

## 11. Open decisions requiring approval before monetization

1. Exact legal provider entity for KV Business Suite and ownership of subscription contracts.
2. Paid tier names, prices, annual discounts, included usage and overage unit rates.
3. Whether every verified ministry gets a complimentary directory page; recommended yes with approved public details.
4. Financial eligibility and charitable donation/legal reviews by jurisdiction.
5. Content moderation staffing and appeal independence for religious, commercial and minors-related content.
6. Domain ownership/certificate provider and responsibilities when an organization cancels.
7. Text sender registration model and provider; do not imply SMS reseller capability without verifying terms.
8. Live rights management, rebroadcast/recording consent, prohibited content policies and paid usage ceilings.
9. Definition of first app release (web/PWA vs store-distributed app) and account deletion requirements.
10. KV Tix legacy-customer link policy: explicit invitation/opt-in rather than silent identity/CRM merging.

### Technical references (primary documentation)
- Stripe Connect SaaS / connected accounts: https://docs.stripe.com/connect/enable-payment-acceptance-guide
- Stripe subscriptions and pricing models: https://docs.stripe.com/billing/subscriptions/metered-billing/thresholds
- Cloudflare for SaaS custom hostnames: https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/
- Bunny Stream signed playback: https://github.com/BunnyWay/documentation/blob/main/stream/security.mdx
- Twilio US A2P registration and consent: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc

---
**Implementation policy:** This document is product direction, not an authorization to take payments, activate broad public registration, switch existing payment recipients, change live production services, or merge unrelated branches. Each phase requires testing, operational acceptance and separate release control.
