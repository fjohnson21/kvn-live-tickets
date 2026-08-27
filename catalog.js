export const event = {
  brand: "Kingdom Vibe Live",
  eyebrow: "KINGDOM VIBE NETWORK PRESENTS",
  title: "Kingdom Vibe Live",
  date: "Saturday, November 21, 2026",
  venue: "Dennis A. Wicker Civic Center",
  location: "Sanford, North Carolina",
  description: "A full-day Kingdom experience bringing together faith, culture, community impact and live worship.",
  heroNote: "Tickets and apparel can be purchased together in one checkout."
};

export const products = [
  {
    id: "general-admission",
    type: "ticket",
    name: "General Admission",
    description: "Admission to Kingdom Vibe Live.",
    price: 4900,
    badge: "EVENT PASS"
  },
  {
    id: "vip-pass",
    type: "ticket",
    name: "VIP Experience",
    description: "Premium event access with VIP entry and enhanced experience.",
    price: 9900,
    badge: "VIP"
  },
  {
    id: "founders-pass",
    type: "ticket",
    name: "Founders Experience",
    description: "Top-tier Kingdom Vibe experience for early supporters and movement builders.",
    price: 14900,
    badge: "FOUNDERS"
  },
  {
    id: "made-by-god-gray",
    type: "apparel",
    name: "Not Self Made — Made By God Tee",
    description: "Premium gray Kingdom Vibe Collection tee.",
    price: 3500,
    badge: "DROP 001",
    options: {
      size: ["S", "M", "L", "XL", "2XL", "3XL"]
    }
  },
  {
    id: "made-by-god-black",
    type: "apparel",
    name: "Not Self Made — Made By God Tee / Black",
    description: "Premium black Kingdom Vibe Collection tee.",
    price: 3500,
    badge: "DROP 001",
    options: {
      size: ["S", "M", "L", "XL", "2XL", "3XL"]
    }
  }
];

export function findProduct(id) {
  return products.find((product) => product.id === id);
}
