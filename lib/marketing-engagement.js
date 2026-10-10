import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { Webhook } from 'svix';

const types = new Set(['sent','delivered','delivery_delayed','opened','clicked','bounced','complained','failed','suppressed']);
const blockedTypes = new Set(['bounced','complained','suppressed']);
const norm = value => String(value || '').trim().toLowerCase();
const failure = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\s\x00-\x1f]/.test(value);
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
function normalizeEvent(id, payload) {
  if (!identifier(id) || !payload || typeof payload.type !== 'string') throw failure('Invalid event.');
  const type = payload.type.startsWith('email.') ? payload.type.slice(6) : '';
  if (!types.has(type)) return null;
  if (!identifier(payload.data?.email_id) || !timestamp(payload.created_at)) throw failure('Invalid event.');
  // Keep no recipient addresses, message bodies, IPs, user agents or token-bearing URLs.
  const event = { id, messageId: payload.data.email_id, type, occurredAt: new Date(payload.created_at).toISOString() };
  if (type === 'clicked' && typeof payload.data.click?.link === 'string') {
    try { const url = new URL(payload.data.click.link); if (['https:','http:'].includes(url.protocol)) event.linkOrigin = url.origin; } catch { /* Event still establishes a click. */ }
  }
  return event;
}
function recipientEngagement(events = []) {
  const observed = {};
  for (const e of events) {
    const old = observed[e.type];
    observed[e.type] = { count: (old?.count || 0) + 1, firstAt: old && old.firstAt < e.occurredAt ? old.firstAt : e.occurredAt, lastAt: old && old.lastAt > e.occurredAt ? old.lastAt : e.occurredAt };
  }
  // Negative outcomes do not disappear when an earlier event arrives late.
  const delivery = ['complained','bounced','suppressed','failed','delivered','delivery_delayed'].find(type => observed[type]) || 'unconfirmed';
  return { delivery, observed, events: events.slice().sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)||a.id.localeCompare(b.id)) };
}
export function createEngagementStore({ dataDir }) {
  // Single Node process, same deployment constraint as store.js. Never write store.json.
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'marketing-engagement.ndjson');
  if (!fs.existsSync(file)) { const fd = fs.openSync(file,'wx',0o600); fs.fsyncSync(fd); fs.closeSync(fd); const dir = fs.openSync(dataDir,'r'); try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); } }
  fs.chmodSync(file, 0o600);
  const byId = new Map(), byMessage = new Map();
  let healthy = true, firstReceivedAt = null, lastReceivedAt = null;
  const index = event => {
    byId.set(event.id, event);
    if (!byMessage.has(event.messageId)) byMessage.set(event.messageId, []);
    byMessage.get(event.messageId).push(event);
    firstReceivedAt = !firstReceivedAt || event.receivedAt < firstReceivedAt ? event.receivedAt : firstReceivedAt;
    lastReceivedAt = !lastReceivedAt || event.receivedAt > lastReceivedAt ? event.receivedAt : lastReceivedAt;
  };
  const contents = fs.readFileSync(file);
  const end = contents.lastIndexOf(10) + 1;
  // An incomplete final append was never acknowledged. Resend can safely retry it.
  const lines = contents.subarray(0,end).toString('utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    const e = JSON.parse(line);
    if (!identifier(e.id) || !identifier(e.messageId) || !types.has(e.type) || !timestamp(e.occurredAt) || !timestamp(e.receivedAt) || byId.has(e.id)) throw Error('Invalid engagement journal; restore or repair before starting.');
    index(e);
  }
  if (end !== contents.length) {const fd=fs.openSync(file,'r+');try {fs.ftruncateSync(fd,end);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
  return {
    record(id, payload) {
      if (!healthy) throw Error('Engagement storage unavailable.');
      const event = normalizeEvent(id,payload);
      if (!event) return { ignored: true };
      const previous = byId.get(id);
      if (previous) {
        const { receivedAt, ...original } = previous;
        if (JSON.stringify(original) !== JSON.stringify(event)) throw failure('Conflicting event identifier.',409);
        return { duplicate: true };
      }
      event.receivedAt = new Date().toISOString();
      const fd = fs.openSync(file,'a',0o600), size = fs.fstatSync(fd).size;
      try { fs.writeFileSync(fd, JSON.stringify(event)+'\n'); fs.fsyncSync(fd); }
      catch (error) { try { fs.ftruncateSync(fd,size); fs.fsyncSync(fd); } catch { healthy=false; } throw error; }
      finally { fs.closeSync(fd); }
      index(event); // Index only after durable storage; retries cannot inflate counts.
      return { received: true };
    },
    status() { return { firstReceivedAt, lastReceivedAt, eventCount: byId.size }; },
    blockedEmails(data) {
      if (!healthy) throw Error('Engagement storage unavailable.');
      const blocked = new Set();
      for (const c of data.marketing?.campaigns || []) for (const r of c.recipients || []) {
        if ((byMessage.get(r.messageId)||[]).some(e=>blockedTypes.has(e.type))) blocked.add(norm(r.email));
      }
      for (const c of data.abandonedCarts || []) if (c.recoveryEmail?.to && (byMessage.get(c.recoveryEmail.messageId)||[]).some(e=>blockedTypes.has(e.type))) blocked.add(norm(c.recoveryEmail.to));
      return blocked;
    },
    report(campaign) {
      const recipients = (campaign.recipients || []).map(r=>({...r,engagement:recipientEngagement(byMessage.get(r.messageId))}));
      const summary = { total:recipients.length, accepted:0, delivered:0, opened:0, clicked:0, bounced:0, complained:0, failed:0, suppressed:0, delayed:0, withoutEvents:0, missingMessageId:0 };
      let deliveredOpened=0, deliveredClicked=0;
      for (const r of recipients) {
        const o = r.engagement.observed;
        if (r.status==='accepted' || o.sent) summary.accepted++;
        for (const type of ['delivered','opened','clicked','bounced','complained','failed','suppressed']) if(o[type]) summary[type]++;
        if(o.delivery_delayed) summary.delayed++;
        if(!r.engagement.events.length) summary.withoutEvents++;
        if(!r.messageId) summary.missingMessageId++;
        if(o.delivered&&o.opened) deliveredOpened++;
        if(o.delivered&&o.clicked) deliveredClicked++;
      }
      // Rates use explicit cohorts, never infer delivery from an open/click or acceptance.
      const acceptedDelivered = recipients.filter(r=>(r.status==='accepted'||r.engagement.observed.sent)&&r.engagement.observed.delivered).length;
      summary.deliveryRate=summary.accepted?acceptedDelivered/summary.accepted*100:null;
      summary.openRateEstimate=summary.delivered?deliveredOpened/summary.delivered*100:null;
      summary.clickRate=summary.delivered?deliveredClicked/summary.delivered*100:null;
      return { summary, recipients };
    }
  };
}
export function registerEngagementWebhook(app,{store,env=process.env}) {
  const raw=express.raw({type:'application/json',limit:'256kb'});
  app.post('/api/webhooks/resend/marketing',(req,res,next)=>raw(req,res,error=>error?res.status(error.status===413?413:400).json({error:'Invalid webhook body.'}):next()),(req,res)=>{
    res.set('Cache-Control','no-store');
    if (!env.RESEND_MARKETING_WEBHOOK_SECRET) return res.status(503).json({error:'Webhook not configured.'});
    let payload;
    try {
      if (!Buffer.isBuffer(req.body)) throw Error('Raw JSON required.');
      payload = new Webhook(env.RESEND_MARKETING_WEBHOOK_SECRET).verify(req.body.toString('utf8'),req.headers);
    } catch { return res.status(400).json({error:'Invalid webhook signature or payload.'}); }
    try { return res.json(store.record(req.headers['svix-id'],payload)); }
    catch (error) { return res.status(error.statusCode||503).json({error:error.statusCode?error.message:'Unable to persist event; retry required.'}); }
  });
}
