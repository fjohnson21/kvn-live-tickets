# KVN Live Tickets v4

Upgraded multi-organizer ticketing MVP with Disciple Network, expanded organizer profiles, multi-format event media, bundled apparel sizing per ticket, custom quantity controls, group ticket pricing, and configurable buyer/organizer fee absorption.

## v4 additions
- Organizer profile: website/social, phone, business address, organization type and public-contact toggle.
- Event media: hero, flyer, desktop banner, mobile banner, sponsor banner.
- Ticket quantity minimum/maximum/increments per ticket type.
- Included apparel toggle with one size selection per ticket purchased and size inventory support.
- Group tickets with minimum/maximum quantity, percentage/fixed discounts, and optional tiered discounts.
- Fee strategy: buyer pays, organizer absorbs, or custom split.
- KVN fee defaults to 2.95% + $1.95 per ticket.
- Merchant fee modeled separately with optional gross-up.
- Receipt/order ledger separates subtotal, discounts, taxes, KVN fee, merchant fee, and payer allocation.
- KVN and merchant fees non-refundable by default, with configurable exceptions.

## Important production notes
This remains an MVP. Before live-money scale, migrate JSON storage to PostgreSQL, replace demo auth, validate Stripe Connect settlement/refund/transfer reversal behavior, implement jurisdiction-aware tax calculation, and have counsel review fee/refund disclosures.

Run `npm install`, then `npm start`. Use `npm run check` for syntax validation.
