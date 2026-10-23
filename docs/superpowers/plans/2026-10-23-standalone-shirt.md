# Standalone Shirt Implementation Plan
> **For agentic workers:** Use superpowers:executing-plans task-by-task.
**Goal:** Three ticket-page offers with standalone $29.99 shirts feeding Shop.
**Architecture:** Reuse Shop checkout and stock reservations, with React quantity/per-shirt size selector. Filter ticket offerings by known VIP and GA IDs.
**Tech Stack:** Node/Express, React/Vinext, Stripe.
**Spec:** ../specs/2026-10-23-standalone-shirt-design.md
## Global Constraints
Preserve historical orders, stock, existing ticket prices, $5 shipping/tax. Public URLs kvnlive.com only.
## Review Focus
Sold-out sizes; repeated same sizes; stock held by checkout; stale middle-pass links; network checkout failures.
### Task 1: Shop pricing/catalog
- [ ] Tests: legacy stored prices yield 2999; mixed sizes total8997; pending reservations excluded; expired reservations ignored.
- [ ] Implement current price helper and catalog remaining quantities; reuse it in normalization.
- [ ] Run shop tests and full suite; commit.
### Task 2: Public purchase selection
- [ ] Tests: only VIP/GA/shirt options; quantity3 yields3 required sizes; repeats allowed, overstock blocked; checkout uses apparel endpoint.
- [ ] Update PassSelection and ShopProduct, shop copy/type; legacy event page links to shop and filters old passes/cart.
- [ ] Typecheck, unit suite, build; fresh code review; publish and verify public pages/catalog without placing a paid order.
