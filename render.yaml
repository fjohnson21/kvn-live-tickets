# KVN Live Tickets v3 Production-Oriented MVP

KVN Live Tickets v3 expands the original single-event checkout into a multi-organizer ticketing marketplace and operating system for Kingdom Vibe Network, churches, ministries, promoters, and partner organizations.

## Included in v3

- Multi-organization marketplace with owner approval
- Owner, organizer, and limited staff workspaces
- Drag-and-drop event-page builder with editable blocks
- Hero/logo image upload foundation (local `/public/uploads` storage for MVP; replace with S3/Cloudinary in production)
- Ticket + apparel mixed cart and Stripe Checkout
- Unique QR ticket issuance and duplicate-entry prevention
- Camera QR scanner using the browser BarcodeDetector API, plus manual fallback
- Staff permissions for check-in, attendees, orders, events, and refunds
- Attendee CSV export
- Ticket transfer controls
- Confirmation-email resend controls
- Stripe Connect onboarding hooks and application-fee support
- Organizer fee plans and payout schedule settings
- Per-event tax-rate setting
- Discount codes and inventory controls
- Order refunds through Stripe
- Audit logging
- Sales-by-day analytics
- Abandoned-cart tracking and lead table
- Organizer onboarding checklist
- Custom event URL/slug controls
- Apple Wallet / Google Wallet integration readiness endpoints
- Super Admin command-center metrics

## Important production boundaries

This build is intended as a functional product foundation, not a final PCI/security/compliance deployment. Before processing meaningful commercial volume, replace the JSON store and in-memory demo sessions with PostgreSQL and production authentication, move uploaded media to managed object storage, add CSRF/rate limiting and hardened authorization tests, configure email and Stripe webhooks, and implement signed Apple `.pkpass` and Google Wallet objects using your issuer credentials.

## Local setup

1. Install Node.js 20+.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Add a Stripe **test** secret key and webhook secret.
5. Optionally add Resend and Stripe Connect settings.
6. Run `npm start`.
7. Visit `http://localhost:3000`.

Dashboard: `/dashboard.html`  
Camera check-in: `/checkin.html`  
Organizer application: `/submit.html`

## Test roles

The dashboard includes demo buttons for Owner, Organizer, and Staff. Demo authentication is deliberately temporary and must be replaced before a public launch.

## Production deployment target

The current project can be deployed on Render/Railway/Fly.io for testing. For production, a recommended stack is Node/Express + PostgreSQL + managed object storage + Stripe Connect + Resend/Postmark + Clerk/Auth0/Supabase Auth, with Redis for sessions/rate limiting if needed.


## Disciple Network (affiliate/referral system)
KVN calls referral partners **Disciples**. Each Disciple has a unique `?disciple=CODE` tracking link, a default commission rate, optional event-specific overrides, earnings records, and Stripe Connect payout fields. Commission is calculated on merchandise/ticket subtotal after discounts and excludes taxes. On successful payment, the server records the commission and can immediately transfer it to the Disciple's Stripe Connect account. If that connected account is eligible for Stripe Instant Payouts and the feature is enabled, the server also attempts an instant payout. Stripe eligibility, available balance, debit-card support, risk/compliance requirements, and payout fees can prevent a bank/card payout from being truly instantaneous; in that case the dashboard marks the commission as transferred/pending rather than falsely reporting it paid.
