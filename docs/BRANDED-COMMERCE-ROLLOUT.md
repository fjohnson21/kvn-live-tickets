# KV branded commerce — staged, not deployed

This backend supports the approved website source at commit 098dc997c41b9a88ed8b2484c78086166659a89f, saved as Sites version 114. The website remains unpublished. KV Tix remains the system of record. No production storage migration or reset is included.

The original unpublished backend checkout was removed by automated workspace maintenance. This branch reconstructs its approved interfaces and review fixes from the retained design, website source, and conversation record. The original commit IDs and original test counts do not describe this reconstruction. Current checks: 319 backend tests pass, including HTTP middleware retry/rollback cases for ticket, apparel and donation, inventory retention, verified reconciliation, hosted compatibility, and authenticated proxy client identity. npm run check and git diff --check pass.

## Required configuration

- Backend EMBEDDED_CHECKOUT_ENABLED defaults off.
- STRIPE_PUBLISHABLE_KEY must match the mode and account of the existing server Stripe credential. Never replace live credentials with test credentials on the production service.
- CUSTOMER_PUBLIC_ORIGIN defaults to https://kvnlive.com. Existing BASE_URL/webhook settings remain unchanged.
- Configure the same high-entropy COMMERCE_BRIDGE_SECRET securely on Sites and backend before publishing the claims bridge. It authenticates timestamped HMAC client buckets derived from Cloudflare's authoritative CF-Connecting-IP.
- Website BRANDED_COMMERCE_ENABLED defaults off. The proxy marks disabled creation requests recovery-only. Existing request/session recovery remains available when creation is disabled.

## Stripe provider checks — October 13, 2026

The connected account acct_1TDC2f2MckzjcvLd is explicitly test mode; the separately connected live account was not used. A test-only $39.99 embedded Checkout session was created and retrieved successfully. It returned an embedded UI mode, a client secret, no hosted checkout URL, the expected amount, and the KVNLive.com confirmation return URL. No customer email or production order metadata was supplied. The session remains unpaid and automatically expires; no real charge, ticket, or customer email was created.

This proves provider session creation and retrieval, not full website integration. The connector used API specification 2026-09-30.preview with ui_mode=embedded_page. This existing backend retains Stripe 17.x and ui_mode=embedded under the approved no-broad-upgrade constraint. Response handling recognizes both names, but SDK-specific creation still needs a real test-mode run through the application. No Stripe API key was obtained or stored in this repository.

The connected API operation search exposed Checkout creation/retrieval but did not expose the requested payment confirmation or expiration writes. Browser dashboard sign-in was independently blocked on CAPTCHA. Do not report success, decline, 3DS, refunds, webhook delivery, or mobile iframe testing as completed.

## Remaining release gates

Use a separate non-production deployment with an isolated DATA_DIR and test Stripe credentials from the same account. Disable outbound mail or use a controlled test sink. Securely configure a test webhook signing secret and bridge secret. Run success, decline, 3DS, duplicate request/webhook, interrupted response, expiration, refund/review, two-pass sponsored upgrade, apparel tax/shipping and Disciple attribution through the actual branded UI. Verify wallet/payment-method domains and mobile rendering in a supported browser environment. Preserve all production order and ticket data.

Deploy backend compatibility with creation off first; publish website with navigation off; enable only after the gates pass. Disabling new creation must preserve status/recovery. Keep old hosted sessions and Render URLs operational. Ambiguous requests older than the idempotency recovery window require owner reconciliation before a replacement session.
