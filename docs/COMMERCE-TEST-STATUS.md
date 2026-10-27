# Commerce test checkpoint — 2026-10-13

- Draft implementation PR: https://github.com/fjohnson21/kvn-live-tickets/pull/53
- Isolated Render service: `srv-db73pq0u01pc73c5vd7g`, `kvn-commerce-test`, free plan, Virginia, auto-deploy off.
- Service dashboard: https://dashboard.render.com/web/srv-db73pq0u01pc73c5vd7g
- Backend URL: https://kvn-commerce-test.onrender.com
- Deployed commit: `7f2f6314602a175e3219020c7748e53dec81a614`.
- Verified GET `/api/customer-checkout/config`: HTTP 200, `enabled: false`, empty publishable key.
- Fresh backend test run: 319 passed, zero failures. Targeted checkout/recovery tests: 16 passed.
- Initial deployment failed because `npm ci` requires a lockfile. Added a lockfile from the existing installed dependencies; `npm ci --dry-run --offline` passed and Render deployment subsequently succeeded.
- Service starts with an empty store in `/tmp/kv-commerce-test`; no production data, payment credentials, or email credentials were copied. This free service has ephemeral data and is only suitable for disposable QA.

## Remaining integrated-test setup

1. Add `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` for test account `acct_1TDC2f2MckzjcvLd` directly in this test service's Environment settings. Never paste secret keys into chat. Do not enable checkout yet.
2. Configure a test webhook and its `STRIPE_WEBHOOK_SECRET`; verify signed events and asynchronous payment handling before release.
3. Seed an explicitly synthetic event/catalog, configure the authenticated commerce bridge, and connect an isolated branded website preview. The current return URL allowlist only permits kvnlive.com and www.kvnlive.com; staging needs an explicit safe configuration change, not use of the production website.
4. Complete success, decline, 3DS, cancellation/recovery, inventory reservation, and webhook reconciliation tests. Check mobile branded UI with an approved browser QA environment.

Prior Stripe connector verification created and retrieved a test embedded session; it did not complete a payment. Full end-to-end payment, customer confirmation, and mobile branded UI are not yet verified. Production was not deployed or modified by this test-service setup.
