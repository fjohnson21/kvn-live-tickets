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
