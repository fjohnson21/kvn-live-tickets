# KVN Live Tickets v4 Upgrade Notes

## What changed

### Organizer profiles
Organizers can now maintain primary contact, business email, phone, website, Instagram, Facebook, TikTok, YouTube, organization type, description, business address, and a public-contact toggle.

### Event media
The visual builder supports hero imagery plus dedicated flyer, desktop banner, mobile banner, and sponsor-banner uploads. Event pages automatically use these assets in appropriate placements.

### Ticket quantity controls
Each ticket/product can have minimum quantity, maximum quantity, and quantity increments per order.

### Apparel included with tickets
A ticket can include apparel. When enabled, the buyer is required to select one apparel size for every ticket selected. The size is stored on each individual issued ticket and can be tracked for fulfillment.

### Group ticketing
Ticket types can enable group pricing with minimum and maximum group quantities, percentage or fixed discounts, and optional tiered discounts such as 10+ = 10% off and 25+ = 15% off.

### Fees
Per event, organizers can choose:
- Buyer pays fees
- Organizer absorbs fees
- Custom / split fees

Defaults in v4:
- KVN ticketing fee: 2.95% + $1.95 per ticket
- Merchant fee model: 2.9% + $0.30
- Merchant-fee gross-up available when buyer pays
- Taxes remain separate

### Refund policy
KVN service fees and merchant fees are non-refundable by default. Event settings can override this where appropriate. Production legal language should still be reviewed before national launch.

## Important before live-money production
The v4 archive is still an MVP architecture. Before scale, migrate JSON data to PostgreSQL, replace demo authentication, harden security, implement jurisdiction-aware tax handling, validate Stripe Connect settlement/refund/transfer reversals, and add production-grade backups/object storage.

## Updating the existing GitHub/Render deployment
1. Extract the v4 ZIP on your computer.
2. In GitHub, replace root files such as `server.js`, `store.js`, `package.json`, `render.yaml`, and `README.md` with the v4 versions.
3. Open the existing GitHub `public` folder and replace its contents with the files from the v4 `public` folder. Do not upload those files into the repository root.
4. Replace the `data/store.json` seed only if you want the updated demo configuration. On Render, your persistent `DATA_DIR` remains the operational data source.
5. Commit changes. Render should auto-deploy.
6. After deployment, hard refresh the dashboard with Ctrl+Shift+R.
7. Verify the new Organizer Profile and Ticketing & Fees tabs before connecting live Stripe money.
