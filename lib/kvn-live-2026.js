import { DEFAULT_APPAREL_SIZES } from './apparel.js';

const TARGET_SLUG = 'kingdom-vibe-live-2026';

function includedDrop() {
  return {
    mode: 'included',
    enabled: true,
    name: 'Drop 001 — Not Self Made, Made By God T-shirt',
    price: 0,
    sizes: [...DEFAULT_APPAREL_SIZES],
    sizeInventory: {},
    quantityPerTicket: 1
  };
}

function ticket({ id, name, price, inventory, badge, description, sold }) {
  return {
    id,
    type: 'ticket',
    name,
    description,
    price,
    inventory,
    sold,
    badge,
    minPerOrder: 1,
    maxPerOrder: 20,
    quantityStep: 1,
    earlyRelease: { enabled: true, discountAmount: 1000, unitLimit: 200 },
    group: { enabled: false, minQty: 1, maxQty: 20, discountType: 'percent', discountValue: 0, tiers: [] },
    includedApparel: includedDrop()
  };
}

function managedEvent(event) {
  const soldById = new Map((event.products || []).map(product => [product.id, Number(product.sold || 0)]));
  return {
    ...event,
    title: 'Kingdom Vibe Live',
    subtitle: 'Not Self Made — Made By God',
    description: 'All passes include Drop 001 — Not Self Made — Made By God T-Shirt. Choose your Kingdom Pass or Kingdom VIP experience.',
    date: '2026-11-21T14:30:00-05:00',
    venue: 'Dennis A. Wicker Civic Center',
    location: 'Sanford, North Carolina',
    status: 'published',
    featured: true,
    products: [
      ticket({
        id: 'kv-all-access-2026',
        name: 'Kingdom VIP Pass Bundle',
        price: 4900,
        inventory: 600,
        sold: soldById.get('kv-all-access-2026') || 0,
        badge: 'FULL ACCESS UPGRADE',
        description: 'PREMIUM SEATING: ROWS 1–18 • 2:30 PM VIP Launch Party: KVN Technology Reveal, Kingdom Vibe Resident DJ, Vendor Mall + Food Hall Experience • 5 PM PreWorship + priority seating • 6 PM KV Live Worship Experience: debut of KV Worship with Jalisa Faye, Yael Hilton + Imani Joi Raeford • Your tee purchase grants you a complimentary Kingdom Vibe Live pass. One shirt and one pass for your selected experience.'
      }),
      ticket({
        id: 'kv-kingdom-pass-2026',
        name: 'Kingdom Pass Bundle',
        price: 3900,
        inventory: 300,
        sold: soldById.get('kv-kingdom-pass-2026') || 0,
        badge: 'T-SHIRT + COMP PASS',
        description: 'RESERVED SEATING: ROWS 19–35 • 5 PM PreWorship • 6 PM KV Live Worship Experience: debut of KV Worship with Jalisa Faye, Yael Hilton + Imani Joi Raeford • Your tee purchase grants you a complimentary Kingdom Vibe Live pass. One shirt and one pass for your selected experience.'
      })
    ],
    layout: [
      { id: 'kv-hero', type: 'hero', title: 'Kingdom Vibe Live', body: 'Not Self Made — Made By God' },
      { id: 'kv-details', type: 'details', title: 'Saturday, November 21, 2026', body: 'ONE DAY • THREE DISTINCT MOMENTS • 2:30 PM — VIP Launch Party: KVN Technology Reveal, Kingdom Vibe Resident DJ, Vendor Mall and Food Hall Experience. 5 PM — PreWorship and seating. 6 PM — KV Live Worship Experience: the debut of KV Worship with three powerful guest-led sets from Jalisa Faye, Yael Hilton and Imani Joi Raeford.' },
      { id: 'kv-tickets', type: 'tickets', title: 'Choose Your Shirt and Experience', body: 'Select the experience included with your official Drop 001 purchase. Early pricing applies to the first 200 bundles per tier: Kingdom Pass $29, then $39; Full Access $39, then $49. See current availability below. Your tee. VIP Launch Party. Red Carpet. Preferred worship seating.' },
      { id: 'kv-wear', type: 'text', title: 'Wear the Message. Experience the Movement.', body: 'Choose one Drop 001 “Not Self Made — Made By God” T-shirt size for each purchase. Your tee purchase grants you a complimentary Kingdom Vibe Live pass. One shirt and one pass for your selected experience.' },
      { id: 'kv-impact', type: 'text', title: 'Your Purchase Builds the Kingdom', body: 'A portion of every purchase helps fund Kingdom Projects and supports our Acts 2:44 Foundation — All Things in Common — advancing practical resources, opportunity, and community impact.' },
      { id: 'kv-policy', type: 'text', title: 'Pass Policy', body: 'All sales are final. Refunds are available only if the event is canceled.' }
    ]
  };
}

function comparable(event) {
  const { updatedAt, ...rest } = event;
  return rest;
}

export function synchronizeKvnLive2026Event(store) {
  const index = (store.events || []).findIndex(event => event.slug === TARGET_SLUG);
  if (index < 0) return false;
  const current = store.events[index];
  const next = managedEvent(current);
  if (JSON.stringify(comparable(current)) === JSON.stringify(comparable(next))) return false;
  next.updatedAt = new Date().toISOString();
  store.events[index] = next;
  return true;
}
