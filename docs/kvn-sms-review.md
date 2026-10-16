# KVN SMS review and implementation decisions

Independent review: gpt-6-astra, read-only. Five Important findings accepted and fixed with reproducing tests, no Critical findings. Final backend437/437 and affected Site14/14 pass; syntax, Site typecheck, build and public asset parity pass. Browser tests blocked by missing Chromium; account/sender/credentials and live recipient test unestablished; publication blocked. See kvn-sms-release.md and kvn-twilio-setup.md.

## Rulings I made

The initial suspected baseline-timeout ruling below was superseded after the new SIGTERM handler was identified and fixed. Normal full suites now pass; no baseline waiver remains. All decisions are retained in original order.

- Ruling: Restore approved documents from conversation after pruning — source checkout and approved scope remain intact in GitHub/conversation — cost if wrong is omitted detail, mitigated by eight-task/interface/limit cross-check.

- Ruling: Live account, sender and credential setup are not established — ship reviewed disabled readiness per approved spec and do not send real SMS — cost if wrong is delayed activation, not unsolicited delivery.

- Ruling: Fresh baseline hits known local spawned-auth server timeouts (owner password creates HTTP-only secure cookie; logout invalidates owner session); unchanged current main previously passed CI. Continue isolated SMS fixtures, require fresh remote full/mobile CI before publishing — cost if wrong: release blocked by CI instead of masking product regression.

- Ruling: Task4 factory accepts optional env dependency in addition to planned arguments — required for deterministic tests and the same server-side sending gate in both service/routes — cost if wrong is constructor integration mismatch, covered by integration tests.

- Ruling: Provider queued state is queued_provider, distinct from local unsent queued — prevents callbacks or accepted responses turning a submitted attempt into a new send — cost if wrong is a report-label mismatch, covered by dispatcher/UI tests. Sender fingerprint moved to shared model for release/dispatch consistency.

- Ruling: Pause endpoint also accepts explicit resume=true; reconciliation injected into routes — makes paused campaigns operable and known provider IDs reviewable without new sends — cost if wrong is unexpected resumed dispatch, guarded by owner/revision/sending/permission tests. SMS report periods use existing Eastern boundaries. Draft/review race reproduced and fixed with UI generation checks (RED→GREEN).

- Ruling: Site changes are verified locally but source packaging/publication is deferred with the backend push — automatic approval review rejected publication, and deploying the gateway ahead of its backend would break access — cost if wrong is delayed availability; neither production is changed.

- Ruling: Keep mobile/remote CI and actual Twilio activation as release gates instead of claiming completion — local Chromium absent and publication denied, account unconfigured — cost if wrong is delayed release, with no live send risk. Local normal node --test431/431 passed; check/SMS syntax clean; Site build with asset parity clean. Both mobile widths attempted and failed solely on absent executable. No download/browser workaround used.

- Ruling: Correct plan's unconditional153/67 multipart assumption for toll-free senders — official Twilio documentation requires152/66, and complete two-unit characters cannot be split — cost if wrong is a conservative unit estimate; actual charges still require provider evidence. Campaign service now supplies the sender to the estimator.

- Final: Ruling: Actual account ownership, sender registration, billing and real delivery were declined by reviewer — remain unverified and disabled, as approved scope allows — cost if wrong is delayed activation.

- Final: Ruling: Actual320/390px rendering was declined by reviewer — retain attempted browser tests as CI release gate because Chromium absent — cost if wrong is delayed mobile verification.

- Final: Ruling: Three baseline homepage failures were declined by reviewer — leave unrelated pages untouched after reproducing all3 on original source — cost if wrong is continuing preexisting website test failures, disclosed in release record.

- Final: Ruling: Publication authorization/deployment success were declined by reviewer — preserve local reviewed changes and request named-public-repository approval after denied pushes; no workaround — cost if wrong is delayed publication.

## Deferred minors

- Final: minor (deferred): Format compressed SMS modules consistently; deferred as auditability polish after the behavioral fixes, with maintenance/readability cost.
