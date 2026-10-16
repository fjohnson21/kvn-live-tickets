# KVN branded access release — 2026-10-16

## Published
- Backend PR #70 merged as b41996e8bd06b130da887604ace8722e0b085751.
- Existing Render service deployed that commit; startup logs report live at 18:26:04 UTC.
- Website version 124 published from 2cb443d2f7854a795bf27bff93440eb8b2e55de9.
- Owner entry: https://kvnlive.com/command-center
- Member entry: https://kvnlive.com/member
- Sponsored owner view: https://kvnlive.com/command-center/sponsored-passes
- Personal referrals: https://kvnlive.com/affiliate/{handle}

## Verification
366 backend tests passed. GitHub backend and mobile-browser jobs passed on release head 6e6858a855c5277193b6dc5d81b0eda808dc2e2d. Website build and typecheck passed; 20 focused proxy/referral checks and 6 member/mobile interaction checks passed. Three preexisting website source/copy assertions remain (disciple-page-copy main/mobile CTA, revenue-impact coverage, shop-navigation Shop Drop001 source assertion).

Live branded owner and member login screens verified. Kiana referral resolved to https://kvnlive.com/links without leaving the branded domain. Render startup reconciled early_access_leads=7, partner_leads=6, kingdom_market_applications=0. No production financial records were migrated or reset. No customer emails were sent by this rollout.

## Remaining verification and coverage
The browser navigation-policy block during final owner-page reload prevented post-deploy signed-in report parity and actual owner/member activation verification. Do not claim those checks complete. KV Social activity and separate signing-site agreement activity are explicitly unavailable in the unified report; their existing systems remain separate. Source cards show status and last-success timestamp; expanded sourceCount/lastError presentation is deferred, with existing CRM source details still available.

## Implementation rulings
Dedicated feature checkouts were used instead of linked worktrees. Site exact routes were audited before edits. Website was published before backend redirect activation to avoid sending existing links to an unavailable route. Engine-host origin remains internal configuration for controller metadata; public destinations are canonical kvnlive.com. Native owner origin compatibility is preserved for existing operations. Upgrade and test-claim accounting were treated as correctness requirements and covered by regression tests.

## Review corrections
Fresh independent review findings were reproduced and fixed: complete checkout module graph, bodyless sign-out/DELETE compatibility, marketing unsubscribe GET/form/one-click handling, and report availability during upstream sync outages. Paid upgrades and their revenue are separate from paid ticket totals; synthetic launch claims and their comp orders are excluded.

## Recovery
Prior website version 122 remains the pre-change rollback point; existing backend pre-release main was 58fecb6efb9196156fe069b5f7ebd72e35f02ed6. Preserve DATA_DIR, existing owner/member credential files, and records during any rollback. Coordinate backend page redirects with website routes.
