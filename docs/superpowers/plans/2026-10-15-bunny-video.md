# KV Social Bunny Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add moderated 30–60-second video posts to the invited KV Social beta.

**Architecture:** The server creates owner-bound upload records and short-lived Bunny upload permissions. The server verifies processing state and duration with Bunny before accepting a video post. Existing moderation gates publication; authorized viewers receive short-lived signed playback links.

**Tech Stack:** Existing Express/Node, PostgreSQL store, browser JavaScript, Bunny Stream API and embedded player.

**Spec:** Approved video scope in this conversation; detailed acceptance criteria below.

## Global Constraints
- Only the dedicated kv-social-beta service; no KV Tix production changes or merge to main.
- Library 780138, CDN vz-3374d7e5-dd2.b-cdn.net.
- Secrets BUNNY_STREAM_API_KEY and BUNNY_STREAM_TOKEN_KEY stay server-side.
- Preserve existing login, email verification, CSRF, invitation, suspension and moderation rules.
- KAP develops; KVN operates.
- No new paid infrastructure or public beta launch.

## Review Focus
- A member attempts to attach another member's upload: reject ownership mismatch.
- Browser duration is forged: require provider-confirmed 30–60 seconds.
- An upload is incomplete or encoding fails: never publish or show a broken public player.
- A published post is hidden or its author suspended: stop issuing new playback grants; existing grants expire within five minutes.
- Provider fails or credentials are absent: preserve text/photo posting and return a clear video-specific error.

### Task 1: Provider adapter and secure configuration
**Files:** create social-app/video.js and test/social-video.test.js; modify social-app/server.js.
**Interfaces:** createVideoProvider(config) returns createUpload(), inspectVideo(id), playbackUrl(id), thumbnailUrl(id). Inject fetch and clock for deterministic protocol tests. Configuration uses the four BUNNY_STREAM environment variables already selected.
- [ ] Verify upload, embed and CDN signing against current official Bunny documentation before implementation.
- [ ] Write failing tests for missing configuration, upstream failure, provider ID validation and expiring signatures; assert no API secret in response payloads.
- [ ] Run node --test test/social-video.test.js and observe expected failures.
- [ ] Implement adapter with fixed provider origins, request timeouts, bounded error messages and five-minute playback grants.
- [ ] Rerun adapter tests and commit.

### Task 2: Authenticated upload lifecycle and moderation
**Files:** modify social-app/app.js; extend test/social-video.test.js.
**Interfaces:** POST /api/videos starts an owner-bound upload; GET /api/videos/:id returns processing state; POST /api/posts accepts videoId mutually exclusive with photoData; GET /api/videos/:id/playback returns signed authorized playback and thumbnail URLs.
- [ ] Write failing HTTP tests asserting anonymous access rejected, CSRF enforced, suspended upload denied, cross-owner attachment denied, durations 29 and 61 rejected, 30 and 60 accepted, processing assets rejected, hidden/blocked/suspended posts denied to viewers, and moderator access retained for review.
- [ ] Run targeted tests and verify expected failure.
- [ ] Implement persisted upload ownership, quota/rate limits, provider-side readiness checks, existing visibility checks, and no-store responses. Recheck readiness before moderator publication.
- [ ] Run targeted tests plus social-production tests; commit.

### Task 3: Composer, thumbnails and playback
**Files:** modify social-app/public/social.js, social.css and app.js CSP; add browser-tests/social-video.spec.mjs and dependency lock changes only if necessary.
**Interfaces:** composer shows upload/processing progress; feed/review cards request authorized playback; visible videos autoplay muted with unmute controls; Data Saver requires tap to load.
- [ ] Write failing browser tests for 30–60-second validation, processing/error states, photo/video exclusivity, muted playback, offscreen pause and Data Saver behavior.
- [ ] Run tests to confirm expected failure.
- [ ] Implement direct resumable uploads using the provider's documented protocol, signed thumbnail display, lazy players and narrowly scoped CSP origins. Do not expose provider secrets to the browser.
- [ ] Run browser tests, npm test and npm run check. Report any unrelated failures explicitly.
- [ ] Review the complete diff for authorization gaps and secret exposure; commit and open a draft PR against the Social hardening branch.

### Task 4: Dedicated-service verification
- [ ] Confirm the saved variable names without revealing values; validate Bunny connectivity from the configured service.
- [ ] Confirm account/database/email readiness before changing the dedicated beta deployment branch.
- [ ] Deploy only kv-social-beta after code checks pass. Test an authorized 30–60-second sample through upload, processing, moderation and playback; verify denied anonymous playback grants.
- [ ] Report separately code checks, provider checks and end-to-end results. If live credentials or sample content block testing, leave beta closed and state the exact blocker.


## October 16 implementation review and rollout hold

The draft implements owner-bound upload grants, provider duration validation, signed playback/thumbnails, resumable browser uploads, muted playback, Data Saver, and moderation. Cancellation is checked after polling and before submitting a post. Moderator playback is blocked until upload authorization expires plus a 30-second grace period; approval requires a same-session preview of the current post version and matching provider SHA-256 originalHash. Missing fingerprints fail closed. Modal video cards are disposed on close.

**Do not deploy or enable member video uploads yet.** `KV_SOCIAL_VIDEO_UPLOADS_ENABLED` defaults off. The direct TUS signature does not bind the claimed source size, so the current 100 MB client validation is not a trusted byte quota. Before enabling this flag, implement an upload gateway or a verified provider-side maximum. Counting uploads and checking duration do not replace a byte quota. Live verification must also establish actual Bunny signing, finalization behavior, thumbnails, MP4 playback and moderation with a real 30–60-second test video.

The dedicated Render beta currently has the four BUNNY_STREAM variables saved, but lacks DATABASE_URL, KV_SOCIAL_OWNER_PASSWORD, KV_SOCIAL_INVITE_CODE and RESEND_API_KEY. The existing setup-pending guard must remain until these are supplied securely. Do not copy credentials from KV Tix production or change its branch/configuration.

## October 16 gateway follow-up

The byte-quota blocker above is now addressed for the private beta: a same-origin authenticated upload gateway creates a TUS session with a fixed source length and keeps Bunny authorization server-side. HEAD/PATCH requests enforce ownership, session, CSRF on writes, expiry, offset and remaining-byte bounds. Each buffered chunk is limited to 5 MiB; at most four chunks are buffered concurrently. Bunny enforces the fixed TUS session length and offsets. No endpoint permits a client to reset or replace the upstream session. This adds Render ingress/egress and is a beta tradeoff; a dedicated scaled gateway should precede broad rollout.

The user saved the database, owner password and invite code. A dedicated domain-restricted sending-only Resend key was created and installed via connectors. The existing account application deployed successfully and the live sign-in page was verified. No production ticketing resources were modified. Uploads remain behind the explicit feature flag until deployment is ready for controlled live verification.

Gateway verification: 294 automated tests pass, 1 database integration test skipped, 4 browser checks pass. Tests cover over-limit chunks, wrong owner, CSRF, stale offsets, resumed upload status, expiry, upstream origin restrictions, and browser TUS integration. Live provider behavior remains a deployment verification step.
