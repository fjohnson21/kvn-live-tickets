import test from 'node:test';
import assert from 'node:assert/strict';
import { createTicketConfirmationDispatcher, deliverTicketConfirmation, sendTicketConfirmation } from '../lib/email.js';

const orderFixture = () => ({
  id: 'ord_123',
  buyerName: 'Guest',
  buyerEmail: 'guest@example.com',
  amountTotal: 3900,
  tickets: [{
    code: 'KVN-ABC12345',
    productId: 'kingdom-pass',
    ticketName: 'Kingdom Pass',
    apparel: { mode: 'included', name: 'Drop 001 T-shirt', size: 'L' }
  }]
});

const eventFixture = {
  title: 'Kingdom Vibe Live',
  date: '2026-11-21T14:30:00-05:00',
  venue: 'Dennis A. Wicker Civic Center',
  location: 'Sanford, North Carolina',
  products: [{
    id: 'kingdom-pass',
    description: 'RESERVED SEATING: ROWS 19–35 • 5 PM PreWorship • 6 PM Worship Experience.'
  }]
};

test('successful confirmation records the provider message and includes launch details', async () => {
  const order = orderFixture();
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return { ok: true, status: 200, json: async () => ({ id: 'email_123' }) };
  };

  const result = await sendTicketConfirmation({
    order,
    event: eventFixture,
    apiKey: 're_test',
    from: 'KVN Live Tickets <passes@tickets.kvnlive.com>',
    baseUrl: 'https://tickets.example.com',
    fetchImpl,
    now: () => '2026-09-19T15:00:00.000Z'
  });

  assert.deepEqual(result, {
    status: 'sent',
    provider: 'resend',
    messageId: 'email_123',
    sentAt: '2026-09-19T15:00:00.000Z'
  });
  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.body.from, 'KVN Live Tickets <passes@tickets.kvnlive.com>');
  assert.deepEqual(request.body.to, ['guest@example.com']);
  assert.match(request.body.html, /ROWS 19–35/);
  assert.match(request.body.html, /Drop 001 T-shirt.*Size L/s);
  assert.match(request.body.html, /included Drop 001 shirt will ship on October 15, 2026/i);
  assert.match(request.body.html, /Refunds are available only if the event is canceled\./);
  assert.match(request.body.html, /https:\/\/tickets\.example\.com\/api\/tickets\/KVN-ABC12345\/qr\.svg/);
  assert.match(request.body.text, /KVN-ABC12345/);
  assert.match(request.body.text, /included Drop 001 shirt will ship on October 15, 2026/i);
  assert.match(request.body.text, /Ticket QR: https:\/\/tickets\.example\.com\/api\/tickets\/KVN-ABC12345\/qr\.svg/);
});

test('a provider rejection is returned as a failed delivery with a useful reason', async () => {
  const result = await sendTicketConfirmation({
    order: orderFixture(),
    event: eventFixture,
    apiKey: 're_test',
    baseUrl: 'https://tickets.example.com',
    fetchImpl: async () => ({
      ok: false,
      status: 422,
      json: async () => ({ message: 'Invalid from address' })
    }),
    now: () => '2026-09-19T15:00:00.000Z'
  });

  assert.deepEqual(result, {
    status: 'failed',
    provider: 'resend',
    failedAt: '2026-09-19T15:00:00.000Z',
    error: 'Resend rejected the confirmation email (422): Invalid from address'
  });
});

test('an already-sent confirmation is skipped unless resend is explicitly requested', async () => {
  const order = orderFixture();
  order.confirmationEmail = { status: 'sent', messageId: 'email_existing' };
  let requests = 0;

  const result = await sendTicketConfirmation({
    order,
    event: eventFixture,
    apiKey: 're_test',
    baseUrl: 'https://tickets.example.com',
    fetchImpl: async () => { requests += 1; throw new Error('should not send'); }
  });

  assert.deepEqual(result, { status: 'skipped', reason: 'already_sent' });
  assert.equal(requests, 0);
});

test('an explicit resend sends a new message even after prior delivery', async () => {
  const order = orderFixture();
  order.confirmationEmail = { status: 'sent', messageId: 'email_existing' };

  const result = await sendTicketConfirmation({
    order,
    event: eventFixture,
    apiKey: 're_test',
    baseUrl: 'https://tickets.example.com',
    force: true,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ id: 'email_new' }) }),
    now: () => '2026-09-19T16:00:00.000Z'
  });

  assert.equal(result.status, 'sent');
  assert.equal(result.messageId, 'email_new');
});

test('delivery saves the current status and an auditable attempt on the order', async () => {
  const order = orderFixture();

  const result = await deliverTicketConfirmation({
    order,
    event: eventFixture,
    apiKey: 're_test',
    baseUrl: 'https://tickets.example.com',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ id: 'email_saved' }) }),
    now: () => '2026-09-19T17:00:00.000Z'
  });

  assert.equal(result.status, 'sent');
  assert.deepEqual(order.confirmationEmail, {
    status: 'sent', provider: 'resend', messageId: 'email_saved', sentAt: '2026-09-19T17:00:00.000Z'
  });
  assert.deepEqual(order.confirmationEmailAttempts, [order.confirmationEmail]);
});

test('concurrent completion requests share one provider send and both receive the saved result', async () => {
  const dispatch = createTicketConfirmationDispatcher();
  const firstOrder = orderFixture();
  const secondOrder = orderFixture();
  let requests = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const fetchImpl = async () => {
    requests += 1;
    await pending;
    return { ok: true, status: 200, json: async () => ({ id: 'email_once' }) };
  };
  const options = {
    event: eventFixture,
    apiKey: 're_test',
    baseUrl: 'https://tickets.example.com',
    fetchImpl,
    now: () => '2026-09-19T18:00:00.000Z'
  };

  const first = dispatch({ ...options, order: firstOrder });
  const second = dispatch({ ...options, order: secondOrder });
  release();
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(requests, 1);
  assert.equal(firstResult.messageId, 'email_once');
  assert.equal(secondResult.messageId, 'email_once');
  assert.equal(firstOrder.confirmationEmail.messageId, 'email_once');
  assert.equal(secondOrder.confirmationEmail.messageId, 'email_once');
});


test('Disciple welcome email includes the approved 10% commission and payout terms', async () => {
  const { buildDiscipleWelcome } = await import('../lib/email.js');
  const content=buildDiscipleWelcome({disciple:{name:'Briannah Cooper'},link:'https://disciple.kvnlive.com/briannahcooper'});
  assert.match(content.text,/disciple\.kvnlive\.com\/briannahcooper/);
  assert.match(content.text,/Link in bio/i);
  assert.match(content.text,/Add your personal Disciple link to your Instagram\/social bio/i);
  assert.match(content.text,/10% of eligible gross item sales/i);
  assert.match(content.text,/tickets, Kingdom Vibe apparel and Kingdom Market/i);
  assert.match(content.text,/monthly on the 15th/i);
  assert.match(content.text,/no minimum payout/i);
});

test('welcome email uses Kingdom Disciple branding and current attribution terms', async()=>{
  const { buildDiscipleWelcome } = await import('../lib/email.js');
  const content=buildDiscipleWelcome({disciple:{name:'Briannah'},link:'https://disciple.kvnlive.com/briannahcooper'});
  assert.match(content.subject,/Kingdom Disciple/);
  assert.match(content.text,/30-day attribution/i);
});
