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
    earlyRelease: { enabled: true, discountAmount: 1000, unitLimit: inventory },
    group: { enabled: false, minQty: 1, maxQty: 20, discountType: 'percent', discountValue: 0, tiers: [] },
    includedApparel: includedDrop()
  };
}

function managedEvent(event) {
  const prior = event.limitedCampaign;
  const caps = prior?.id === "kingdom-100-20261101" ? prior.caps : Object.fromEntries(["kv-all-access-2026", GA_PRODUCT].map(id => {
    const ids = id === GA_PRODUCT ? [GA_PRODUCT, RETIRED_PASS] : [id];
    const sold = (event.products || []).filter(p => ids.includes(p.id)).reduce((n,p)=>n+Number(p.sold||0),0);
    return [id, sold + 100];
  }));
  const soldById = new Map((event.products || []).map(product => [product.id, Number(product.sold || 0)]));
  return {
    ...event,
    limitedCampaign: prior?.id === "kingdom-100-20261101" ? prior : {id:"kingdom-100-20261101",startedAt:new Date().toISOString(),caps},
    title: 'Kingdom Vibe Live',
    subtitle: 'Not Self Made — Made By God',
    description: 'KV Live — the national launch of Kingdom Vibe Network. Faith. Purpose. Community. Impact. General Admission is $15 without apparel. Kingdom Premier is $39.99 with Rows 1–5 and early entry, without apparel. The original Kingdom Pass bundle and standalone T-shirt are sold out.',
    date: '2026-11-21T14:30:00-05:00',
    venue: 'Dennis A. Wicker Civic Center',
    location: 'Sanford, North Carolina',
    status: 'published',
    featured: true,
    products: [
      {
        ...ticket({id:'kv-kingdom-premier-2026',name:'Kingdom Premier',price:3999,
          inventory:caps['kv-all-access-2026'],sold:soldById.get('kv-kingdom-premier-2026')||0,
          badge:'PREMIER SEATING · ROWS 1–5',
          description:'Get closer to the moment. Rows 1–5, early entry and full-day access from 2:30 PM: Kingdom Market Expo, Vendor Mall and Food Hall Experience. 4 PM Trailblazer Awards and Technology Release. 5 PM pre-worship and priority seating. 6 PM worship with KV Worship, Jalisa Faye, Yael Hilton and Imani Joi Raeford, followed by recognition of Ministry Partners. No T-shirt included.'}),
        earlyRelease:{enabled:false},includedApparel:{mode:'none',enabled:false}
      },
      {
        id: GA_PRODUCT, type: 'ticket', name: 'General Admission', price: 1500,
        inventory: caps[GA_PRODUCT], sold: soldById.get(GA_PRODUCT) || 0, badge: 'GENERAL ADMISSION',
        description: 'Be in the room. Be part of the sound. Seating begins at row 6 — not a bad seat in the house. Full-day admission from 2:30 PM • 4 PM Trailblazer Awards • 6 PM KV Live Worship Experience • Pre-Worship and seating at 5 PM • KV Worship with Jalisa Faye, Yael Hilton + Imani Joi Raeford, followed by recognition of Ministry Partners • No T-shirt or VIP access included',
        minPerOrder: 1, maxPerOrder: 20, quantityStep: 1,
        earlyRelease: {enabled: false}, group: {enabled: false}, includedApparel: {mode: 'none', enabled: false}
      },
      {...((event.products||[]).find(p=>p.id==='kv-all-access-2026')||ticket({id:'kv-all-access-2026',name:'Kingdom Pass',price:3900,inventory:caps['kv-all-access-2026'],sold:0,description:'Original Kingdom Pass + T-shirt bundle'})),salesClosed:true},
      ...(event.products || []).filter(p => p.id === RETIRED_PASS).map(p => ({...p, retired: true}))
    ],
    layout: [
      { id: 'kv-hero', type: 'hero', title: 'Kingdom Vibe Live', body: 'Not Self Made — Made By God' },
      { id: 'kv-details', type: 'details', title: 'Saturday, November 21, 2026', body: 'ONE DAY • THREE DISTINCT MOMENTS • 2:30 PM — Kingdom Market Expo and Vendor Mall, Food Hall Experience and Kingdom Vibe Technology Release. 4:00 PM — KV Trailblazer Awards. 5:00 PM — Pre-Worship and seating. 6:00 PM — KV Live Worship Experience: the debut of KV Worship with three powerful guest-led sets from Jalisa Faye, Yael Hilton and Imani Joi Raeford, followed by recognition of Ministry Partners.' },
      { id: 'kv-tickets', type: 'tickets', title: 'Choose Your KV Live Experience', body: 'General Admission is $15, plus applicable fees, with full-day entry from 2:30 PM, 4 PM Trailblazer Awards, 5 PM pre-worship seating and the 6 PM worship experience. General Admission seating begins at row 6. Kingdom Premier is $39.99 with Rows 1–5, early entry and full-day access. Neither active pass includes apparel.' },
      { id: 'kv-wear', type: 'text', title: 'Original Kingdom Pass + T-shirt — Sold out', body: 'The original bundle and standalone Drop 001 T-shirt are sold out. Existing purchases retain their original benefits.' },
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
