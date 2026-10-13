# KVN Controller API — Phase 1 (owner-session read-only)

KVN Live Tickets Command Center remains the system of record. This phase adds three read-only, aggregate reporting endpoints:

- GET /api/controller/v1/overview: paid ticket orders and revenue (cents), active tickets, sponsored-pass claims, upgrades, apparel, disciples, and campaign counts.
- GET /api/controller/v1/audiences: list totals, opt-in counts, unknown permissions, provider-suppressed eligibility.
- GET /api/controller/v1/campaigns: campaign statuses and aggregate delivery, open, click and bounce counts where webhook data exists.

## Security

- Routes require both the existing session authentication and owner authorization. No CORS, public access, bearer-token query parameter or unscoped credentials.
- No recipient emails, names, addresses, phone numbers, QR codes, ticket codes, or order-level customer records are returned.
- Responses disable caching and only read the production store. No production order, ticket, campaign, CRM, or journal mutations.
- Suppression-unknown audiences expose eligibleAfterProviderSuppression: null, never a misleading safe-to-send count.
- No sending, refunds, check-ins, inventory edits, or payouts are included.

## Owner ON/OFF switch (Super Admin)

- Super Admin → **ChatGPT Controller Access** provides an owner-only ON/OFF switch.
- **OFF is the default** for existing and new production installations. No migration automatically enables it.
- OFF blocks all three Controller reporting endpoints with HTTP 403, checked against the live persisted value on **every** request. The status endpoint remains available to the authenticated owner so the switch can be turned back on.
- ON permits only the existing owner-session, read-only Controller reports. It **does not** connect ChatGPT, authorize OAuth, or grant sending/refund privileges.
- Changes require the existing owner session, same-origin browser request, boolean state and matching revision; each actual change produces an audit log entry. A stale revision returns 409 and cannot overwrite a newer decision.
- The setting persists in the existing protected `store.json` under `settings.controllerAccess`. Only this setting and an audit entry change; orders, contacts, pass claims, prices, commissions and email preferences are untouched.
- Future OAuth connector middleware must check this setting on each request and bind grants to an access revision; toggling OFF must invalidate external access as well as block these reports. **Do not represent OAuth revocation as implemented until Phase 2 is complete.**
- This switch has **no effect** on normal dashboard operations, existing API integrations, email delivery, or the separately scheduled KAP marketing campaign.

## Connecting chat is a separate phase

These routes alone do NOT give ChatGPT direct API access. The current phase is accessible using an existing authenticated owner session. Before direct AI-to-Command-Center control, implement a narrowly scoped OAuth connector with revocable access, audited actions, explicit approval for bulk sends or funds, and no owner-password sharing.

## Campaign controls

KV Tix Marketing owns the audience, permission, unsubscribe and campaign history; Resend handles delivery/tracking. Paid buyers with marketing permission unknown are NOT eligible until opt-in can be established. Verify real eligible recipient counts, suppression, content, approved time and duplicate-send protections before any campaign launch. The scheduled October 13 release is an execution check, not a promise of sending to an unverified audience.

## Validation and production rollout

1. Run npm test and npm run check.
2. Review the PR and verify owner-only requests while signed in. Unauthenticated/non-owner requests must be rejected.
3. Compare the counts to the Command Center, and inspect responses for PII.
4. Preserve the existing Render service and mounted production disk; do not deploy seed data or create a replacement service.
5. Deploy only after successful checks and review.
6. Plan the separate OAuth action connector before enabling unattended control.
