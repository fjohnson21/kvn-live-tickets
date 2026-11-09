# KV Tix dependency security review — November 9, 2026

Status: targeted dependency remediation prepared for review; NOT approved for production. No merge, deployment, production configuration, live records, payments, persistent storage or campaigns changed.

Base: `69604dd0a9a04106fbd0a999402b0293b89eb74e` (main, rechecked during review).
Branch: `security/issue-50-audit-2026-11-09`.
Related: [#50](https://github.com/fjohnson21/kvn-live-tickets/issues/50), [#49](https://github.com/fjohnson21/kvn-live-tickets/issues/49).

## Current findings and reachability

| Dependency path | Locked before → after | Advisory | Application assessment |
| --- | --- | --- | --- |
| Express 4.22.3 → body-parser | 1.20.8 → 1.20.9 | [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828), high, CVSS 7.5 | Reachable in repository configuration: global `express.json({limit:'2mb'})` parses requests before authentication; Stripe webhook uses `express.raw({type:'application/json'})`. Default decompression permits a valid compressed frame followed by trailing bytes to cause an uncaught decoder error. Both parser configurations crashed in isolated local child processes before the patch and survived afterward. Treat as a high availability risk if the vulnerable version/configuration is deployed; no attack or exploit test was sent to production. |
| Express → qs; Express → body-parser → qs; Stripe 17.7.0 → qs | 6.16.0 → 6.16.2 | [GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw), moderate, CVSS 5.3; first patched 6.16.1 | Vulnerable package present. Exploit requires attacker-influenced input serialized with `arrayFormat:'comma'`. No application usage of that option was found. Stripe uses `indices`/`repeat`; Express uses parsing. No reachable application exploit established. Patch update removes the latent vulnerable dependency and passes the malicious-own-toString regression. |

`npm update body-parser qs --package-lock-only --ignore-scripts --no-audit --no-fund` changed only version, resolved URL and integrity for these two packages. No package.json, direct dependency, Express/Stripe/SVIX major, application code or production setting changed. qs 6.16.2 is a compatible patch within all parent ranges. Clean `npm ci --ignore-scripts` verified the lockfile installation.

Fresh full-tree audit: before 1 high + 1 moderate, 0 critical; after 0 known vulnerabilities. Production-only audit also reports 0. JSON evidence is adjacent. An npm audit is advisory coverage, not proof that the application has no vulnerabilities.

## Historical finding reconciliation

The October 13 issue recorded only aggregate counts, without package/advisory identities. Commit `845fc48f494b94b7ac26fee91f14042db0486a1f` has no package-lock.json in Git; a lockfile was introduced afterward (`0985fd8`) and updated October 19 (`d11879e`). Reinstalling today's ranges would not reproduce the exact October 13 deployment tree.

The current two advisories were published October 22 and October 14 respectively, after the original build warning. They cannot be identified as the original four findings. No critical finding is reported against today's locked tree, but specific historical package-by-package resolution cannot be proven from the available record. Keep #50 open until acceptance and deployment verification.

## Validation

- Three new dependency regressions: 0/3 passed before updating dependencies (both parsers crashed; qs threw), 3/3 passed afterward.
- Focused dependency, shared KAP owner identity/revocation/failure, owner authentication, production security, Controller access and marketing webhook checks: 42/42 passed.
- `npm run check`: passed. `git diff --check`: passed.
- `npm test`, Node 24.22.1: 557 passed, 2 failed, 559 total.
- Node 20.19.0 (render.yaml runtime), `node --test`: 557 passed, 2 failed, 559 total.
- Original locked dependency baseline, with the same offline KAP test isolation: 552 passed, 2 failed, 554 total. Both failures match the patched tree; five added security cases explain the count difference.

Pre-existing failures, intentionally not hidden or corrected in this dependency patch:
1. `test/links-sales-routes.test.js`: "both tiers ignore retired partner tracking while payment and fulfillment remain idempotent" expects paid GA checkout HTTP 200; current free sponsored GA behavior returns 409 with the free-claim URL.
2. `test/luxride-trip-updates.test.js`: "departure explicitly labels estimate and never claims live tracking or five minutes" expects old `not live GPS` wording; current copy offers live location when the driver enables sharing.

### Safe authentication test isolation

Recent shared KAP login made existing local tests capable of submitting fixture credentials to the external KAP service. Automatic review blocked that test path. Every server subprocess fixture now preloads `test-support/offline-kap.mjs`, which returns a local 503 for that origin, exercising existing legacy local authentication without external credential transmission. Separate dependency-injected tests exercise shared owner acceptance, non-owner rejection, revocation and failure. The stub is test-only and is never loaded by npm start. No live KAP account or credential was used to validate shared authentication.

## Remaining release gates

- Resolve or explicitly review the two existing test failures; do not call this an all-green suite.
- Finish the mobile-browser matrix in an environment with supported libraries; see browser results below.
- Verify the actually deployed commit, Node runtime and installed dependency tree through authorized deployment evidence. Repository findings do not establish current production versions or exposure. Render read access required workspace selection, so deployment state was not independently verified.
- Obtain Frank Johnson's explicit approval before production merge, deployment or configuration changes. Do not enable Controller OAuth based solely on this audit: #49's scoped authorization, revocation, replay prevention, action approval and production-data safeguards remain separate acceptance requirements.
- Following an approved deployment, verify branded ticket selection, free GA claim, authorized check-in, login, and payment/webhook health with approved test records. Preserve the existing persistent disk and all records. A code rollback must never restore or replace production data; rollback to the old lockfile would reintroduce the parser risk.

## Browser results

- `CHECKIN_BROWSERS=chromium npm run test:mobile`: 23 passed, 2 failed, 25 total. Check-in cases passed at 320px and 390px, including duplicate/refund/replacement protection, authorization, QR fallback, camera denial, and network recovery. Separate check-in-only run: 7/7 passed.
- Two Chromium sponsored-claim assertions (`browser-tests/sponsored.spec.mjs`, 320px and 390px) expect $79.98 for two passes; current UI displays $78.00. Baseline comparison is recorded below.
- The unrestricted mobile run did not finish and was interrupted. Firefox launches, but its isolated check-in run exceeded a 45-second timeout (exit 124); no Firefox pass claimed.
- WebKit cannot launch because system libraries are missing. `playwright install-deps` failed on environment setgroups/setuid permissions. No Safari/WebKit pass claimed. Full matrix remains a release gate.

Review delivery uses a separate branch. No pull request was opened because automatic Render preview-deployment settings could not be verified without workspace selection; this avoids initiating an unapproved preview deployment. The repository's observed GitHub workflow runs tests on PRs and main pushes, not this branch push.

Original-dependency Chromium mobile baseline: 23 passed, 2 failed, 25 total, with the identical $79.98-versus-$78.00 assertions at both widths. These failures predate this dependency update. No application pricing or ticket behavior was changed to satisfy old assertions.
