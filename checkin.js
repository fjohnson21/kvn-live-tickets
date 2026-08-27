{
  "users": [
    {
      "id": "usr_owner",
      "name": "KVN Owner",
      "email": "owner@kingdomvibe.example",
      "role": "owner",
      "organizationId": "org_kvn"
    },
    {
      "id": "usr_demo",
      "name": "Demo Organizer",
      "email": "organizer@example.org",
      "role": "organizer",
      "organizationId": "org_demo"
    }
  ],
  "organizations": [
    {
      "id": "org_kvn",
      "name": "Kingdom Vibe Network",
      "slug": "kingdom-vibe-network",
      "status": "approved",
      "stripeAccountId": "",
      "createdAt": "2026-08-27T14:00:00.000Z"
    },
    {
      "id": "org_demo",
      "name": "New Life Community Church",
      "slug": "new-life-community-church",
      "status": "approved",
      "stripeAccountId": "",
      "createdAt": "2026-08-27T14:00:00.000Z"
    }
  ],
  "events": [
    {
      "id": "evt_kv_live_2026",
      "organizationId": "org_kvn",
      "slug": "kingdom-vibe-live-2026",
      "title": "Kingdom Vibe Live",
      "subtitle": "Faith \u2022 Culture \u2022 Impact",
      "description": "A movement-centered day of community impact, leadership empowerment, worship and live music.",
      "date": "2026-11-21T15:00:00-05:00",
      "venue": "Dennis A. Wicker Civic Center",
      "location": "Sanford, North Carolina",
      "status": "published",
      "featured": true,
      "theme": {
        "accent": "#e2252b",
        "surface": "#111111",
        "logoText": "KINGDOM VIBE"
      },
      "products": [
        {
          "id": "ga",
          "type": "ticket",
          "name": "General Admission",
          "description": "Entry to Kingdom Vibe Live.",
          "price": 4900,
          "inventory": 900,
          "sold": 0,
          "badge": "PASS"
        },
        {
          "id": "vip",
          "type": "ticket",
          "name": "VIP Experience",
          "description": "Priority entry and premium seating area.",
          "price": 7900,
          "inventory": 250,
          "sold": 0,
          "badge": "VIP"
        },
        {
          "id": "founders",
          "type": "ticket",
          "name": "Founders Experience",
          "description": "Empowerment Session, Founders Reception and VIP entry.",
          "price": 9900,
          "inventory": 100,
          "sold": 0,
          "badge": "FOUNDERS"
        },
        {
          "id": "drop001-black",
          "type": "apparel",
          "name": "Not Self Made \u2014 Made By God Tee",
          "description": "Kingdom Vibe Collection Drop 001.",
          "price": 3800,
          "inventory": 500,
          "sold": 0,
          "badge": "DROP 001",
          "options": {
            "size": [
              "S",
              "M",
              "L",
              "XL",
              "2XL",
              "3XL"
            ]
          }
        }
      ],
      "layout": [
        {
          "id": "b1",
          "type": "hero",
          "title": "Kingdom Vibe Live",
          "body": "Faith \u2022 Culture \u2022 Impact"
        },
        {
          "id": "b2",
          "type": "details",
          "title": "November 21, 2026",
          "body": "Dennis A. Wicker Civic Center \u2022 Sanford, NC"
        },
        {
          "id": "b3",
          "type": "tickets",
          "title": "Choose Your Experience",
          "body": "Mix passes and apparel in one checkout."
        },
        {
          "id": "b4",
          "type": "apparel",
          "title": "Wear the Movement",
          "body": "Add Drop 001 to the same cart."
        },
        {
          "id": "b5",
          "type": "text",
          "title": "About Kingdom Vibe",
          "body": "We bridge the gap between culture and the Kingdom through experiences, media, commerce and community impact."
        }
      ],
      "createdAt": "2026-08-27T14:00:00.000Z",
      "updatedAt": "2026-08-27T14:00:00.000Z"
    },
    {
      "id": "evt_demo_1",
      "organizationId": "org_demo",
      "slug": "community-worship-night",
      "title": "Community Worship Night",
      "subtitle": "One City \u2022 One Sound",
      "description": "A community worship gathering submitted by an independent organizer.",
      "date": "2026-10-17T18:30:00-04:00",
      "venue": "Downtown Community Center",
      "location": "Raleigh, North Carolina",
      "status": "pending",
      "featured": false,
      "theme": {
        "accent": "#6b4eff",
        "surface": "#131313",
        "logoText": "NEW LIFE"
      },
      "products": [
        {
          "id": "ga",
          "type": "ticket",
          "name": "General Admission",
          "description": "Standard event admission.",
          "price": 2500,
          "inventory": 300,
          "sold": 0,
          "badge": "TICKET"
        }
      ],
      "layout": [
        {
          "id": "d1",
          "type": "hero",
          "title": "Community Worship Night",
          "body": "One City \u2022 One Sound"
        },
        {
          "id": "d2",
          "type": "tickets",
          "title": "Reserve Your Seat",
          "body": "Tickets available now after KVN approval."
        }
      ],
      "createdAt": "2026-08-27T14:00:00.000Z",
      "updatedAt": "2026-08-27T14:00:00.000Z"
    }
  ],
  "orders": [],
  "discounts": [
    {
      "id": "disc_launch",
      "eventId": "evt_kv_live_2026",
      "code": "KINGDOM10",
      "type": "percent",
      "value": 10,
      "active": true,
      "maxUses": 100,
      "uses": 0
    }
  ],
  "settings": {
    "platformFeePercent": 5,
    "requireOwnerApproval": true,
    "marketplaceTitle": "KVN Live Tickets",
    "marketplaceTagline": "Tickets. Experiences. The Kingdom connected.",
    "discipleCookieDays": 30,
    "defaultDiscipleCommissionPercent": 10
  },
  "disciples": [
    {
      "id": "dsc_demo",
      "name": "Demo Disciple",
      "email": "disciple@example.org",
      "code": "DEMO10",
      "status": "active",
      "organizationId": "org_kvn",
      "defaultCommissionPercent": 10,
      "stripeAccountId": "",
      "instantPayoutEnabled": true,
      "createdAt": "2026-08-27T18:00:00.000Z"
    }
  ],
  "discipleCommissions": [],
  "disciplePayouts": []
}