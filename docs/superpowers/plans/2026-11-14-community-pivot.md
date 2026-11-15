# KV Live free community gathering implementation

Approved scope from owner conversation: free mandatory RSVP, 1,000 new passes in addition to prior passes, unique QR per attendee, existing VIP benefits honored, paid GA upgraded to reserved seating in first five center rows. Doors open 5 PM November21; no public start time. Same artists and Trailblazer honors. No marketplace. Daily prayer7PM Eastern from November15; owner will text access details November15.

One outreach gift supports this and future free gatherings plus Acts2:44 holiday groceries. Main pages hide tiers; giving page offers Community100, Outreach250, Kingdom500+ (editable minimum500), custom amount. Keep existing payment recipient. Preserve historical restricted gifts and prior transaction amounts. No bulk email/SMS sent by this change.

Implementation:
- [x] Separate free RSVP allocation, idempotent registration, existing QR/check-in/reporting integration.
- [x] Paid sales closed; legacy payments still finalize; paid GA seating labeled.
- [x] Unified new giving metadata, tier validation and neutral partnership acknowledgment.
- [x] Branded main/pass/give/link pages, prayer opt-in and vendor closures updated in Sites source.
- [x] New backend and frontend flow tests, syntax/type checks and production build.
- [x] Independent review: fixed lowercase QR, independent allocation, stale Disciple/shop copy, check-in seating display.
- [ ] Publish engine then branded frontend; verify production catalog and validation responses.

Validation: targeted engine suite39passed; frontend regression coverage includes free RSVP response/QRs, optional marketing, tier min500, bridge forwarding. Full pre-existing suite contains assertions for the superseded paid catalog/promotion, and unrelated legacy LuxRide departure-copy failure. These are documented rather than a claim of a fully green old suite. No live payments or customer messages were generated for QA.

Operational follow-through: team coordinates sponsorship LED assets, paid reserved-section seat allocation, and existing vendor arrangements. Owner provides/sends prayer call details. Total section seat count is not available in repository; first-five-row commitment is owner-directed.
