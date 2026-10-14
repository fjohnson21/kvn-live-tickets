# KV Social — private-beta release checklist

**Deployment boundary:** KV Social is a separate Render service on the dedicated Social branch. Do **not** merge any Social branch to `main` as part of this release and do not modify the KV Tix web service, Stripe, ticket/order storage, or Command Center.

## Infrastructure

- Render workspace: **KVN Live**
- Social service: [kv-social-beta](https://dashboard.render.com/web/srv-db7q0grrjlhs73cjttf0)
- Social database: [kv-social-dev](https://dashboard.render.com/d/dpg-db7pr43ncjis73f5tfag-a)
- Service hostname before DNS: `https://kv-social-beta.onrender.com`
- Proposed branded hostname: `social.kvnlive.com`
- Deployment must use a **production** `NODE_ENV` and the Postgres store. Local file storage is forbidden in production.

## Secure configuration — enter directly in Render, never in tickets/CRM or chat

1. Open the database page in Render. In **Connections**, copy the **internal** database URL; paste it as `DATABASE_URL` on the **Social** web service only. Do not copy an external URL into public files or source control.
2. In Resend, create a **sending-only** API key restricted to the already verified `tickets.kvnlive.com` domain. Save it in the **Social** service as `RESEND_API_KEY`. Do not reuse the ticket-confirmation key.
3. Set `KV_SOCIAL_OWNER_PASSWORD` to a unique, strong random password in Render. Do not reuse KV Tix administrator credentials.
4. Set `KV_SOCIAL_INVITE_CODE` to an independently random private beta code (prefer 32+ characters); keep it private.
5. Verify nonsecret settings `KV_SOCIAL_OWNER_EMAIL`, `KV_SOCIAL_EMAIL_FROM` and `NODE_ENV=production`.
6. Keep **Auto Deploy disabled** during setup. Deploy only after credentials are securely set, and verify `GET /healthz` responds with 200 on the Social service (without disclosing secrets). The setup-pending fallback deliberately responds 503 until configuration is complete.

## Required before *real* beta invitations

- Upgrade the development **free** Postgres database to a durable paid plan before allowing real accounts; its development expiration is **2026-11-13**.
- Confirm Postgres backup/restore plan and how to recover a user's Social data. A free development database is disposable, not a permanent account system.
- Run end-to-end delivery tests using a test mailbox: registration, verify-email link, explicit confirmation click, replay rejection, login, reset-password email and one-time reset.
- Confirm moderation coverage: an assigned reviewer, backup reviewer, report escalation and response process.
- Test post/photo submission, moderator approval, image access before/after approval, report, removal, appeal and suspension.
- Validate on physical iPhone Safari and Android Chrome, including registration links opened from email.
- Review community guidelines, privacy notice, age restrictions, deletion/export support and consent handling. Existing test wording is not a substitute for approved legal notices.
- Audit the service before wider exposure. Persistent JSONB Social state and embedded photo data are adequate only for a *small, controlled beta*, not for broad public scale.

## Custom domain

In the Social Render service, add `social.kvnlive.com` under **Settings > Custom Domains**. Render will display the DNS records for the actual domain. Add those records at the domain's DNS provider and wait until HTTPS verification succeeds. Do not change the existing production `kvnlive.com` hostname or ticket links.

## Release stages

- **Developer smoke test:** owner/moderator only, no real members.
- **Private beta:** 25–50 invited users after durable DB, email, terms, moderation and physical-device checks are completed.
- **Expanded beta:** 250–500 members after reliability, backups, identity recovery and abuse-handling metrics have been reviewed.
- **Future installable app:** KVN app shell may connect to these same Social APIs and account records, alongside KV Live and the Market.

## Hard boundaries

- Never place `DATABASE_URL`, `RESEND_API_KEY`, owner password or invitation code in GitHub, screenshots, logs, public pages or chat.
- Do not activate or publicize `social.kvnlive.com` as open registration until all launch gates above are signed off.
- The existing `kvn-live-tickets` Render service must remain unchanged.
