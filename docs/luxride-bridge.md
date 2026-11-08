# LuxRide payment bridge

Disabled by default. No ticket/order-store changes; rides retain their own database and calendar in LuxRide. The bridge uses the engine's Stripe client and requires its account to match LUXRIDE_STRIPE_ACCOUNT_ID (KAP). Do not point it at another merchant's key.

Configure the same random 32+ byte secret in KVN LUXRIDE_BRIDGE_SECRET and LuxRide KVN_BRIDGE_SECRET. KVN requires LUXRIDE_RETURN_ORIGINS (comma-separated exact HTTPS origins), LUXRIDE_CALLBACK_ORIGIN (one canonical HTTPS origin), and LUXRIDE_BRIDGE_ENABLED=true. LuxRide requires PAYMENT_PROVIDER=kvn, KVN_PAYMENT_ORIGIN, SITE_ORIGIN, STRIPE_ACCOUNT_ID, STRIPE_LIVE_MODE. Keep PAYMENTS_ENABLED=false until integration tests pass.

Stripe webhook must subscribe to checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired. Existing raw signature verification runs before forwarding ride events. Callback errors fail webhook delivery for Stripe retry. Ride events never enter ticket finalization.

Domain migration: verify DNS/TLS first; add new exact origin to return allowlist while retaining the old origin for active checkouts; update SITE_ORIGIN and callback origin. Keep old payment return links working until previous sessions settle. No request-supplied callback URLs or wildcard origins. Owner-private Sites cannot receive external callbacks; public routing or a controlled test endpoint is required.

Required before launch: sandbox payment/decline/expiry and callback-retry tests, merchant verification, public callback accessibility, customer policies, secure configuration. No live payment has been tested by this change.

## LuxRide booking notifications

Signed `notify` requests verify a paid Stripe session, matching amount, currency,
order reference, customer email, and pilot flag before dispatch. LuxRide uses the
existing Resend and SMS transport credentials. Add `LUXRIDE_OWNER_EMAIL` for the
owner alert and reply-to address. Optional `LUXRIDE_EMAIL_FROM` overrides the
verified-domain default `LuxRide Airport Transit <luxride@tickets.kvnlive.com>`.

The initiative code is **LUXRIDE**. This is a message/reference code, not a newly
provisioned inbound TXT180 keyword. Existing sender-level STOP/HELP behavior is
shared with the provider's configured keyword. No KVN marketing consent or CRM
campaign enrollment is created. Records live in `luxrideNotifications`, separate
from KVN ticket/email/SMS campaign records. Booking SMS consent is explicit and
optional, with timestamp and disclosure version. TXT180 opt-outs and existing
local withdrawals are checked before sending. Provider acceptance is not proof
of handset or inbox delivery. TXT180 has no delivery receipt in this integration.

The read-only readiness endpoint checks live SMS authentication and presence of
email configuration; no messages are sent by this check. Sites gates new checkouts
on readiness. Actual end-to-end delivery still requires the owner's booking test.

Each rider email, owner email, and rider SMS has a persistent per-booking record.
Concurrent/replayed callbacks do not duplicate accepted messages. Email retries
use Resend idempotency and stop for review before its 24-hour window expires.
Uncertain SMS submissions and process-interrupted submissions require manual
provider review before a resend. Failed/retryable attempts are visible in the
LuxRide dashboard and can be retried by checking payment and notifications.
Scheduled reminders and inbound keyword provisioning are not implemented here.

Private Sites callbacks use `LUXRIDE_SITE_ACCESS_TOKEN` only when the exact
callback origin matches `LUXRIDE_SITE_ACCESS_ORIGIN`. Keep these paired when
moving to a custom domain. This supersedes the earlier private callback limitation.
