import { GA_PRODUCT, RETIRED_PASS } from './admission-transition.js';
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
    description: 'KV Live — the national launch of Kingdom Vibe Network. Faith. Purpose. Community. Impact. General Admission is $15 without apparel. Kingdom VIP includes Drop 001 — Not Self Made — Made By God T-Shirt.',
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
        description: 'PREMIUM SEATING: ROWS 1–18 • 2:30 PM Kingdom Market Expo and Vendor Mall, Food Hall Experience, KV Trailblazer Awards, and Kingdom Vibe Technology Release • 5:00 PM Pre-Worship and priority seating • 6:00 PM KV Live Worship Experience: debut of KV Worship with Jalisa Faye, Yael Hilton + Imani Joi Raeford, followed by recognition of Ministry Partners • Your tee purchase grants you a complimentary Kingdom Vibe Live pass. One shirt and one pass for your selected experience.'
      }),
      {
        id: GA_PRODUCT, type: 'ticket', name: 'General Admission', price: 1500,
        inventory: 300, sold: soldById.get(GA_PRODUCT) || 0, badge: 'GENERAL ADMISSION',
        description: 'General admission to the 6 PM KV Live Worship Experience • Pre-Worship and seating at 5 PM • KV Worship with Jalisa Faye, Yael Hilton + Imani Joi Raeford, followed by recognition of Ministry Partners • No T-shirt or VIP access included',
        minPerOrder: 1, maxPerOrder: 20, quantityStep: 1,
        earlyRelease: {enabled: false}, group: {enabled: false}, includedApparel: {mode: 'none', enabled: false}
      },
      ...(event.products || []).filter(p => p.id === RETIRED_PASS).map(p => ({...p, retired: true}))
    ],
    layout: [
      { id: 'kv-hero', type: 'hero', title: 'Kingdom Vibe Live', body: 'Not Self Made — Made By God' },
      { id: 'kv-details', type: 'details', title: 'Saturday, November 21, 2026', body: 'ONE DAY • THREE DISTINCT MOMENTS • 2:30 PM — Kingdom Market Expo and Vendor Mall, Food Hall Experience, KV Trailblazer Awards, and Kingdom Vibe Technology Release. 5:00 PM — Pre-Worship and seating. 6:00 PM — KV Live Worship Experience: the debut of KV Worship with three powerful guest-led sets from Jalisa Faye, Yael Hilton and Imani Joi Raeford, followed by recognition of Ministry Partners.' },
      { id: 'kv-tickets', type: 'tickets', title: 'Choose Your KV Live Experience', body: 'General Admission is $15, plus applicable fees, with 5 PM pre-worship seating and the 6 PM worship experience. No apparel or VIP access is included. Kingdom VIP includes the 2:30 PM experience, premium seating in Rows 1–18, priority seating at 5 PM, and Drop 001. See current VIP pricing below.' },
      { id: 'kv-wear', type: 'text', title: 'Wear the Message. Experience the Movement.', body: 'Choose one Drop 001 “Not Self Made — Made By God” T-shirt size for each VIP bundle. General Admission does not include apparel. Your tee purchase grants you a complimentary Kingdom Vibe Live pass. One shirt and one pass for your selected experience.' },
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
