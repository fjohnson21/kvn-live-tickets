# LuxRide payment bridge

Disabled by default. No ticket/order-store changes; rides retain their own database and calendar in LuxRide. The bridge uses the engine's Stripe client and requires its account to match LUXRIDE_STRIPE_ACCOUNT_ID (KAP). Do not point it at another merchant's key.

Configure the same random 32+ byte secret in KVN LUXRIDE_BRIDGE_SECRET and LuxRide KVN_BRIDGE_SECRET. KVN requires LUXRIDE_RETURN_ORIGINS (comma-separated exact HTTPS origins), LUXRIDE_CALLBACK_ORIGIN (one canonical HTTPS origin), and LUXRIDE_BRIDGE_ENABLED=true. LuxRide requires PAYMENT_PROVIDER=kvn, KVN_PAYMENT_ORIGIN, SITE_ORIGIN, STRIPE_ACCOUNT_ID, STRIPE_LIVE_MODE. Keep PAYMENTS_ENABLED=false until integration tests pass.

Stripe webhook must subscribe to checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired. Existing raw signature verification runs before forwarding ride events. Callback errors fail webhook delivery for Stripe retry. Ride events never enter ticket finalization.

Domain migration: verify DNS/TLS first; add new exact origin to return allowlist while retaining the old origin for active checkouts; update SITE_ORIGIN and callback origin. Keep old payment return links working until previous sessions settle. No request-supplied callback URLs or wildcard origins. Owner-private Sites cannot receive external callbacks; public routing or a controlled test endpoint is required.

Required before launch: sandbox payment/decline/expiry and callback-retry tests, merchant verification, public callback accessibility, customer policies, secure configuration. No live payment has been tested by this change.
