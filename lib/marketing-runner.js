// Durable, owner-initiated background campaign runner.
// Only version-2 campaigns explicitly started by an owner are resumed after restart.
import { campaignContent, normEmail } from './marketing.js';

const stamp = () => new Date().toISOString();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export function createCampaignRunner({ read, write, send, blocked, baseUrl, delayMs = 550, log = console }) {
  let busy = false;
  let scheduled = false;

  async function drain() {
    if (busy) return;
    busy = true;
    try {
      for (;;) {
        const data = read();
        const campaign = data.marketing.campaigns.find(c => c.engineVersion === 2 && c.autoRun === true && c.status === 'sending');
        if (!campaign) return;
        const recipient = campaign.recipients.find(r => r.status === 'pending');
        if (!recipient) {
          // A crash during a provider call leaves an ambiguous "sending" record.
          // Never retry it automatically, and never mislabel that campaign completed.
          if (campaign.recipients.some(r => r.status === 'sending' || r.status === 'unknown')) {
            campaign.status = 'needs_review';
            campaign.reviewRequired = true;
          } else {
            campaign.status = 'complete';
            campaign.completedAt = stamp();
          }
          write(data);
          continue;
        }

        let suppressions;
        try {
          suppressions = blocked(data);
          if (!(suppressions instanceof Set)) throw Error('Suppression state unavailable');
        } catch {
          campaign.status = 'paused';
          campaign.lastRunnerError = 'Provider suppression could not be verified; sending stopped.';
          write(data);
          continue;
        }

        const contact = data.marketing.contacts.find(c => c.id === recipient.id);
        const allowed = contact && !contact.archivedAt && contact.permission === 'subscribed' &&
          normEmail(contact.email) === normEmail(recipient.email) &&
          contact.listIds.some(id => campaign.listIds.includes(id)) &&
          !suppressions.has(normEmail(recipient.email));
        if (!allowed) {
          recipient.status = 'skipped';
          recipient.error = 'No longer eligible (permission, audience, address, archive, or provider suppression).';
          recipient.updatedAt = stamp();
          write(data);
          continue;
        }

        const attemptedAt = stamp();
        recipient.status = 'sending';
        recipient.attemptedAt = attemptedAt;
        write(data); // Durable before making the provider call.
        let result;
        try {
          result = await send({
            to: recipient.email,
            content: campaignContent(campaign, contact, campaign.settings, baseUrl),
            key: `campaign-${campaign.id}-${recipient.id}`
          });
        } catch {
          result = { status: 'unknown', error: 'Provider result unknown; review provider logs before retry.' };
        }
        const latest = read();
        const current = latest.marketing.campaigns.find(c => c.id === campaign.id)?.recipients.find(r => r.id === recipient.id);
        if (current && current.status === 'sending' && current.attemptedAt === attemptedAt) {
          Object.assign(current, result, { updatedAt: stamp() });
          write(latest); // Re-read prevents overwriting concurrent orders, consents or pauses.
        }
        if (delayMs > 0) await delay(delayMs);
      }
    } catch (error) {
      log.error?.('Marketing background runner stopped; inspect campaign state before resuming.', error);
      // Never automatically retry in-flight work after a persistence error.
    } finally {
      busy = false;
    }
  }

  function schedule() {
    if (scheduled || busy) return;
    scheduled = true;
    setImmediate(() => {
      scheduled = false;
      void drain();
    });
  }
  return { schedule, isRunning: () => busy };
}
