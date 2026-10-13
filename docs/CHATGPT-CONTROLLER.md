# KV Tix ↔ ChatGPT Controller (OAuth-protected MCP)

This is the connector for the existing KV Tix Command Center, **not** a new email list or an alternative marketing system. KV Tix remains the canonical audience, consent, suppression and campaign ledger. Resend delivers email through the existing background runner.

## Endpoint

- Production MCP URL: `https://kvn-live-tickets.onrender.com/mcp`
- OAuth resource metadata: `https://kvn-live-tickets.onrender.com/.well-known/oauth-protected-resource`
- MCP implementation: `lib/controller-mcp.js`
- ChatGPT tools: `kvn_audiences`, `kvn_campaigns`, `kvn_campaign_preflight`, `kvn_campaign_status`, `kvn_start_campaign`

When not configured the resource metadata returns HTTP 503 and the MCP endpoint denies all calls. Installing this feature never starts or resumes a marketing campaign except campaigns already explicitly started and marked autoRun by their owner.

## Identity provider configuration (required external owner setup)

Use a trusted OAuth 2.1/OIDC provider such as Auth0/Okta that supports:
- Authorization code + PKCE (S256), metadata discovery, refresh tokens and OAuth resource indicator.
- RS256 signed JWT **access** tokens (not ID tokens) with `iss` matching the configured issuer and `aud` containing `https://kvn-live-tickets.onrender.com/mcp`.
- `scope` containing `kvn:read` for reporting and `kvn:send` for approved sends. Issue refresh tokens via `offline_access` or equivalent.
- Client ID Metadata Documents or dynamic client registration, or register the exact ChatGPT client ID and redirect URI from ChatGPT's connection management screen.
- A stable owner identity `sub` claim. **Only that subject may authenticate this connector.** Do not use the email address as a substitute for subject.

Add these to the **existing** `kvn-live-tickets` Render service environment, not to GitHub, ChatGPT messages or the repository:

| Variable | Value |
|---|---|
| `KVN_CONTROLLER_OAUTH_ISSUER` | Exact HTTPS issuer identifier from your identity provider; preserve trailing slash if present |
| `KVN_CONTROLLER_OAUTH_JWKS_URL` | Exact HTTPS JWKS URL published by your provider |
| `KVN_CONTROLLER_OAUTH_OWNER_SUB` | The approved owner's exact `sub` value |
| Existing `RESEND_API_KEY` | Must remain configured; never replace the sender |
| Existing `RESEND_MARKETING_WEBHOOK_SECRET` | Required for preflight and suppression verification |

**Do not enable Controller access until the identity provider configuration has been verified.**
Sign in to Super Admin and turn Controller ON only for an authorized test. Turning it OFF blocks all MCP calls immediately; it does not revoke the provider's tokens, so also revoke the OAuth app/token at your identity provider if access was compromised.

## ChatGPT connection

1. Use a ChatGPT account/workspace with custom MCP app support and required write-tool permissions.
2. Create an approved custom app using the MCP URL above. Choose OAuth with the configured identity provider.
3. Review and approve requested scopes. Sign in using the configured owner identity. ChatGPT may require app/tool confirmation for sends.
4. In a new chat, select the custom app and invoke `kvn_audiences` and `kvn_campaigns`. Those must work before the sending scope is granted.
5. Create or inspect the exact campaign draft in KV Tix. For the KAP-sponsored 500-pass campaign use only the **Ticket Buyers** list, the approved banner URL, subject `KAP is buying your ticket to KV Live`, and CTA `https://www.kvnlive.com/promo`.
6. Invoke `kvn_campaign_preflight` with the saved draft's `campaignId`. It returns eligible subscribed recipients **without email addresses**, the exact count, approved artwork/CTA, and duplicate-campaign blockers. A send token is returned only when ready.
7. With the owner's explicit permission, call `kvn_start_campaign` passing the exact `campaignId`, fresh `preflightToken` (valid up to 5 minutes), and `expectedRecipientCount`. This queues exactly one KV Tix campaign. Never substitute a Resend broadcast.
8. Use `kvn_campaign_status` to review provider accepted, delivered, opened and clicked separately; accepted is *not* delivered.

## Important limits and safeguards

- Production customer and order records remain in the existing persistent KV Tix store; no backfill or migration is required.
- Only `subscribed` contacts with evidence of permission, correct list membership, nonarchived records, no block in KV Tix's verified Resend webhook journal, and no entry on Resend's complete provider-wide suppression list qualify. Duplicate emails are deduplicated.
- The connector fetches **every page** of the Resend suppression list at preflight and again at launch, then combines it with the verified webhook journal and KV Tix permission history. Unavailable, incomplete, or failed suppression API responses block launch. During actual delivery, the existing background runner checks the webhook-derived blocks before each recipient and the Resend provider itself enforces its suppression list.
- Missing provider settings, ambiguous delivery evidence, changed audience, altered draft, absent mailing address, duplicate campaigns, unknown authorization or disabled Controller all fail closed.
- Changing or refreshing the draft requires a new preflight. Sending a campaign twice is blocked; provider message IDs remain in KV Tix for reconciliation.
- `kvn:send` is a powerful permission. Limit app publication to the owner and leave write confirmations enabled.
- This integration cannot be considered **fully connected** until real OAuth linking, authenticated tool calls and a synthetic end-to-end test have passed. A code merge or Render deployment does not establish user consent or connected-app registration.

Authoritative specifications: https://developers.openai.com/plugins/build/auth and https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
