import { csvCell } from './report.js';

const APPLICATION_HEADERS = [
  'id','applicationReference','status','legalFirstName','legalLastName','preferredName','email','mobile',
  'address1','city','state','postalCode','country','shirtSize','market','affiliation','instagram','facebook',
  'tiktok','youtube','otherSocial','audienceSize','motivation','promotionPlan','referralSource','additionalNotes',
  'weeklyPostCommitment','agreementAccepted','electronicRecordsConsent','recordsAccessConfirmed','typedLegalName',
  'agreementVersion','agreementHash','agreementAcceptedAt','recruitingLeaderHandle','recruitingLeaderId','duplicateRisk',
  'sourceSystem','idempotencyKey','submissionIp','userAgent','submittedAt','createdAt','updatedAt',
];

const DISCIPLE_HEADERS = [
  'id','name','email','code','handle','status','organizationId','defaultCommissionPercent','payoutMethod','payoutNotes',
  'isKingdomLeader','applicationReference','welcomeEmailStatus','welcomeEmailMessageId','welcomeEmailLastAttemptAt',
  'createdAt','updatedAt',
];

const COMMISSION_HEADERS = [
  'id','discipleId','discipleName','discipleEmail','eventId','orderId','sourceType','sourceLabel','eligibleBase',
  'ratePercent','amount','status','earnedAt','payoutDate','paidAt','paymentReference','reversedAt','reversalReason','createdAt',
];

const PAYOUT_HEADERS = [
  'id','discipleId','discipleName','discipleEmail','commissionId','amount','status','paymentReference','createdAt',
];

function rowsToCsv(headers, rows) {
  return [headers, ...rows.map(row => headers.map(header => row[header] ?? ''))]
    .map(row => row.map(csvCell).join(','))
    .join('\n');
}

function discipleIndex(disciples) {
  return new Map((disciples || []).map(disciple => [disciple.id, disciple]));
}

export function discipleApplicationsCsv(applications = []) {
  return rowsToCsv(APPLICATION_HEADERS, applications);
}

export function disciplesCsv(disciples = []) {
  return rowsToCsv(DISCIPLE_HEADERS, disciples.map(disciple => ({
    ...disciple,
    welcomeEmailStatus: disciple.welcomeEmail?.status || '',
    welcomeEmailMessageId: disciple.welcomeEmail?.messageId || '',
    welcomeEmailLastAttemptAt: disciple.welcomeEmail?.attemptedAt || disciple.welcomeEmail?.sentAt || '',
  })));
}

export function discipleCommissionsCsv(commissions = [], disciples = []) {
  const byId = discipleIndex(disciples);
  return rowsToCsv(COMMISSION_HEADERS, commissions.map(commission => ({
    ...commission,
    discipleName: byId.get(commission.discipleId)?.name || '',
    discipleEmail: byId.get(commission.discipleId)?.email || '',
  })));
}

export function disciplePayoutsCsv(payouts = [], disciples = []) {
  const byId = discipleIndex(disciples);
  return rowsToCsv(PAYOUT_HEADERS, payouts.map(payout => ({
    ...payout,
    discipleName: byId.get(payout.discipleId)?.name || '',
    discipleEmail: byId.get(payout.discipleId)?.email || '',
  })));
}
