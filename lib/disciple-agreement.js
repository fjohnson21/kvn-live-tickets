import { createHash } from 'node:crypto';

export const DISCIPLE_AGREEMENT_VERSION='2.2';
export const DISCIPLE_AGREEMENT_TEXT=`KINGDOM VIBE, INC. | KINGDOM DISCIPLE AGREEMENT
Version 2.2

Participation is free and no purchase is required to participate, remain active, be considered as a Kingdom Leader, or earn commissions.

An approved Kingdom Disciple earns 10% of eligible gross item sales actually paid and retained across approved KVN Live tickets and ticket bundles, Kingdom Vibe merchandise/apparel, and approved Kingdom Market purchases or partnership packages. Attribution lasts 30 days. Qualifying commissions are paid monthly on the 15th with no minimum payout. Taxes, processing or service fees, shipping, donations, discounts, complimentary items, refunds, cancellations, chargebacks, fraudulent orders, and third-party amounts are excluded.

Kingdom Vibe alone may appoint or deactivate a Kingdom Leader. An active Leader may earn a 2% Community Bonus only on verified eligible sales to non-participant customers attributed to directly assigned team members. No compensation is paid for recruitment, applications, enrollment, approval, team assignment, participant purchases, or second-level activity. Team assignments are controlled by Kingdom Vibe and may be changed prospectively.

A complimentary Experience Bundle may be awarded to an active Leader. Other approved Disciples may optionally purchase a post-approval bundle. Buying or declining a bundle never affects eligibility, status, team placement, or compensation, and participant bundle purchases generate no commission or Community Bonus.

Participants must make truthful, supported promotions, disclose their material relationship with Kingdom Vibe, avoid earnings guarantees, use approved materials, and publish at least one approved post weekly during assigned active campaigns. Commissions may be reversed for refunds, disputes, fraud, or error. Community Bonus payouts remain disabled until Kingdom Vibe records review by licensed counsel for the jurisdictions where the program operates.

The Disciple acts as an independent contractor and has no authority to bind Kingdom Vibe, Inc. This Agreement is governed by North Carolina law. Electronic acceptance and typed-name attestation are effective. Submission does not imply approval.`;

export function agreementHash(text){return createHash('sha256').update(text,'utf8').digest('hex');}
