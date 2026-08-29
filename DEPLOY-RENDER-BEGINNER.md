# KVN Live Tickets v3 — Beginner Render Deployment

This build is prepared for a Render **test environment** with persistent storage.

## Recommended test stack
- GitHub: stores the project
- Render Web Service (Starter): hosts the Node/Express app
- Render persistent disk: keeps the JSON test database and uploaded images across redeploys
- Stripe Test Mode: safe test payments

## Render settings
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/`

## Environment variables
Set these in Render, not in GitHub:
- `BASE_URL` = your final Render URL, such as `https://kvn-live-tickets-v3-test.onrender.com`
- `STRIPE_SECRET_KEY` = Stripe test secret key (`sk_test_...`)
- `STRIPE_WEBHOOK_SECRET` = Stripe webhook signing secret (`whsec_...`)
- `PLATFORM_FEE_PERCENT` = `5`
- `OWNER_EMAIL` = your owner email
- `DATA_DIR` = `/var/data`
- `UPLOAD_DIR` = `/var/data/uploads`
- `RESEND_API_KEY` = optional during first test
- `EMAIL_FROM` = optional during first test

Do not commit real Stripe, email, Apple Wallet, or Google Wallet secrets to GitHub.

## Stripe webhook
After Render gives you the live URL, create a Stripe test webhook endpoint:
`https://YOUR-RENDER-URL/api/webhook`

Listen for at least:
- `checkout.session.completed`

Copy the webhook signing secret into Render as `STRIPE_WEBHOOK_SECRET`, then redeploy.

## First pages to test
- `/` public marketplace
- `/dashboard.html` owner/organizer dashboard
- `/submit.html` organizer application
- `/checkin.html` QR check-in

## Important
This remains a test/staging build. Demo authentication is intentionally not production-safe. Before a public launch with real money, move the data layer to PostgreSQL and replace demo auth with production authentication.
