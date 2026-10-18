# Issue #50 dependency security investigation — 2026-10-13

## Decision

**OAuth activation remains blocked.** This branch provides a reproducible, audit-clean dependency candidate. It does not identify or remediate the exact four findings in the deployed cached tree, and must not close issue #50. No production configuration, disk, database, campaign, deployment, or Controller switch was changed.

## Evidence and limits

- Source inspected: main `db51c6758a9092b158b981591958a9de8087617f` (PR #51). The repository had no tracked lockfile; `.gitignore` explicitly excluded `package-lock.json`.
- Render service `srv-da85qqc9v7es73enrokg`, KVN Live workspace: `npm install`, Node 24.14.1, auto deploy off, PR previews off, existing persistent disk mounted at `/opt/render/project/src/storage`.
- Render logs for PR #48 commit `845fc48f494b94b7ac26fee91f14042db0486a1f` at 01:19 UTC and PR #51 at 01:33 UTC show cache restoration, “up to date, audited 148 packages,” and “4 vulnerabilities (3 moderate, 1 critical).” The same counts appear in October 12 builds, before Controller Phase 1. This is evidence the warning predates that feature, not proof of an unaffected Controller.
- Logs contain no package names, advisory IDs, installed tree, or npm version. Cached dependency drift is a plausible explanation, not a proven root cause; advisory timing and npm/runtime differences are also unexcluded.
- A new isolated clone installed the existing manifest without changing any declared version range, using `npm install --ignore-scripts --no-audit --no-fund`. Development runtime: Node 24.19.0, npm 11.9.0; registry: https://registry.npmjs.org/.
- Full and production-only `npm audit --json` both exited 0 with zero findings. Full audit reports 148 total dependencies. Matching package counts do not establish matching versions. JSON evidence and complete resolved dependency paths accompany this report.
- `npm ci --ignore-scripts --no-audit --no-fund` successfully reconstructed the candidate lockfile tree. Install scripts were intentionally disabled during the local investigation. CI retains its existing normal install-script behavior using `npm ci`.
- The current tools expose Render logs/configuration, but not an authenticated runtime shell or deployed dependency export. No deployed lockfile was available. Therefore affected production packages, direct/transitive classification of those four findings, patched version minimums, and critical exploitability are **unknown**. Guessing advisory names from counts would be unsound.

## Exact candidate resolutions

The manifest is unchanged. These are newly resolved versions, not a verified before/after production upgrade list.

| Direct dependency | Scope | Locked version |
|---|---|---|
| dotenv | runtime | 16.6.1 |
| express | runtime | 4.22.3 |
| qrcode | runtime | 1.5.4 |
| stripe | runtime | 17.7.0 |
| svix | runtime | 1.99.1 |
| jsdom | development | 26.1.0 |
| playwright | development | 1.56.1 |

Relevant transitive paths in the clean tree:

- express → body-parser 1.20.8 → qs 6.16.0.
- express → qs 6.16.0; stripe → qs 6.16.0 (deduplicated).
- express → path-to-regexp 0.1.13; express → cookie 0.7.2.
- express → serve-static 1.16.3 → send 0.19.2.
- svix → standardwebhooks 1.0.0.

None is asserted to be one of the four deployed vulnerable packages.

## Production reachability review

Source review identifies where an eventual advisory must be traced:

- Express receives public HTTP traffic, dispatches routes, parses query strings, serves static content, and handles JSON bodies. Its request-processing transitive dependencies must not be dismissed as unreachable merely because they are transitive. `server.js` uses a global 2 MB JSON parser; owner-authenticated marketing import paths have a 24 MB parser. Limits are not universal vulnerability mitigations.
- `lib/marketing-engagement.js` calls `new Webhook(secret).verify(rawBody, headers)` from the public Resend webhook endpoint. Verification itself handles untrusted input, before event acceptance. svix and standardwebhooks are security-sensitive runtime paths.
- Stripe is used in checkout, webhook verification, and payment operations. QRCode is used in ticket QR generation. dotenv is loaded during startup.
- jsdom and playwright imports were found in test/browser-test code, not application runtime paths. They are declared development dependencies. This does not prove whether they are installed on Render or rule out build-time exposure.
- **Critical finding reachability cannot be determined until its package, exact version, advisory, and triggering operation are known.** A successful audit of a different tree is not a production exploitability assessment.

## Changes in this branch

1. Track the generated package-lock.json and remove its ignore rule.
2. Use `npm ci` in both existing GitHub Actions jobs, so tests evaluate the checked-in resolution.
3. Add `npm audit --audit-level=moderate` to the main test job; advisory service failure also fails the command. No exceptions or broad/forced upgrades.
4. Preserve package.json, application code, production build settings, Node versions, and data.

This is reproducibility hardening and a tested candidate, not a claim of targeted fixes for unidentified advisories. The complete lockfile fixes all transitive versions; its production delta must be reviewed against the deployed tree before release.

## Remaining evidence and release procedure

In an authorized read-only Render shell, capture the following from the deployed application directory without installing, updating, or starting the application. Do not export environment variables, storage files, credentials, or customer data. Audit sends dependency names/versions to the npm registry under its normal behavior.

```sh
node --version
npm --version
npm ls --all --json
npm audit --json
npm audit --omit=dev --json
```

Export the existing deployed package-lock.json (and, if needed, node_modules/.package-lock.json) without modifying it. If audit lacks a lockfile, do not generate one on the service: copy dependency metadata to a disposable development environment and reconstruct/compare there. Record service/deploy ID, commit, timestamp, commands and exit codes. npm audit can return nonzero when findings exist; retain that JSON.

For each finding, record GHSA/CVE, severity, exact installed package/version, every dependency path, direct vs transitive and runtime vs development scope, advisory's affected and patched ranges, and the actual reachable call with attacker-controlled data. Consult the upstream advisory; resolve the critical finding or document an explicit reviewed mitigation/acceptance. Prefer the smallest compatible parent dependency update; use an override only when supported and tested. Do not run blind `npm audit fix --force`.

After review, rerun full and production audits, automated tests, syntax checks and Chromium mobile tests on the locked tree. Confirm compatibility on Render's Node 24.14.1 as well as the established CI Node 20 (local verification here used 24.19.0). A later approved release should build with `npm ci` from the reviewed lockfile, preserving the existing disk and service; verify the installed versions and audit the actual deployed tree. Do not change Render settings or deploy as part of this investigation. Perform public and authenticated nonmutating smoke checks after that release, without executing campaign sends or changing scheduled work.

## OAuth gate (issues #49 and #50)

Before external ChatGPT Controller activation:

- Complete the exact deployed-tree inventory and advisory/reachability review, critical remediation or explicit security acceptance, remaining-risk record, passing CI and mobile checks, and post-release installed-tree audit and smoke evidence.
- Implement a supported revocable OAuth grant, minimum read scopes, per-action authorization, and server-side owner revocation/OFF enforcement. Existing Phase 1 endpoints and the ON/OFF UI do not supply this connection.
- Verify unauthorized access, wrong scopes, replay/idempotency, duplicate send prevention, scheduling gates, audit records, revocation, and fail-closed behavior.
- Require explicit approved recipient preview and release authorization for campaign sends; enforce consent, unsubscribe and suppression on the server. Do not reuse owner cookies or unrestricted tokens or include secrets/PII in aggregate reports.
- Keep refunds, payouts, bulk-contact mutations and production deployment separately approved. Preserve the existing scheduled campaign unchanged.

Sources: [#50](https://github.com/fjohnson21/kvn-live-tickets/issues/50), [#49](https://github.com/fjohnson21/kvn-live-tickets/issues/49), [PR #48](https://github.com/fjohnson21/kvn-live-tickets/pull/48), [PR #51](https://github.com/fjohnson21/kvn-live-tickets/pull/51), repository source at the commit above, and read-only Render build logs/service metadata retrieved on 2026-10-13.

## Verification completed locally

After reconstructing dependencies from the candidate lockfile:

| Check | Result |
|---|---|
| npm ci --ignore-scripts --no-audit --no-fund | Exit 0 |
| npm audit --json | Exit 0; all severities zero |
| npm audit --omit=dev --json | Exit 0; all severities zero |
| npm test | 303 passed; 0 failed/skipped |
| npm run check | Exit 0 |
| npm run test:mobile | 10 passed; 0 failed/skipped, Chromium mobile viewports |
| git diff --check | Exit 0 |
| Public production homepage GET | HTTP 200; availability check only, not authenticated or security validation |

Chromium was initially absent locally. The normal Playwright installation completed via its fallback download host, after which all mobile tests passed. Mobile tests use disposable fixtures, not production records or live email delivery. No real-device Safari coverage is claimed. Remote PR CI results are separate from these local results.
