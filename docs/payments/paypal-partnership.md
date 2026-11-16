# PayPal partnership checkout

This integration applies only to `/api/donations/checkout`. Ticket, shop, and existing Stripe session verification routes remain unchanged. The website accepts the hosted PayPal approval URL and confirms at `/give/paypal`.

## Configuration and activation

Render workspace: KVN Live. Production service: kvn-live-tickets (`srv-da85qqc9v7es73enrokg`).

- `PAYPAL_CLIENT_ID`: Live client ID for the owner-approved MyApp_FindCommunity_Inc_ app.
- `PAYPAL_CLIENT_SECRET`: enter directly in Render's environment settings; never commit or share in chat.
- `PAYPAL_ENVIRONMENT`: `live` (use separate sandbox credentials and `sandbox` for provider testing).
- `PAYPAL_WEBHOOK_ID`: ID returned after creating a webhook in the same app/environment.
- `PARTNERSHIP_PAYMENT_PROVIDER`: leave unset or `stripe` until provider testing and configuration are complete. Set `paypal` only when ready to switch new partnerships.

Webhook URL: `https://kvn-live-tickets.onrender.com/api/donations/paypal/webhook`.
Subscribe to CHECKOUT.ORDER.APPROVED, PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.REFUNDED, PAYMENT.CAPTURE.REVERSED, PAYMENT.CAPTURE.DENIED.

The public client ID is configured separately from source. The client secret and webhook ID are still required. No real or sandbox PayPal transaction has been performed during implementation. Test approval, cancellation, pending capture, duplicate return/webhook delivery, and refund in a sandbox before live activation. Confirm the receiving business in PayPal. A controlled live payment requires the owner's authorization; verify its capture, local donation record, receipt and actual available balance.

## Behavior and recovery

Server validates $100, $250, $500 minimum and custom $2–$10,000 gifts. It persists recognition details and a pending record before creating the PayPal order. The same request ID and payload reuse the original order; changed amounts are rejected. PayPal create/capture requests use stable idempotency keys. Uncertain create attempts older than five hours require owner review.

The browser return carries a private key in the URL fragment. The server fetches the order from PayPal and captures approved orders; completed captures must match the local donation, USD currency and exact amount before a receipt is sent. Signed webhook verification provides capture/reconciliation if the donor closes the browser. Refunds and reversals are flagged for review. Receipts use the existing donation receipt sender. Payouts and automatic Disciple commissions are not introduced by this payment-provider change; the existing donation path did not calculate commissions.

The store uses the application's existing single-instance JSON persistence model. Do not horizontally scale this service without shared transactional storage/locking. Network failures leave pending records for same-request recovery. Review uncertain or old pending payments in PayPal before requesting another payment.

Rollback new checkouts by setting `PARTNERSHIP_PAYMENT_PROVIDER=stripe`. Keep PayPal credentials and webhook enabled to reconcile existing PayPal orders. Do not remove existing Stripe credentials.

## Owner encrypted-entry portal

Open `https://kvnlive.com/command-center/paypal-setup` while signed in as the KVN owner. The browser encrypts the secret using a server-generated RSA-4096 OAEP SHA-256 public key and a five-minute, single-use nonce bound to the owner session. The server checks PayPal OAuth before saving. It never returns the supplied secret or access token. HTTPS, owner authentication, same-origin JSON validation and no-store responses protect the route.

The secret is stored on the existing persistent Render disk as `paypal-secret.enc` with mode 0600 and AES-256-GCM authenticated encryption. `PAYPAL_SETUP_MASTER_KEY` is a separate 32-byte base64 key held in Render environment settings, never source or the store JSON. The encrypted file is bound to the configured client ID and environment. Back up the encrypted file and master key through existing secure operations; do not rotate/delete the key while relying on the saved secret. The vault loads the decrypted secret into process memory on startup. Encryption does not protect against compromise of the running server or an authorized owner account.

Saving does not enable checkout, register a webhook, or move funds. PayPal setup still needs the webhook ID and provider testing before activation.
