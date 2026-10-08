# Email and Marketing Control Center

Approved scope: recovery-email preview/send per abandoned cart; authenticated-only dashboard categories; Forgot login link; persistent segmented contacts and functional campaign controls. Execute natively under the user's existing approval.

Architecture: additive marketing collections in the existing atomic JSON store; owner-only API module; separate dashboard UI; existing Resend account. Lists are memberships over one normalized email identity. Source sync never implies marketing consent. No deployment-time outbound messages.

## Tasks
- [x] Add model and tests: default lists, source sync, CSV import/export, deduplication, contact edits, consent evidence, immutable suppression, settings.
- [x] Add owner APIs and delivery tests: drafts, preview, owner test-send, frozen recipient snapshot, bounded send batches, persisted per-recipient claims, suppression recheck, provider accepted/failed/unknown history. Recovery emails recheck purchases and use durable claims.
- [x] Add UI: list creation, contact edit, import/export, source refresh, campaign editor/preview/test/send/history, settings, recovery preview. Hide nav before auth and after logout; fix hidden styling and reset link.
- [ ] Verify full suite, review changed code, merge and deploy existing Render service, verify unauthenticated endpoints deny access and new assets load.

## Constraints and review focus
Preserve production purchases. Never send campaigns during implementation. Unknown permission is excluded from campaigns. Unsubscribe blocks all marketing and recovery and cannot be removed by source sync/import. Require an owner-entered mailing address for production marketing. No invented delivered/open metrics: report provider acceptance only. Stable send claims prevent duplicate clicks/restarts from re-sending; ambiguous attempts require review, not automatic retries. Re-read store after awaits to preserve concurrent changes. Preview confirmation uses immutable draft revisions; changing list after preview requires a new audience preview. Anonymous carts cannot send; completed purchases cannot receive recovery. CSV quoting, hostile HTML, auth, logout races, partial provider failures, and duplicate contacts are test targets.

Review: independent native review found two Important issues (consent provenance and logout/preview race). Both reproduced with failing tests and fixed. No deferred findings. Full suite and deployment verification recorded in PR.

Owner setup: enter the organization mailing address under Email Settings before sending; no address is invented. Send tests target configured OWNER_EMAIL. Campaign progress is durable in five-recipient batches; the UI continues while open and can pause/cancel. Unknown delivery outcomes are not retried automatically. Existing customer records do not imply subscriptions. Source contacts are imported at startup and can be refreshed from the panel.
