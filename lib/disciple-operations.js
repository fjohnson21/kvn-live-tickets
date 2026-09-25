import { upsertDiscipleFromApplication } from './disciple-sync.js';

const eligibleStatuses = new Set(['submitted', 'resubmitted', 'needs_info']);

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function actorFields(actor = {}) {
  return {
    userId: String(actor.id || ''),
    userName: String(actor.name || actor.email || 'Owner')
  };
}

function safeEmailResult(result, now) {
  const status = ['sent', 'failed', 'not_configured'].includes(result?.status) ? result.status : 'failed';
  return {
    status,
    provider: String(result?.provider || 'resend'),
    messageId: String(result?.messageId || ''),
    error: String(result?.error || '').slice(0, 500),
    sentAt: String(result?.sentAt || ''),
    failedAt: String(result?.failedAt || ''),
    attemptId: String(result?.attemptId || ''),
    attemptedAt: now
  };
}

function claimWelcomeAttempt(disciple, deps, now) {
  const existing = disciple.welcomeEmailInFlight;
  if (existing?.attemptId) {
    const age = Date.parse(now) - Date.parse(existing.claimedAt || '');
    if (Number.isFinite(age) && age < 5 * 60 * 1000) throw httpError('A welcome email is already being delivered.', 409);
    return existing.attemptId;
  }
  const attemptId = `disciple-welcome:${disciple.id}:${deps.id('wem')}`;
  disciple.welcomeEmailInFlight = { attemptId, claimedAt: now };
  return attemptId;
}

function finishWelcomeAttempt(store, discipleId, attemptId, delivery, deps, actor, action) {
  const disciple = (store.disciples || []).find(item => item.id === discipleId);
  if (!disciple) throw httpError('Disciple not found while finalizing welcome delivery.', 409);
  const prior = (disciple.welcomeEmailAttempts || []).find(item => item.attemptId === attemptId);
  if (prior) return { disciple, welcomeEmail: prior };
  const welcomeEmail = recordWelcomeAttempt(disciple, { ...delivery, attemptId }, { id: deps.id, now: deps.now });
  if (disciple.welcomeEmailInFlight?.attemptId === attemptId) delete disciple.welcomeEmailInFlight;
  addAudit(store, deps, actor, action || (welcomeEmail.status === 'sent' ? 'disciple.welcome_sent' : 'disciple.welcome_failed'), 'disciple', disciple.id, {
    status: welcomeEmail.status,
    messageId: welcomeEmail.messageId,
    attemptId,
    error: welcomeEmail.error
  });
  return { disciple, welcomeEmail };
}

function addAudit(store, deps, actor, action, entityType, entityId, meta = {}) {
  store.auditLogs ||= [];
  const createdAt = deps.now();
  store.auditLogs.unshift({
    id: deps.id('log'),
    ...actorFields(actor),
    action,
    entityType,
    entityId,
    meta,
    createdAt
  });
}

export function recordWelcomeAttempt(disciple, result, deps = {}) {
  const now = (deps.now || (() => new Date().toISOString()))();
  const attempt = safeEmailResult(result, now);
  disciple.welcomeEmailAttempts ||= [];
  disciple.welcomeEmailAttempts.push(attempt);
  disciple.welcomeEmail = attempt;
  disciple.updatedAt = now;
  return attempt;
}

export async function approveDiscipleApplication(store, input, deps = {}) {
  const now = deps.now || (() => new Date().toISOString());
  const makeId = deps.id;
  const persist = deps.persist || (() => {});
  if (typeof makeId !== 'function') throw new Error('id generator is required.');
  const application = (store.discipleApplications || []).find(item => item.id === input.applicationId || item.applicationReference === input.applicationId);
  if (!application) throw httpError('Application not found.', 404);

  const existing = (store.disciples || []).find(item => item.id === application.approvedDiscipleId || item.sourceApplicationReference === application.applicationReference);
  if (application.status === 'approved' && existing) {
    const trackingUrl = `https://disciple.kvnlive.com/${encodeURIComponent(existing.handle)}`;
    return { application, disciple: existing, trackingUrl, welcomeEmail: existing.welcomeEmail || null, created: false };
  }
  if (!eligibleStatuses.has(application.status)) throw httpError('Application is not approval-eligible.', 409);
  if (application.agreementVersion !== '2.2') throw httpError('Applicant must accept the current Kingdom Disciple Agreement v2.2 before approval.', 409);

  const result = upsertDiscipleFromApplication(store, { ...application, applicationStatus: 'approved', defaultCommissionPercent: 10 }, { id: makeId, now });
  const disciple = result.disciple;
  disciple.defaultCommissionPercent = 10;
  const approvedAt = now();
  application.status = 'approved';
  application.approvedAt = approvedAt;
  application.approvedDiscipleId = disciple.id;
  application.updatedAt = approvedAt;
  addAudit(store, { id: makeId, now }, input.actor, 'disciple.approve', 'disciple_application', application.id, {
    applicationReference: application.applicationReference,
    discipleId: disciple.id
  });
  const attemptId = claimWelcomeAttempt(disciple, { id: makeId }, approvedAt);
  persist(store);

  const trackingUrl = `https://disciple.kvnlive.com/${encodeURIComponent(disciple.handle)}`;
  let delivery;
  try {
    delivery = await deps.sendWelcome({ disciple, link: trackingUrl, idempotencyKey: attemptId });
  } catch (error) {
    delivery = { status: 'failed', provider: 'resend', failedAt: now(), error: `Welcome email delivery failed: ${error.message}` };
  }
  const latest = typeof deps.reload === 'function' ? deps.reload() : store;
  const finalized = finishWelcomeAttempt(latest, disciple.id, attemptId, delivery, { id: makeId, now }, input.actor);
  persist(latest);
  const latestApplication = (latest.discipleApplications || []).find(item => item.id === application.id) || application;
  return { application: latestApplication, disciple: finalized.disciple, trackingUrl, welcomeEmail: finalized.welcomeEmail, created: result.created };
}

export async function resendDiscipleWelcome(store, input, deps = {}) {
  const now = deps.now || (() => new Date().toISOString());
  const persist = deps.persist || (() => {});
  const disciple = (store.disciples || []).find(item => item.id === input.discipleId);
  if (!disciple) throw httpError('Disciple not found.', 404);
  const claimedAt = now();
  const attemptId = claimWelcomeAttempt(disciple, { id: deps.id }, claimedAt);
  persist(store);
  const trackingUrl = `https://disciple.kvnlive.com/${encodeURIComponent(disciple.handle)}`;
  let delivery;
  try {
    delivery = await deps.sendWelcome({ disciple, link: trackingUrl, idempotencyKey: attemptId });
  } catch (error) {
    delivery = { status: 'failed', provider: 'resend', failedAt: now(), error: `Welcome email delivery failed: ${error.message}` };
  }
  const latest = typeof deps.reload === 'function' ? deps.reload() : store;
  const finalized = finishWelcomeAttempt(latest, disciple.id, attemptId, delivery, { id: deps.id, now }, input.actor, 'disciple.welcome_resent');
  persist(latest);
  return { disciple: finalized.disciple, trackingUrl, welcomeEmail: finalized.welcomeEmail };
}

export function setDiscipleActiveStatus(store, input, deps = {}) {
  const now = deps.now || (() => new Date().toISOString());
  const persist = deps.persist || (() => {});
  const disciple = (store.disciples || []).find(item => item.id === input.discipleId);
  if (!disciple) throw httpError('Disciple not found.', 404);
  const status = input.active ? 'active' : 'inactive';
  if (disciple.status === status) return { disciple, changed: false };
  disciple.status = status;
  disciple.updatedAt = now();
  if (input.active) disciple.reactivatedAt = disciple.updatedAt;
  else disciple.deactivatedAt = disciple.updatedAt;
  addAudit(store, { id: deps.id, now }, input.actor, input.active ? 'disciple.reactivate' : 'disciple.deactivate', 'disciple', disciple.id, {
    reason: String(input.reason || '').slice(0, 500)
  });
  persist(store);
  return { disciple, changed: true };
}

export async function reviewDiscipleApplication(store, input, deps = {}) {
  const now = deps.now || (() => new Date().toISOString());
  const persist = deps.persist || (() => {});
  const application = (store.discipleApplications || []).find(item => item.id === input.applicationId || item.applicationReference === input.applicationId);
  if (!application) throw httpError('Application not found.', 404);
  if (!['needs_info', 'rejected'].includes(input.status)) throw httpError('Invalid review status.', 400);
  const reason = String(input.reason || '').trim();
  if (!reason) throw httpError('An administrator reason is required.', 400);
  const safeReason = reason.slice(0, 1000);
  const sameDecision = application.status === input.status && application.reviewOperation?.status === input.status && application.reviewOperation?.reason === safeReason;
  if (!sameDecision && !eligibleStatuses.has(application.status)) throw httpError('Application is not review-eligible.', 409);
  let operation = application.reviewOperation;
  if (!sameDecision) {
    const updatedAt = now();
    const operationId = deps.id('review');
    operation = { id: operationId, status: input.status, reason: safeReason, decidedAt: updatedAt, noticeIdempotencyKey: `disciple-review:${application.id}:${operationId}` };
    application.status = input.status;
    application.reviewReason = safeReason;
    application.reviewOperation = operation;
    application.updatedAt = updatedAt;
    addAudit(store, { id: deps.id, now }, input.actor, `disciple.application_${input.status}`, 'disciple_application', application.id, { reason: safeReason, operationId });
    persist(store);
  }
  const alreadySent = (application.reviewNotices || []).find(item => item.reviewOperationId === operation.id && item.status === 'sent');
  if (alreadySent) return { application, notification: alreadySent, decisionCreated: false };
  let delivery;
  try {
    delivery = await deps.sendNotice({ application, status: input.status, reason: safeReason, idempotencyKey: operation.noticeIdempotencyKey });
  } catch (error) {
    delivery = { status: 'failed', provider: 'resend', error: `Application notice delivery failed: ${error.message}` };
  }
  const latest = typeof deps.reload === 'function' ? deps.reload() : store;
  const current = (latest.discipleApplications || []).find(item => item.id === application.id) || application;
  const notification = safeEmailResult(delivery, now());
  current.reviewNotices ||= [];
  current.reviewNotices.push({ ...notification, reviewStatus: input.status, reason: safeReason, reviewOperationId: operation.id });
  addAudit(latest, { id: deps.id, now }, input.actor, notification.status === 'sent' ? 'disciple.application_notice_sent' : 'disciple.application_notice_failed', 'disciple_application', current.id, { status: notification.status, messageId: notification.messageId, error: notification.error });
  persist(latest);
  return { application: current, notification, decisionCreated: !sameDecision };
}
