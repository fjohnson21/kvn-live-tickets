# KV Live special guest outreach

Offer: 2 complimentary VIP passes (invitee + one) and up to 10 complimentary GA guests. Registration requires individual name, email and phone; media recognition is optional. No promotional messaging consent is inferred. No emails or texts are automatically sent.

## Release dependency

The engine and branded Site must be released together. Apply `branded-site-proxy.patch` to Site appgprj_6a970cb9c5808191b44c487542772384, based on source commit 906108942dbff83e4dc6079cd4be9dc9e0df10ce. It maps the new pages, assets and API namespace, and forwards the scoped rep key only to the outreach API. Existing Site audience remains public; API authorization protects the contact list.

Engine code is in PR #88. Hosting deployment remains unverified because a Render workspace was not selected. Do not distribute invitation URLs before end-to-end verification on the branded domain.

## Owner setup after deployment

1. Open `/command-center/special-guests` using owner sign-in.
2. Click **Load reviewed shortlist**. This imports 12 publicly reviewed prospects once, skipping existing handles. Blank contacts mean not found, not missing required input. No invitations are sent.
3. Add Tiffany and other reps through existing Staff & Permissions if they do not already exist. Existing staff can be selected directly in the private rep access section; creating their link grants outreach permission.
4. Create a private rep link in the outreach page and deliver it directly to that rep. Creating another link revokes the old one. Revoke access when no longer needed. Links expire after the event.
5. Assign contacts. Reps see only assigned contacts, public contact methods, notes, follow-up state and registered attendees.
6. Copy the invitation message/link and contact prospects through the chosen channel. Mark contacted/follow-up manually.

## Invitee and audience

The invitee uses the private link to confirm and issue their VIP pass, then adds their VIP plus-one. They receive a separate audience link permitting only GA registration, capped at 10. Each person gets an individual QR pass link to save or print. These links carry access secrets; share each attendee only their own pass. Keep the invitation management link private.

Registrations are subject to actual event capacity. Creating invitations does not reserve inventory. Successful issue decrements native inventory and creates a complimentary order compatible with existing check-in. No merchandise is added. Confirmed records cannot be switched to declined via outreach status. For attendee corrections/reissues, use existing ticket operations with the appropriate permission; this first version does not provide self-service cancellations.

## Verification

Automated tests cover hard limits, duplicate submission handling, email duplicate prevention, inventory failure, privacy, scoped rep access/revocation, and concurrent claims for the last GA slot. All tests use in-memory data, no production messages or test tickets.

Before release: validate the branded Site build, owner import/assignment, private rep link, invitee confirmation, plus-one, audience registration, individual QR display, and check-in in an isolated fixture. Then verify deployed route health without issuing fake production passes.
