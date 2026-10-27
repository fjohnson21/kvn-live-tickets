# Verified business source contracts

Backend: existing ticketing main + owner preview. Website: existing KVN Site. No migration replaces records.

| Source | Identity / amount | Date / adjustments | Business |
|---|---|---|---|
| orders | id; stripePaymentIntentId or stripeSessionId; amountTotal integer cents | paidAt; refundedAt + refundAmount when available | KV Tix, filtered KV Live event view |
| shopOrders | id; stripePaymentIntentId or stripeSessionId; amountTotal integer cents | paidAt; refundedAt (historic refund amount may be absent and is disclosed) | Shop |
| sponsored upgrade | existing orders row, orderType=sponsored_upgrade | same paid timestamp contract; not a second claim payment | KV Tix |
| donations | distinct donations ledger | paidAt | separate funding, excluded from sales |
| combo apparel | orders.tickets[].apparel / includedApparel, ticket.code | fulfilled flag and bundleShipment; legacy_not_tracked remains explicit | Shop fulfillment, no new revenue/inventory event |
| standalone apparel | shopOrders.items[], source order + item index | fulfillmentStatus, shippedAt, carrier/trackingNumber | Shop fulfillment |
| partner/market | CRM source IDs and verified category | receivedAt is inquiry time, not paid time | source payment integration unavailable |

KV Live resolves exact unique configured event slug kingdom-vibe-live-2026 to its persisted event ID per request. If absent/ambiguous show unavailable; never select by fuzzy name. Source does not contain production IDs; do not copy private production stores into fixtures.

Social uses existing branch codex/kv-social-bunny-video, social-app/app.js + createFileStore/createPostgresStore. State has users/posts/reports/appeals; records can include seed sample posts and system users, which must not inflate real metrics. Existing owner session is independent; no reporting bridge currently exists. Existing service healthz confirms storage only and cannot establish member or engagement counts.

Unknown payment timestamps, invalid amounts, payment review, duplicate provider identities and historic refund gaps are exceptions. Never replace paidAt with createdAt silently. All currently finalized events/shop orders record paidAt. Local owner-recorded finance entries are never processor-verified sales.
