# KV Social — invited beta production foundation

This service converts the reviewed KV Social pilot into a real-account, Postgres-backed invited beta while keeping all KV Live ticket/order data isolated.

## What is real in this branch

- Individual member email/password accounts.
- Invite-code gated registration and explicit community agreement.
- Passwords stored only as salted scrypt hashes.
- Secure HTTP-only sessions with CSRF and same-origin write protection.
- Production Social state stored in Postgres through `DATABASE_URL` with optimistic revision checks.
- Local automated tests may use the isolated file store when `DATABASE_URL` is absent.
- Verification and password-reset tokens are stored only as hashes and expire after use/time limits.
- Editable member display name and bio.
- First-release feeds: Kingdom Culture, Testimonies, Prayer Requests, Music and KV Live.
- Text and phone-processed photo posts; pending photos stay private until moderator approval.
- Static KV Live access from the Social experience.
- Persistent posts, comments, reactions, saves, blocks, reports, moderation decisions, suspensions, appeals and audit history.
- Existing human-review-first moderation policy and mobile UI.
- Dedicated moderator account bootstrapped from environment secrets.

Ticketing, checkout, customer records, marketing consent and owner dashboard authentication are not imported or reused.

## Required environment

```
NODE_ENV=production
DATABASE_URL=<Render Postgres connection string>
KV_SOCIAL_OWNER_EMAIL=<moderator email>
KV_SOCIAL_OWNER_PASSWORD=<12+ character bootstrap password>
KV_SOCIAL_INVITE_CODE=<private invited-beta code>
RESEND_API_KEY=<sending-only key>
KV_SOCIAL_EMAIL_FROM=KV Social <social@tickets.kvnlive.com>
```

Run with `node social-app/server.js` as a separate Render service. Do not point it at the KV Live ticket JSON store or reuse the ticket service process.

## Beta boundary

This file-backed store is intentionally a single-instance beta foundation. Atomic replacement protects each persisted write on one Node process, but it is not a multi-instance transactional database. Before broad public scale, migrate the same Social data model to Postgres, add verified-email/recovery flows, moderator MFA, expanded media/video pipeline, backups/restore exercises, distributed abuse controls and operational monitoring.

## Release rule

Do not expose this service publicly until CI passes, owner credentials/invite code are set, privacy/community terms are approved, a named moderator is scheduled, and a separate Render service or verified KVN hub route is configured. No production KV Live ticket deployment is required for this branch.


## Short-video posts — video-first KV Social beta

The new video integration is optional and **off until all dedicated Bunny Stream credentials are configured**. It stores provider video IDs, a small JPEG poster and moderation records in Social state. Raw video uploads go from the member browser directly to Bunny's resumable upload endpoint, never through Render, KV Tix or Postgres.

### Social service secrets
- BUNNY_STREAM_LIBRARY_ID: numeric video library ID
- BUNNY_STREAM_API_KEY: video library API key (never send to browser)
- BUNNY_STREAM_TOKEN_SECURITY_KEY: distinct Stream embed token security key (never send to browser)

### Provider safeguards before any real uploads
- In Bunny Stream Security, enable **Embed View Token Authentication**. The app issues signed ten-minute player URLs only to approved viewers, authors and moderators.
- Configure the library's allowed embed domains for the approved Social beta host and social.kvnlive.com. Verify an **unsigned embed URL returns 403**.
- Protect underlying direct-media and thumbnails at the CDN level, not only the embed iframe. Signed embed access alone is not full media privacy.
- Block direct URL access where appropriate; test the CDN Pull Zone options, referrer settings and token configuration together, including previews.
- Disable early public play of originals before moderation. Never assume a provider GUID is secret or sufficient access control.
- Set monthly spend alerts and a policy for deleting orphaned uploads. Uploads rejected for duration can still accumulate storage charges.

### Behavior and testing
- Maximum 60-second posts, upload limit 100 MB. MP4, MOV, and WebM accepted pending real-device validation.
- Generated JPEG thumbnail stays behind a Social authorization endpoint until approval.
- Every post and revision still requires human review; author/moderator may inspect pending footage.
- Published feed uses thumbnail-first load, muted visible-card autoplay, tap-to-play, one active player and Data Saver.
- Validate resumable TUS on iPhone Safari/Android Chrome with a configured Bunny test library before release.
- Remaining: production media retention/cleanup, secure provider webhook handling, normalized Postgres schema, virus/abuse review and cost telemetry. This PR does not enable Go Live.
